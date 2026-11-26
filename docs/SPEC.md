# Listing Photo-vs-Text Mismatch Detector: build spec and pre-registered gate
Version 1.2 (revised after design reviews 1 and 2; still written before any measurement). Companion to [PRD.md](PRD.md) and [DATA-PLAN.md](DATA-PLAN.md). Review responses and amendments are in [AMENDMENTS.md](AMENDMENTS.md), which is outside the frozen region.

Built with AI coding agents; Anirudh wrote the spec, gates and reviews.

An implementer should be able to build the CLI, adapters, baseline, labelling page, evaluation, tests, scripts and both demo pages from this document and DATA-PLAN.md without making architectural decisions. MUST means required. Where a value is given, use that value.

<!-- FROZEN:BEGIN -->
**Pre-registration.** Sections 1 to 15 of this file (the text between the `FROZEN:BEGIN` and `FROZEN:END` markers) and the numeric parameters in DATA-PLAN.md (sizes, seeds, planting rules, freeze procedure) are fixed before any measurement. They MUST NOT be changed to fit a result.
- **Stage 0 (`gate`) is the timestamped record.** Before `fetch`, `scripts/freeze.cjs --stage gate` writes the SHA-256 of the frozen region of this file (hashed from the line after `FROZEN:BEGIN` to the line before `FROZEN:END`, CRLF to LF), of DATA-PLAN.md, and of `src/gate.cjs`, with a UTC timestamp, into `eval/freeze.json`. It refuses to run unless the owner's `gate` approval exists in `eval/approvals.json` (section 10.6). The owner copies the printed entry into `eval/HISTORY.md` and commits it (see the next bullet). Creating or pushing to a remote is never done by an agent (section 1.1).
- **Freeze evidence, stages 0 to 3 (local git).** The owner runs `git init` once in the project root, before stage 0; the repository has no remote and is never pushed. Each of the four stages is one commit made by `scripts/freeze.cjs --stage gate|data|method|labels`. The commit message is `freeze stage <name>: <the hashes printed for that stage>` and the commit contains `eval/freeze.json` (tracked, so it is not in `.gitignore`). Because `data/` is ignored, the held-out manifest and planting-log hashes live in the commit message and in `eval/freeze.json`, not as files. Before it writes anything, `freeze.cjs --stage N` refuses (exit 2) unless (a) the working tree is clean (`git status --porcelain` is empty; ignored files are not counted), so the code and documents it hashes are exactly the committed ones, (b) for N > 0 the previous stage's commit exists, is an ancestor of `HEAD` and its message starts with `freeze stage <previous name>:`, and (c) for N > 0 the committed `eval/HISTORY.md` contains the previous stage's commit id. The script runs `git` with fixed arguments (no shell) and passes a fixed author name and e-mail on the command line, so it does not depend on the owner's git configuration. After each stage the owner pastes the printed entry (it includes the commit id) into `eval/HISTORY.md` and commits that file before the next stage. **Agents MUST NOT run `scripts/freeze.cjs`, `git init` or `git commit`** (section 1.1 rule 4); the owner does. Limit, stated now: a local repository can be rewritten by whoever holds the files, and commit dates are not third-party timestamps. The evidence makes backdating detectable only by comparison with the owner's dated `eval/HISTORY.md` lines; it does not prove it impossible. The owner may additionally e-mail each printed entry to himself (optional, not required).
- **Amendments.** Any edit to the frozen region after stage 0 is an amendment. It is recorded in `docs/AMENDMENTS.md` (outside the hash) with date, reason, the owner's approval and which numbers become post-hoc. `freeze.cjs --stage gate --amend` then writes a new dated stage-0 entry; counted runs are refused until it exists. Every number produced after an amendment is labelled post-hoc in every report.
- **Where things live.** The review responses and the amendment log are in `docs/AMENDMENTS.md` so that recording them never changes the frozen hash.

## 1. Goals, stack and constraints
- **Goal.** Check whether a listing's main image contradicts its title and structured attributes, per attribute, with a VLM; compare against a non-AI baseline; measure the natural mismatch rate and its patterns on a public catalog sample. Provide two demo modes: a precomputed Results page and a bring-your-own-key (BYOK) Live page (section 14b).
- **Technology stack (locked once this design is approved).**
  - Node.js 22 or newer (the installed version is 24.x), CommonJS for Node code (`.cjs` files, `"type": "commonjs"`), run from PowerShell on Windows. Built-in `node:test` for tests. Global `fetch` for HTTPS. `zlib` and `crypto` built-ins.
  - One third-party package: `jpeg-js` (pure JavaScript JPEG decoder), pinned to an exact version in `package.json`, with `package-lock.json` committed and included in the code hash (section 10.1). It is used only by the colour baseline (section 5.1). If `npm install` cannot fetch it, STOP and report to the owner; do not drop the baseline and do not write a custom decoder.
  - No Python. No native modules. No VLM vendor SDKs (adapters use `fetch`).
  - Static browser pages (labelling page, Results page, Live page): plain HTML, CSS and classic JavaScript, no framework, no build step beyond `scripts/build-core.cjs` (section 2.3).
  - **Shared core.** Logic used by both the CLI and the Live page (prompt building, output parsing, effective verdict, Gemini request construction, live input validation, key redaction) lives in `src/core/*.js` as classic-script UMD files that set `window.ListingCore` in a browser and `module.exports` in Node. Browsers refuse module scripts from file:// origins, so there are no ES modules. The Node CLI `require`s the same files; nothing in them is duplicated elsewhere.
- **Data.** Amazon Berkeley Objects (ABO), listing metadata and the smallest image size only, CC BY-NC 4.0, non-commercial portfolio use. Details, stop rule and alternatives in DATA-PLAN sections 1 to 3 (alternatives in 3.6). No scraping of any website. No Amazon-internal data, systems or credentials.
- **Secrets.** The VLM API key is the owner's personal key, stored as a user-level environment variable (section 11). It is never printed, logged, cached or written to a file. In the Live page the visitor's own key is handled under section 14b.
- **Network use.** Allowed only for (a) downloading ABO files from the dataset host (allowlist: `amazon-berkeley-objects.s3.amazonaws.com`), (b) calls from the CLI to the one selected VLM provider's API host (allowlist: `api.openai.com`, `api.anthropic.com`, `generativelanguage.googleapis.com`), (c) `npm install` of `jpeg-js`, (d) calls from the Live page, in the visitor's browser, to `https://generativelanguage.googleapis.com` only. The labelling page and the Results page make no network requests.
- **Not a production system.** No server, queue, database or deployment. No claim of production use, users or adoption anywhere.

### 1.1 Agent conduct rules (operative constraints for AI coding agents working in this repository)
These bind every agent step, in addition to the design.
1. **No publishing.** Agents MUST NOT run `git push`, `gh`, `npm publish`, create a Git remote, a repository, a Pages site or a deployment, or upload any file to any host. Only the owner runs `git init` and `git commit` for the local freeze repository (section pre-registration, freeze evidence); it never has a remote. Packaging and publishing are later owner decisions. Before any such step, `npm test` (which runs G09) and `denylist.cjs` MUST pass, and a documented security review of the Live page (what it sends, to whom, with which key handling and CSP) MUST be recorded in `eval/HISTORY.md`. Files under `.agents/` are private, are listed in `.gitignore` and are excluded from every package and from the scans.
2. **No labels by agents.** Agents MUST NOT create, edit, pre-fill, infer or "example-fill" any file under `data/labels/` or any file named `labels-*.json` or `*.labels.json`. Owner labels are produced only by the owner in the labelling page. No VLM, baseline, planting or mock output may stand in for an owner label. **Fixture carve-out:** fixture label files are allowed only under `test/fixtures/`, must be named `*.fixture-labels.json`, must contain `"synthetic": true`, and no fixture may contain an id from any real manifest. A test asserts that no file outside `test/fixtures/` matches `labels-*.json`, `*.labels.json` or `*.fixture-labels.json` except the owner's files under `data/labels/`, and that no fixture contains a real ABO id (the id check runs only when the manifests exist). **Labelling is a hard prerequisite for counted runs (section 10.2): there is no counted run, planted results included, until `natural-heldout` is fully labelled and frozen at stage 3.** Before that, the Results page and any report show natural results as "not measured".
3. **No held-out access.** Agents MUST NOT open the held-out manifests, the held-out planting log, held-out images, held-out verdict files or held-out results during development (section 10.4). Held-out files live under `data/heldout/` and `eval/results-private/heldout-*`. Images are stored by content hash in one folder for every set (DATA-PLAN 7), so a held-out image path reveals only a hash. Every script prints, for held-out sets, only counts per set, per category and per condition, never ids, titles, attribute values or verdicts; a test captures stdout and stderr of `build-sample` and `plant` on fixtures and asserts that no fixture held-out id or title appears.
4. **No owner-only scripts.** Agents MUST NOT run `scripts/set-vlm-key.ps1`, `scripts/approve.cjs` or `scripts/freeze.cjs`, and MUST NOT read, print or request the key.
5. **No sending data.** Agents MUST NOT make a real-provider call except as the owner instructs in the session (smoke or counted run, section 10).

## 2. Architecture
### 2.1 File layout (project root `listing-mismatch/`)
```
package.json                 private; dependency jpeg-js (exact version); npm-script aliases
package-lock.json            committed; part of the code hash
.gitignore                   data/, eval/cache/, eval/results-private/, eval/prices.json, eval/cost.json, node_modules/, .denylist.local, .agents/ (eval/freeze.json and eval/HISTORY.md are tracked)
.denylist.local              owner's private terms (never committed, never packaged)
README.md                    carries the honesty sentence (section 11.4)
docs/PRD.md  SPEC.md  DATA-PLAN.md  AMENDMENTS.md    design phase; AMENDMENTS.md holds amendments and review responses (not hashed)
docs/DATA-SOURCES.md  EVAL-REPORT.md  CASE-STUDY.md  generated or written later
src/core/prompt.js           builds system and userText from a listing; exports PROMPT_ID; classic UMD
src/core/parse.js            strict parsing and validation of model output (section 4.4); classic UMD
src/core/verdict.js          effective verdict at tau, per-listing summary counts; classic UMD
src/core/gemini-request.js   builds the Gemini generateContent URL path, headers (key supplied by caller) and body; parses the response; classic UMD
src/core/live-input.js       Live page input validation, CSV/JSON schema, batch cap, CSV export with formula neutralisation, key redaction, demo mock; classic UMD
src/core/template.generated.js   the text of src/prompts/check-v1.txt embedded as a string; written by scripts/build-core.cjs
src/prompts/check-v1.txt     the prompt template (hashed at freeze)
src/secrets.cjs              only reader of key env vars; returns key to adapters; exports redact(str)
src/log.cjs                  the only logger; passes every string through secrets.redact
src/hash.cjs                 sha256 of files with CRLF to LF and BOM stripped; sha256 of strings
src/prng.cjs                 mulberry32 seeded PRNG, shuffle, pick
src/stats.cjs                wilson, kappa, bootstrap, quantile
src/colour.cjs               sRGB to CIELAB, colour-family table access
src/families.json            colour families, Lab prototypes, near-set table, name-to-family map (DATA-PLAN 6.2)
src/lexicon.json             item-type display names, confusable pairs, material families, pattern families
src/sets.cjs                 the only loader of manifests, labels and planting logs; refuses held-out sets without a runner capability (section 10.4)
src/sample.cjs               ABO parsing, eligibility, dedupe, stratified selection, split assignment
src/plant.cjs                planting procedure (DATA-PLAN 6)
src/prompt.cjs  parse.cjs    one-line re-exports of src/core/prompt.js and parse.js; no logic
src/vlm/client.cjs           provider selection, retries, concurrency, cache, timeouts
src/vlm/openai.cjs  anthropic.cjs  gemini.cjs  mock.cjs   (gemini.cjs wraps src/core/gemini-request.js with fetch)
src/baseline/colour.cjs      colour-histogram baseline
src/baseline/text.cjs        text-only consistency baseline
src/metrics.cjs              confusion counts, precision/recall/F1, rates, per-slice tables
src/gate.cjs                 gate thresholds and evaluation (must equal section 9 table)
src/freeze.cjs               freeze.json read/verify, approvals check, run-budget accounting
src/denylist-rules.cjs       the scan rules as regular expressions (so docs describe them in words, section 11.2)
src/report.cjs               EVAL-REPORT.md and demo/results.js rendering
scripts/fetch-abo.cjs        download and extract ABO files (allowlisted host)
scripts/build-sample.cjs     inventory, selection, splits, manifests
scripts/plant.cjs            build planted sets
scripts/build-labelling.cjs  writes labelling/tasks.js from the natural manifests
scripts/build-core.cjs       writes src/core/template.generated.js and demo/core.bundle.js (section 2.3)
scripts/freeze.cjs           writes eval/freeze.json and prints the entry text for HISTORY.md
scripts/approve.cjs          owner-only: records dated approvals in eval/approvals.json (section 10.6)
scripts/listing-check.cjs    VLM or baseline run over a set (section 7)
scripts/eval.cjs             metrics, gate, report
scripts/denylist.cjs         deny-list, secret, banned-phrase and honesty-sentence scan (module and CLI)
scripts/set-vlm-key.ps1      stores the API key as a user-level env var (section 11.1)
labelling/index.html  labelling.js  labelling.css  tasks.js (generated)
demo/index.html  demo.js  demo.css  results.js (generated)  examples/ (<= 12 thumbnails, optional)      Results page, connect-src 'none'
demo/live.html  live.js  live.css  core.bundle.js (generated)                                           Live BYOK page (section 14b)
data/                        raw ABO files, images, dev manifests (never committed or packaged by default)
data/heldout/                held-out manifests, held-out planting log, held-out image-hash file (section 10.4)
eval/HISTORY.md              hand-written run log
eval/freeze.json             generated by scripts/freeze.cjs
eval/approvals.json          owner approvals written by scripts/approve.cjs
eval/runs.jsonl              append-only machine log of every real-provider run
eval/cache/                  VLM response cache (gitignored)
eval/results/metrics.json    generated, deterministic, contains no cost figures
eval/cost.json              generated, cost and latency figures (gitignored; reported in EVAL-REPORT.md)
test/*.test.cjs              node:test files (section 13)
test/fixtures/               ten synthetic listings with tiny generated PNG/JPEG images and recorded provider responses; any label files here carry "synthetic": true
```
`data/` layout is in DATA-PLAN section 7.

### 2.2 package.json scripts
```json
{
  "scripts": {
    "test": "node --test \"test/**/*.test.cjs\"",
    "fetch": "node scripts/fetch-abo.cjs",
    "sample": "node scripts/build-sample.cjs",
    "plant": "node scripts/plant.cjs",
    "build-core": "node scripts/build-core.cjs",
    "freeze": "node scripts/freeze.cjs",
    "check": "node scripts/listing-check.cjs",
    "eval": "node scripts/eval.cjs",
    "scan": "node scripts/denylist.cjs"
  }
}
```
There is no `publish`, `release`, `deploy` or `push` script, and none may be added.

### 2.3 Shared core build
`scripts/build-core.cjs` (a) embeds `src/prompts/check-v1.txt` as a string in `src/core/template.generated.js` (a page cannot read a `.txt` file under file://), and (b) concatenates `src/core/*.js` and the template file into `demo/core.bundle.js`, which defines `window.ListingCore`. It also writes the pinned model identifier from `eval/freeze.json` (or `null` before stage 2) as `ListingCore.PINNED_MODEL`. A test rebuilds the bundle and fails if the committed files differ. The prompt text, `parse` and the Gemini request builder exist only under `src/core/` and `src/prompts/`.

## 3. Data model
### 3.1 Listing record (one record of a manifest; a manifest is a JSON array with one record per line, DATA-PLAN 7; the comments in the example are illustrative and not valid JSON)
```json
{
  "id": "B07XXXXXXX",            // ABO item_id; unique across all sets
  "set": "planted-heldout",       // one of the four set names in DATA-PLAN 4
  "category": "SHOES",            // ABO product_type value
  "title": "string",              // as shown to the model (rewritten if planted)
  "attributes": { "colour": "Navy Blue", "item_type": "shoes", "material": "Leather", "pattern": null, "pack_count": null },
  "image": "images/ab/ab12cd34.jpg",   // path relative to data/
  "imageSha256": "hex",
  "planted": null                 // or { "attribute": "colour", "from": "Navy Blue", "to": "Red", "stratum": "far" }
}
```
- Attribute keys are exactly `colour`, `item_type`, `material`, `pattern`, `pack_count`. A key with `null` is not evaluated for that listing and is not sent to the model.
- `item_type` always exists (it is a selection requirement). `colour` always exists. The others are optional.
- For planted listings the original values are stored only under `planted.from`. The `title` and `attributes` are the swapped versions (DATA-PLAN 6.1).
- The ground truth of a planted listing is derived only from `planted`. Nothing else may supply it.

### 3.2 Verdict record (output of any checker)
```json
{
  "id": "B07XXXXXXX",
  "checker": "vlm|baseline-colour|baseline-text",
  "provider": "openai|anthropic|gemini|mock|none",
  "model": "string",
  "promptHash": "hex",
  "attributes": {
    "colour": { "verdict": "match|mismatch|cannot_tell", "confidence": 0.0, "reason": "string", "flags": [] }
  },
  "usage": { "inputTokens": 0, "outputTokens": 0 },
  "latencyMs": 0,
  "error": null
}
```
- `flags` may contain `parse_error`, `missing`, `provider_error`, `low_confidence_mismatch`. For a failed call all requested attributes get `cannot_tell`, confidence 0 and the flag.
- **Effective verdict** (used by all metrics): if `verdict` is `mismatch` and `confidence` is below the operating threshold `tau`, the effective verdict is `cannot_tell` (and `low_confidence_mismatch` is added). Otherwise it equals `verdict`. `tau` is chosen on dev data only (section 8.2) and frozen. The baselines have confidence 1.0 and are unaffected by `tau`.

## 4. VLM client
### 4.1 Selection and environment variables
| Variable | Required | Meaning |
|---|---|---|
| `LISTING_VLM_PROVIDER` | no | `gemini` (default), `mock`, or the optional `openai` / `anthropic`. Also accepted as `--provider`; the flag wins. Default is `gemini` for real runs. |
| `LISTING_VLM_MODEL` | for any real run | Exact model identifier string, used unchanged in every request. There is no default, so the model can never change silently. Must pass the pinning rule in section 10.2. Also `--model`. |
| `OPENAI_API_KEY` | provider `openai` | Read only by `src/secrets.cjs`. |
| `ANTHROPIC_API_KEY` | provider `anthropic` | Same. |
| `GEMINI_API_KEY` | provider `gemini` | Same. |

Validation: unknown provider, missing model, or missing key for a real provider exits with code 1 and a message naming the missing variable (never a value). `mock` needs no key or model.

### 4.2 Adapter interface
```js
// src/vlm/<name>.cjs
async function check({ imageBytes, mime, userText, system, model, timeoutMs, maxOutputTokens }) {
  // returns { rawText, usage: { inputTokens, outputTokens }, latencyMs }
  // throws ProviderError { kind: 'auth'|'bad_request'|'rate_limit'|'server'|'timeout'|'network'|'blocked', status }
}
```
Every adapter: temperature 0, `maxOutputTokens` 600, one image per request, request timeout 60,000 ms, API key sent only in a header, error messages built from `kind` and `status` only (never request or response headers, never the key).
- **OpenAI (optional, secondary):** `POST https://api.openai.com/v1/chat/completions`, header `Authorization: Bearer <key>`; body has `model`, `temperature: 0`, `max_completion_tokens`, `response_format: {"type":"json_object"}`, messages: a `system` message and a `user` message whose content is a text part plus an `image_url` part with a `data:<mime>;base64,<bytes>` URL and `detail: "low"`. Output: `choices[0].message.content`. Usage: `usage.prompt_tokens`, `usage.completion_tokens`.
- **Anthropic (optional, secondary):** `POST https://api.anthropic.com/v1/messages`, headers `x-api-key`, `anthropic-version: 2023-06-01`, `content-type: application/json`; body has `model`, `max_tokens`, `temperature: 0`, `system`, and one user message with an `image` block (`source: {type: "base64", media_type, data}`) followed by a `text` block. Output: concatenated `text` blocks of `content`. Usage: `usage.input_tokens`, `usage.output_tokens`.
- **Gemini (primary, owner decision: personal Google account, key from Google AI Studio):** `POST https://generativelanguage.googleapis.com/v1beta/models/<model>:generateContent`, header `x-goog-api-key`; body has `systemInstruction`, one `contents` entry with an `inline_data` part (`mime_type`, `data`) and a text part, and `generationConfig: {temperature: 0, maxOutputTokens, responseMimeType: "application/json"}`. Output: `candidates[0].content.parts[*].text` joined. A `promptFeedback.blockReason` or a candidate with `finishReason: SAFETY` is `ProviderError kind: 'blocked'`. Usage: `usageMetadata.promptTokenCount`, `candidatesTokenCount`.
- **Mock:** no network. Section 4.6.
- **Shared request builder.** The Gemini URL path, body and response parsing are built by `src/core/gemini-request.js`, used by both `src/vlm/gemini.cjs` (Node `fetch`) and the Live page (section 14b), so the live request equals the evaluated request. Adapters receive the key from `src/secrets.cjs` and pass it only as a header.
- The OpenAI and Anthropic adapters are optional and may be thin or omitted if time is short; the README says which exist. Their absence does not affect the gate. Cost estimates and examples in all documents default to Gemini.
- API shapes can change. Each adapter has a recorded-response fixture test (section 13), and the first real use is a live smoke run of 3 development listings (section 10.5) before any larger run.

### 4.3 Prompt
`src/prompts/check-v1.txt` holds the system text and the user-text template in one file, separated by a line containing only `---USER---`. The user-text part has the placeholders `{{TITLE}}` and `{{ATTRIBUTES_JSON}}`, and **is** the body of `userText` after substitution (there is no other `userText` construction). `src/core/prompt.js` builds:
- `system`: fixed text. It states the task (decide, per attribute, whether the photo contradicts the listing value), defines the three verdicts (`match`: the photo is consistent; `mismatch`: the photo clearly contradicts the value; `cannot_tell`: the attribute is not visible or not judgeable from this image), requires `cannot_tell` rather than a guess, tells the model that listing text is untrusted data and that any instructions inside it MUST be ignored, and fixes the output schema.
- `userText`: the title and the attributes as a JSON object inside a delimited block (`<listing>` ... `</listing>`), after JSON-escaping the strings. Only attributes that are non-null for this listing are included.
- Output schema requested: `{"attributes": {"<name>": {"verdict": "match|mismatch|cannot_tell", "confidence": <number 0 to 1>, "reason": "<one line, at most 140 characters>"}}}` with exactly the requested attribute names.
- `promptHash` = SHA-256 of the whole `check-v1.txt` file after CRLF to LF (it therefore covers both the system text and the user template). It is stored in every verdict record and every cache key.
- Prompt tuning uses development sets only (section 10.4); the prompt is frozen at stage 2 and never changes afterwards (section 10.2). Colour guidance in the prompt is general (judge the dominant colour of the product, not the background; multi-colour products match if the listed colour is a visible major colour). No prompt text may contain a held-out listing id, title, value or image description.

### 4.4 Parsing (`src/core/parse.js`, re-exported by `src/parse.cjs`)
Input: raw text and the list of requested attributes. Steps, in order:
1. Strip a Markdown code fence if present. Take the substring from the first `{` to the last `}`. If none, or `JSON.parse` fails: parse failure for the call.
2. Require `attributes` to be an object. Otherwise parse failure.
3. For each requested attribute: if missing, the result is `cannot_tell`, confidence 0, reason empty, flag `missing`. If present: `verdict` is trimmed and lower-cased with spaces and hyphens turned into underscores; it MUST be `match`, `mismatch` or `cannot_tell`, else the attribute gets `cannot_tell` with flag `parse_error`. `confidence` MUST be a finite number in [0, 1], else `cannot_tell` with flag `parse_error` (values such as 85 or "high" are not rescaled or guessed). `reason` is coerced to a string, control characters removed, whitespace collapsed, truncated to 200 characters.
4. Attributes not requested are ignored.
A call is a **parse failure** if step 1 or 2 fails. The client retries a parse failure once (a new request, same settings, new cache entry only if the second parse succeeds). If it fails again, all requested attributes are `cannot_tell` with flag `parse_error`, and the failure is counted (gate G07).

### 4.5 Client behaviour (`src/vlm/client.cjs`)
- **Cache.** Key = SHA-256 of `provider + "|" + model + "|" + promptHash + "|" + imageSha256 + "|" + sha256(userText)`. File `eval/cache/<provider>/<model-sanitised>/<key>.json` holds `rawText`, parsed attributes, usage and the original latency. A cache hit makes no network call, so it is not a new run (section 10). Cache files MUST NOT contain headers or keys. Mock results are never cached.
- **Concurrency.** Default 2 in-flight requests for Gemini and 4 for other providers, maximum 8 (`--concurrency`). Results are written in input order so output is deterministic.
- **Retries.** `rate_limit`, `server`, `timeout` and `network` errors: up to 3 retries with waits of 1 s, 2 s and 4 s (a `Retry-After` header up to 30 s is honoured instead). `auth`, `bad_request`, `blocked`: no retry. `blocked` marks that one listing as a provider error (all attributes `cannot_tell`, flag `provider_error`) and the run continues. `auth` and `bad_request` abort the run (exit code 3), because every later call would fail the same way; a held-out run that aborts before its first 2xx response is `void` and does not consume a run (section 10.2).
- **Circuit breaker.** After 5 consecutive listings fail after retries, or if more than 10% of listings in a set fail, abort with exit code 4. Everything already received is in the cache.
- **Cost guard.** Before the first real call the client prints the listing count, an input-token estimate (image treated as 800 tokens, text as characters divided by 4) and, if `eval/prices.json` has prices for the model, an estimated cost. A real run MUST be started with `--yes`, otherwise it prints the estimate and exits with code 0 without calling. `--max-calls N` stops the run after N network calls (exit code 4).
- **Price file.** `eval/prices.json` (owner-written, gitignored) maps `provider/model` to USD per million input and output tokens. If absent, reports show tokens and `cost: not computed`. Prices are never hard-coded in source.
- **Latency.** Wall-clock milliseconds of the successful attempt, from request start to full response body. Cache hits are excluded. Report p50, p95 and mean.

### 4.6 Mock provider
- Purpose: run the whole pipeline and tests with no key and no network.
- Behaviour: deterministic. It never looks at pixels. It reads a `mockTruth` field that exists only in fixture records (test/fixtures) and returns, per attribute, the true verdict with probability `mock.accuracy` (default 0.9, seeded by listing id), else a wrong one, with confidence drawn from the seeded PRNG, a canned reason, fixed latency 1 ms and fixed usage numbers.
- Safety: the mock MUST refuse (exit code 2) any listing whose `set` is a held-out set or whose record lacks `mockTruth`, because on real data it would have to read the planted ground truth. Output of the mock is stamped `provider: "mock"`. `scripts/eval.cjs` stamps any report built from mock results "MOCK RUN, NOT A MEASUREMENT" and the gate command returns `NOT EVALUABLE` for it.

## 5. Baselines
Both baselines are deterministic, offline and cost nothing. They are tuned only on development sets and frozen with the prompt.

### 5.1 Colour baseline (`src/baseline/colour.cjs`)
Applies to the `colour` attribute only.
1. Decode the JPEG with `jpeg-js` (`useTArray: true`, `formatAsRGBA: false`). On decode failure: `cannot_tell` with flag `image_error`, counted in the report.
2. Downsample to at most 64 by 64 with nearest-neighbour sampling (fixed stride). Foreground = pixels whose minimum RGB channel is at most 235 (ABO images are mostly on near-white backgrounds). If foreground is under 5% of pixels: `cannot_tell`.
3. Convert each foreground pixel to CIELAB (D65). Assign it to the nearest colour family by Euclidean distance to the family's Lab prototype in `src/families.json`.
4. Predicted families = every family holding at least 25% of foreground pixels (the top family is always included).
5. Map the listing's colour value to a family with the name-to-family map in `src/families.json` (lower-case, trim, first matching token). Unmapped, or mapped to `multicolour`: `cannot_tell`.
6. Verdict: `match` if the listing family is in the predicted set or adjacent (per the adjacency table in `families.json`) to a predicted family; otherwise `mismatch`. Confidence 1.0. Reason is a fixed string naming the predicted families.
The adjacency table is **not tuned**: it is the symmetric closure of the near-set table in DATA-PLAN 6.2 (if family B is in the near set of A, then A and B are adjacent), so the baseline is tolerant of near shades and is not compared as a strawman. Only two numbers are tuned, on `planted-dev` only, with the single objective "maximise colour F1 (far stratum) on `planted-dev`": the foreground threshold (grid 215, 225, 235, 245; default 235) and the predicted-family share rule (grid 15%, 20%, 25%, 33%; default 25%). Ties go to the default, then to the higher value. The chosen values are recorded in `eval/HISTORY.md` before stage 2 and hashed at stage 2. Nothing else about the baseline is tuned.

### 5.2 Text-only baseline (`src/baseline/text.cjs`)
Checks consistency between the title and the structured attributes, with no image.
- Colour: if the title contains a colour word (from the name-to-family map) whose family differs from the colour attribute's family, and none of the title's colour words has the attribute's family, `mismatch`; if no colour word is in the title, `cannot_tell`; else `match`.
- Item type: if the title contains an item-type word (from `lexicon.json`) mapping to a type different from the `item_type` attribute and none maps to the same type, `mismatch`; no such word: `cannot_tell`; else `match`.
- Pack count: the title's pack count (DATA-PLAN 6.6) differs from the attribute: `mismatch`; no title count: `cannot_tell`; else `match`.
- Material, pattern: the same rule with the material and pattern families.
- **Known property, stated here before measuring:** the planting procedure rewrites the title and the attribute consistently (DATA-PLAN 6.1), because a realistic photo-vs-text error is a seller who wrote consistent text about the wrong photo. So this baseline is expected to find about nothing on the planted colour and item-type sets, by construction (every gated colour and item-type swap has a rewritten title; DATA-PLAN 6.1, 6.2). Material and pattern swaps whose title could not be rewritten are reported separately as "text conflict possible", because the text baseline can flag them. It is reported in the planted table for transparency, but it is **not** the comparison used in gate G04. It matters on the natural set, where it finds real title-vs-attribute disagreements.

## 6. Labelling page (`labelling/`)
- **Files.** `index.html`, `labelling.js`, `labelling.css`, and `tasks.js` generated by `scripts/build-labelling.cjs` from `data/splits/natural-dev.json` and `data/heldout/natural-heldout.json`. `tasks.js` assigns `window.LISTING_TASKS = {...}` (the same content as the JSON, so the page works from file:// where `fetch` of a local file is blocked).
- **Content security policy.** Meta tag as first child of `<head>`: `default-src 'none'; script-src 'self' file:; style-src 'self' file:; img-src 'self' file: data:; connect-src 'none'; base-uri 'none'; form-action 'none'`. No inline scripts, no `on*=` attributes. If a smoke test in headless Edge shows this blocks the page's own scripts or the Blob download under file://, remove the meta tag in the same change and note it in the report (no other variant is tried).
- **What the page shows.** One listing at a time, in a seeded shuffled order stored in `tasks.js`: the image (`../data/<image path>`), the title, and a row per non-null attribute with three buttons: Match, Mismatch, Cannot tell. A Mismatch choice reveals an optional tag selector (fixed list in section 8.7) and a note field (max 200 characters). It shows no model output, no baseline output and no planted information.
- **Label question (shown on the page).** "Does the photo contradict this attribute value of the listing? Match: the photo is consistent with it. Mismatch: the photo clearly shows something different. Cannot tell: not visible, or the photo does not show the product." The title is context; the verdict is about the attribute value.
- **Behaviour.** Keyboard: 1, 2, 3 set the focused attribute; Enter or the arrow keys move on and back. A progress counter shows done/total. A listing is complete when every attribute has a verdict. Progress autosaves to `localStorage` under `listingMismatchLabels:v1:<tasksHash>`. "Download labels" produces `labels-<split>-<count>.json` via a Blob and an `<a download>`, with `labeller: "owner"`, `synthetic: false` and `createdAt` (UTC time of download) set by the page; no script other than the page produces a label file (section 1.1 rule 2). "Load labels" reads a previously downloaded file with a file input and `FileReader`, so progress survives a cleared browser. The format is in DATA-PLAN section 9.
- **Validation.** On loading a labels file: the JSON must parse, `schema` must equal `listing-mismatch-labels/v1`, `tasksHash` must equal the loaded tasks' hash (otherwise a visible error and nothing is loaded), unknown ids are ignored with a visible count, and verdicts outside the enum are rejected.
- **Safety.** Text is inserted with `textContent` only, never `innerHTML`. No third-party code.

## 7. CLI
All commands print a one-line summary to stdout and details to stderr. Exit codes: 0 success; 1 usage or validation error; 2 data, freeze or guard violation; 3 provider fatal error (auth or bad request); 4 provider run aborted (circuit breaker, max calls); 10 gate FAIL; 11 gate INCONCLUSIVE; 12 gate NOT EVALUABLE.

| Command | What it does |
|---|---|
| `node scripts/fetch-abo.cjs [--inventory]` | Downloads ABO listings archive and image metadata from the allowlisted host, verifies sizes, writes `data/SOURCES.lock.json`; with `--images` downloads only the manifest's images. |
| `node scripts/build-sample.cjs` | Inventory and selection; writes `data/splits/*.json` manifests and `data/splits/inventory.json`. Stops with exit 2 if a stop rule in DATA-PLAN 3.4 fires. |
| `node scripts/plant.cjs` | Builds the planted dev and held-out sets and the two planting logs (`data/splits/planting-log-dev.jsonl`, `data/heldout/planting-log-heldout.jsonl`). |
| `node scripts/build-labelling.cjs` | Writes `labelling/tasks.js`. |
| `node scripts/freeze.cjs` | Writes `eval/freeze.json` (DATA-PLAN 8). |
| `node scripts/listing-check.cjs --checker vlm\|baseline-colour\|baseline-text --sets <list> [--provider P] [--model M] [--yes] [--concurrency N] [--max-calls N] [--heldout-run K --reason "text"]` | Runs a checker over sets and writes verdict files to `eval/results-private/<runId>/<set>.jsonl`. Held-out sets require `--heldout-run` and `--reason`. |
| `node scripts/eval.cjs --run <runId> [--check-repro]` | Computes metrics from verdict files and labels, evaluates the gate, writes `eval/results/metrics.json`, `docs/EVAL-REPORT.md` and `demo/results.js`. `--check-repro` recomputes from the cache and compares the SHA-256 of `metrics.json`. |
| `node scripts/denylist.cjs [paths]` | Section 11.2. |
| `node scripts/build-core.cjs` | Section 2.3: writes `src/core/template.generated.js` and `demo/core.bundle.js`. |
| `node scripts/approve.cjs --item gate\|data-use\|labels-own\|no-claims --text "<statement>"` | Owner-only (section 10.6): appends a dated approval to `eval/approvals.json`. |
| `node scripts/listing-check.cjs --smoke --yes` | Section 10.5: three `planted-dev` listings through the chosen adapter; logged as `smoke`. |

## 8. Evaluation
### 8.1 Sets (sizes and construction in DATA-PLAN sections 4 to 6)
| Set | Purpose | Ground truth | Use |
|---|---|---|---|
| `planted-dev` | prompt, tau and baseline tuning | planting log | any number of runs |
| `natural-dev` | prompt tuning on real listings | owner labels | any number of runs |
| `planted-heldout` | gate criteria G01 to G04, G07 | planting log | counted runs only (section 10) |
| `natural-heldout` | gate criteria G05, G06; the natural rate | owner labels | counted runs only |

Planted and natural accuracy results are never pooled into one number, in any table, figure or sentence. The only pooled figures are the operational ones named in section 15 (G07 call failures and cost per 1,000 listings), labelled as pooled.

### 8.2 Unit of evaluation and operating point
- The unit is a (listing, attribute) pair with a ground-truth label of `mismatch` or `not_mismatch`.
- **Planted ground truth.** In a planted listing the swapped attribute is `mismatch`; every other non-null attribute of that listing, and every non-null attribute of a control listing, is `not_mismatch`. Near-stratum colour swaps (DATA-PLAN 6.2) are excluded from the gate tables entirely (neither positives nor negatives) and reported separately.
- **Natural ground truth.** The owner's label per pair (`match`, `mismatch`, `cannot_tell`). For precision and recall of `mismatch`, a pair is positive if the owner said `mismatch`, negative if `match`, and excluded if `cannot_tell`.
- **Operating point.** `tau` is selected on `planted-dev` colour pairs (far stratum) only; `natural-dev` is not used to choose `tau`. Grid {0.5, 0.6, 0.7, 0.8, 0.9}. Choose the value that maximises colour mismatch F1 among values with colour mismatch precision at least 0.85; ties go to the higher value. If no value reaches precision 0.85, choose the highest precision, then the higher F1, then the higher `tau`, and the report says so. `tau` is one number for all attributes and is frozen at stage 2. Stated limits: `planted-dev` has about 14 far colour positives, so the dev precision estimate is noisy; the same `tau` is applied to item type without checking it there, and G02 may fail because of that (an accepted risk, recorded now).

### 8.3 Metrics (all computed on effective verdicts; comparisons use unrounded values)
- For each attribute: TP = predicted `mismatch` and ground-truth mismatch; FP = predicted `mismatch` and not mismatch; FN = ground-truth mismatch and predicted anything else (including `cannot_tell`). Precision = TP/(TP+FP); recall = TP/(TP+FN); F1 = 2PR/(P+R). Undefined precision (TP+FP = 0) or recall (no positives) is reported as `n/a` and fails any criterion that depends on it.
- **cannot_tell rate** = pairs with effective verdict `cannot_tell` divided by all pairs evaluated for that attribute, on the planted held-out set and, separately, on the natural held-out set.
- **Wilson interval** (95%, z = 1.959964) for every proportion: `(p + z²/2n ± z·sqrt(p(1−p)/n + z²/4n²)) / (1 + z²/n)`.
- **Cohen's kappa** between the owner's labels and the effective verdicts: three-class (`match`, `mismatch`, `cannot_tell`) over pairs from the gate attributes (colour, item type, material) on the natural held-out set, `κ = (po − pe)/(1 − pe)`. A binary kappa (mismatch vs not) is also reported. A 95% interval comes from a listing-level bootstrap (section 8.4). If `pe = 1` kappa is `n/a`.
- **Baseline comparison** for colour on the planted held-out set: F1 of the VLM minus F1 of the colour baseline, with a paired listing-level bootstrap interval.
- **Cost and latency** (section 4.5): total tokens, estimated cost per 1,000 listings (total cost divided by listings sent, times 1,000), p50, p95 and mean latency.

### 8.4 Bootstrap
Resample listings (not pairs) with replacement 10,000 times using mulberry32 seeded with 20250101; paired comparisons resample the same listings for both checkers; the interval is the 2.5th and 97.5th percentiles. Implemented in `src/stats.cjs` and unit tested with a fixed seed.

### 8.5 Planted-set reporting
Per attribute: counts (TP, FP, FN, TN), precision, recall, F1 with Wilson intervals for precision and recall, the cannot_tell rate; the VLM and both baselines side by side; split by category and by stratum (far, near). Also: failure listing (ids and reasons) for every FP and FN. Materials, patterns and pack count are exploratory (not gated).

### 8.6 Natural-set reporting and the headline rate
- **Primary rate.** Among the 200 natural held-out listings, k = listings with at least one owner label `mismatch` on any attribute; n = 200. Report k/n with the Wilson 95% interval, labelled "measured on the sampled ABO subset, owner-labelled".
- **Cannot-tell sensitivity.** Let c = listings with no `mismatch` label and at least one `cannot_tell` label. Report the interval for k/n (lower bound reading) and for (k + c)/n (upper bound reading).
- **Per-attribute rate.** Among pairs labelled `match` or `mismatch` (cannot_tell excluded), the mismatch share with its Wilson interval and n; by category too.
- **VLM on natural data.** Precision, recall and F1 of the effective `mismatch` verdict against owner labels per attribute; the number of VLM flags and how many the owner confirmed (review-queue hit rate); the cannot_tell rate; kappa (8.3). The baselines are reported the same way.
- **Text-vs-attribute disagreements.** The number of listings where the text-only baseline flags a title-vs-attribute contradiction, reported as its own finding (it is not a photo mismatch).
- If k is below 15 pairs (the evaluability rule in section 9), the report states the rate with its wide interval and does not describe patterns as general.

### 8.7 Mismatch pattern tags (fixed list; the owner picks at most one per mismatch label, optional)
`shade_ambiguity` (listed colour name versus a different shade shown), `different_variant_shown` (photo shows another colour or size variant of the product), `wrong_item_type`, `count_mismatch` (pack or set quantity differs), `material_not_as_described`, `pattern_mismatch`, `attribute_text_wrong_other` (the text value is wrong for some other reason), `photo_not_the_product` (lifestyle or unrelated image), `other`. The report gives a count and percentage per tag among tagged mismatches, with up to 3 example ids per tag and an "untagged" count. VLM reasons are quoted only as examples, not counted as findings.

## 9. Release gate (fixed before measurement)
All criteria use the held-out sets, the effective verdicts at the frozen `tau`, the frozen prompt and the pinned model. Each criterion is PASS, FAIL, or INCONCLUSIVE (only where stated). Comparisons use unrounded values; "at least" means `>=`. **The gate verdict of record is the verdict of counted run 1** (section 9.3).

<!-- GATE:BEGIN -->
| ID | Set | Criterion | Threshold | If not evaluable |
|---|---|---|---|---|
| G01 | planted-heldout | Colour, far stratum: mismatch precision and recall | precision >= 0.85 and recall >= 0.70 | FAIL |
| G02 | planted-heldout | Item type: mismatch precision and recall | precision >= 0.85 and recall >= 0.70 | FAIL |
| G03 | planted-heldout | cannot_tell rate over all colour pairs (near-stratum swapped colour pairs excluded) and all item-type pairs | <= 0.25 | FAIL |
| G04 | planted-heldout | Colour F1, far stratum, same pairs as G01: VLM minus colour baseline | difference >= 0.10 and bootstrap 95% lower bound > 0 | FAIL |
| G05 | natural-heldout | Three-class Cohen's kappa vs owner labels over colour, item-type and material pairs | kappa >= 0.61 | INCONCLUSIVE if fewer than 15 owner `mismatch` pairs among those attributes |
| G06 | natural-heldout | Review-queue hit rate over colour, item-type and material pairs | >= 0.50 | INCONCLUSIVE if fewer than 10 VLM effective mismatches among those pairs |
| G07 | planted-heldout + natural-heldout | Call-level failures (parse failure after the retry, or provider error after retries) as a share of listings sent | <= 0.02 | FAIL |
| G08 | all | Reproducibility: `eval.cjs --check-repro` reproduces the SHA-256 of `metrics.json` | identical | FAIL |
| G09 | repository | `npm test` passes; `denylist.cjs` finds no secret, banned term, banned phrase or missing honesty sentence; `.denylist.local` is present with at least 3 terms | pass | FAIL |
<!-- GATE:END -->

**Definitions that complete the table**
- **G01/G03/G04 pair sets.** G01 and G04 use the same pairs: the colour pair of every far-stratum colour swap (positives) and the colour pair of every control and every other-attribute swap listing (negatives). Near-stratum colour swaps are excluded (neither positive nor negative) and reported separately. G03 uses all colour and item-type pairs of the planted held-out set except the colour pair of near-stratum swapped listings.
- **G04 baseline handling.** Both checkers are scored on the identical pair list. A baseline `cannot_tell` or `image_error` on a positive is a miss (FN); on a negative it is a true negative. The text-only baseline is not used in G04 (section 5.2).
- **G05 pairs and kappa.** Pairs are the non-null colour, item-type and material pairs of `natural-heldout`; all three classes (`match`, `mismatch`, `cannot_tell`) are used on both sides.
- **G06 hit rate.** Numerator: VLM effective `mismatch` flags on the G05 pairs whose owner label is `mismatch`. Denominator: all VLM effective `mismatch` flags on the G05 pairs. An owner label of `match` or `cannot_tell` on a flagged pair counts as not confirmed. Pattern and pack count are exploratory and excluded from G05 and G06.
- **G07 failures.** Call-level only. Attribute-level `parse_error` flags (one attribute malformed in an otherwise valid answer) are reported in the report but are not part of G07.

**Overall status of a counted run** (computed by `src/gate.cjs`):
- **GATE PASS**: every criterion is PASS.
- **GATE FAIL**: at least one criterion is FAIL.
- **GATE INCONCLUSIVE**: no FAIL, and at least one INCONCLUSIVE.
- **NOT EVALUABLE**: the results come from the mock provider or an unfrozen set.
The report also always prints two sub-statuses next to the overall one: **Planted criteria** (G01 to G04) and **Natural criteria** (G05, G06), so a reader never sees a single word for a mix of an easy and a hard test.

**Pre-stated expectation (written before measuring).** The natural held-out set has 200 listings and about 450 gated pairs. If real mismatches are a few percent of pairs, the owner may label fewer than 15 mismatch pairs, and G05 is then INCONCLUSIVE by design, not by accident. G06 may fall below 10 flags in the same way. In that case the overall status cannot be PASS and is GATE INCONCLUSIVE (or FAIL). The case study MUST then say that the planted criteria were met or not met and that the natural criteria could not be judged, and MUST NOT call the project "gate passed".

### 9.1 Justification of the thresholds (written before measuring)
The cost statements below are the owner's judgement, assumed and not measured. They are not findings.
- **G01/G02, precision 0.85 at recall 0.70.** Assumption: in a review queue a flag costs a person seconds and a missed mismatch costs a return later. Break-even sketch: if a wasted flag costs `f` and a missed mismatch costs `m`, a queue is worth running when `precision * m > (1 - precision) * f`, that is `m / f > 0.15 / 0.85 = 0.18` at precision 0.85, so flags pay for themselves unless a missed mismatch costs under a fifth of a wasted flag. At recall 0.70 the tool catches most but not all swaps. Both numbers are engineering and owner judgement choices, not derived from data. Colour and item type are the attributes most visible in an image and the ones the brief names. The planted task is easier than real mismatches, so these thresholds are a minimum, not a claim about real-world performance. Colour is gated on the far stratum only because near-shade swaps (navy to black) are ambiguous even for people.
- **G03, cannot_tell at most 0.25.** Engineering choice. A model that abstains too often passes precision by flagging little. Recall already counts abstentions as misses; this criterion also stops a tool that abstains on a quarter or more of listings from being called useful.
- **G04, margin 0.10 F1 and a bootstrap lower bound above 0.** Judgement: a margin below 0.10 F1 would not change a decision about paying for a VLM, and the bootstrap guards against a gap that sampling noise produces. The colour baseline uses the near-set tolerance table untuned (section 5.1), a deliberately fair opponent. For item type there is no credible non-AI image baseline without training a classifier, so item type has no margin criterion.
- **G05, kappa 0.61.** The lower bound of Landis and Koch's "substantial agreement" band (0.61 to 0.80). Three classes and pooled attributes keep the number of judgements near 450 even when mismatches are rare. A kappa from fewer than 15 owner mismatches is INCONCLUSIVE, not PASS or FAIL.
- **G06, hit rate 0.50.** Judgement: below 0.50 most items in a review queue are wasted effort. INCONCLUSIVE below 10 flags because the proportion would carry no information.
- **G07, at most 2% failed calls.** Engineering choice: failures must not distort the metrics.
- **Bias note for G01 (stated now, not after).** The negatives for colour contain about 304 pairs (160 controls plus 144 other-attribute swaps). A real mismatch among them that the model correctly flags is scored as a false positive, and the gate does not adjudicate it (DATA-PLAN 6.7). Sizing: if the natural colour mismatch rate were 3%, about 9 such pairs exist; with about 42 true positives (recall 0.70 of 60) nine false positives alone give precision 0.82, below 0.85, for a perfect model. The pre-registered choice is to accept this risk and not change the gate. A G01 FAIL is therefore reported with this bias stated, together with the supplementary, post-hoc adjudicated figure (DATA-PLAN 6.7) clearly labelled as not part of the gate.
- **Power note (stated now, not after).** With 60 far colour positives the Wilson 95% interval for a recall of 0.70 is about 0.57 to 0.80. A criterion that passes on the point estimate with a lower bound below the threshold is reported as "PASS (weak evidence)"; it is still a PASS under this gate, and the report prints the interval beside it.

### 9.2 What a gate result permits the documents to say
- **GATE PASS:** the case study may say the VLM met the pre-registered thresholds on this sample and model. The statement MUST name G01 to G04 as planted-set results (the easier test), give the G05 and G06 results (or their INCONCLUSIVE status) with the same prominence, and include the Wilson intervals. A PASS statement for G01 or G02 MUST quote the interval, and MUST carry the label "weak evidence" whenever the lower bound of the interval is under the threshold.
- **GATE FAIL:** the case study says it failed, names the failing criteria, and presents the natural findings as findings about the sample, with the VLM's limits stated. The project is still publishable; hiding a FAIL is not allowed.
- **GATE INCONCLUSIVE:** the case study says which criterion lacked data and why (for example, too few natural mismatches), and makes no claim on that criterion. No top-up labelling may be added to the natural held-out set; a top-up, if the owner wishes, is a new, separately named exploratory set.

### 9.3 Verdict of record and re-runs
The gate verdict of record is the verdict of **counted run 1**. Runs 2 and 3 are post-hoc re-runs after a recorded defect fix (section 10.2). If run 1 FAILs and run K passes, the only permitted statement is "run 1 FAILED; after fix X (recorded in HISTORY.md), run K passed", and the case study headline and EVAL-REPORT headline always show run 1. All runs are shown in order.

## 10. Held-out discipline
### 10.1 Freeze (four stages, DATA-PLAN section 8)
Stage 0 (`gate`) happens before `fetch` and any data work; stage 1 (`data`) before any real-provider call on any set; stage 2 (`method`) before the owner labels `natural-heldout`; stage 3 (`labels`) before counted run 1. `scripts/freeze.cjs --stage gate|data|method|labels` writes `eval/freeze.json` with a UTC timestamp per stage and SHA-256 hashes of:
- stage 0: the frozen region of this SPEC, DATA-PLAN.md, `src/gate.cjs`;
- stage 1: additionally `src/lexicon.json`, `src/families.json` (initial), the four manifests, the two planting logs, the four image-hash files, `data/SOURCES.lock.json`;
- stage 2: `src/prompts/check-v1.txt` and `promptHash`, `src/families.json` (final), `tau`, the model identifier, the baseline tuning values (section 5.1), and the **code hash**;
- stage 3: the natural held-out labels file and `labelling/tasks.js`.
The **code hash** is the SHA-256 of the sorted concatenation of the file hashes of every `*.cjs` and `*.js` file under `src/` (excluding `src/report.cjs`), every `*.cjs` file under `scripts/`, `labelling/labelling.js`, `package.json` and `package-lock.json`. The generated `demo/core.bundle.js` is excluded because its inputs are covered. Each stage is a local git commit with the stage's hashes in its message, made only under the conditions in the freeze-evidence bullet of the pre-registration paragraph (clean tree, previous stage commit present and recorded in the committed `eval/HISTORY.md`). The owner pastes each printed entry into `eval/HISTORY.md` and commits it. A stage cannot be rewritten; a later mismatch of any frozen hash is a guard violation.

### 10.2 Run budget and what may change
- At most **3 counted held-out runs**. A run is **counted** once at least one held-out request has returned an HTTP 2xx response (cache hits excluded). A run covers both held-out sets with one prompt, one `tau` and one model.
- The runner appends `{"run":K,"status":"started",...}` to `eval/runs.jsonl` before the first held-out call and a final line with status `completed`, `aborted` or `void`. A run that ends before any 2xx response (for example, an `auth` or `bad_request` error from a mistyped model name or an expired key) is logged `void` and does not consume a run. An `aborted` run (at least one 2xx, then a stop) counts. A run aborted by a provider outage or quota (exit 3 or 4 with a network or quota cause) may be continued with identical settings and the same K (`--continue-run K`), at most D times, where D is the number of days the owner recorded in `eval/HISTORY.md` before run 1 as needed for one run (section 10.3, minimum 1). Each continuation re-checks the model identifier, the prompt hash and every frozen hash.
- `scripts/listing-check.cjs` MUST refuse (exit code 2) a held-out request if: `freeze.json` is missing or any frozen hash no longer matches; the `gate` approval or the `data-use` approval is missing (section 10.6); `eval/runs.jsonl` already holds 3 counted runs; `--heldout-run K` is not the next number; `--reason` is missing; the natural held-out labels are not frozen (stage 3: labelling is a hard prerequisite, there is no waiver and no planted-only counted run); the provider is `mock`; no smoke record exists for the identical provider and model (section 10.5); the model identifier fails the pinning rule below; or the count of lines in `runs.jsonl` with status `completed` or `aborted` differs from the count of run entries in `eval/HISTORY.md` (checked by `eval.cjs` too).
- **After run 1, the prompt, `tau`, model identifier, baselines, `families.json`, `lexicon.json`, planting and all gate parameters are immutable.** `freeze.cjs` refuses a held-out run K > 1 if the `promptHash`, `tau` or model differs from stage 2. The only permitted change is a code bug in `parse`, the client or the metrics, demonstrated by a failing unit test or a reproduction on a development set, recorded in `eval/HISTORY.md` with the evidence before the next run. A change made after seeing held-out failures that is not such a bug fix is not allowed, because it would turn the held-out set into a tuning set.
- **Pinning rule for the model identifier.** The identifier is sent unchanged and compared by string equality at the smoke run, at stage 2 and at every counted run. It is refused if, case-insensitively, it equals or contains `latest`, `auto` or `alias`, or is empty or contains whitespace. If it ends in a snapshot suffix (a hyphen followed by 3 digits, 8 digits or a date `YYYY-MM-DD`) the report says "dated snapshot, as named by the provider". Otherwise (for example `gemini-2.5-flash`) the report says "model not pinned by the provider", and comparisons between runs 1, 2 and 3 are described as unpinned, because the provider may change the model behind the name. A unit test covers accepted examples (`gemini-2.0-flash-001`, `gpt-4o-2024-08-06`, `gemini-2.5-flash` as accepted but unpinned) and rejected ones (`gemini-flash-latest`, `latest`, `auto`, `a b`).
- Re-running with all hashes unchanged and answers served from the cache is not a new run.
- Because runs reuse the same sets, runs 2 and 3 are not independent of run 1; the verdict of record is run 1 (section 9.3).

### 10.3 Cost budget
Gemini free-tier use may carry rate limits (expect 429 handling to be exercised; default concurrency for Gemini is 2) and its data-use terms apply (section 10.6). **Pre-run step:** before run 1 the owner records in `eval/HISTORY.md` the model's documented request limits per minute and per day, and the number of days D needed for about 590 requests plus retries (D = 1 if the daily limit is at least 700). `--continue-run` is allowed D times (section 10.2). Expected spend for one full counted run (about 590 held-out listings, one image each) is low single-digit US dollars for a small vision model, but this depends on the owner's model and price and is not asserted here. The owner confirms the CLI's estimate with `--yes` for each run. Development runs on `planted-dev` and `natural-dev` (about 120 listings) can be repeated and are likewise estimated.

### 10.4 Development rules and held-out access control
- Prompt, baseline and `tau` tuning use `planted-dev` only for numbers, and `natural-dev` for reading examples and prompt wording. Prompt and baseline tuning ends at stage 2. The owner does not view model outputs on held-out sets until the run that produced them is complete.
- Held-out manifests, the held-out planting log (`data/heldout/planting-log-heldout.jsonl`), held-out images and held-out results are separated from dev files: dev manifests and `data/splits/planting-log-dev.jsonl` live under `data/splits/`; held-out files live under `data/heldout/`.
- `src/sets.cjs` is the only loader. It throws for any held-out set unless the caller holds a capability object that only `listing-check.cjs` (counted-run path, after the freeze checks) and `eval.cjs` (after a counted run exists) can construct. Tuning commands, the mock provider and the dev tools cannot construct it. A test asserts that every dev command refuses a held-out set name.
- Agents follow rule 3 of section 1.1. This is a rule, not a technical barrier (the files exist on disk), so the freeze record and the HISTORY log are the evidence; the owner may additionally move `data/heldout/` out of the workspace between stages 1 and 3.

### 10.5 Smoke run
After the model identifier is final at stage 2 and before run 1, with an identical provider and model, run 3 listings from `planted-dev` through the chosen adapter with the same model and key (`listing-check.cjs --smoke --yes`, which forces `--max-calls 3`). It confirms request shape, parsing and that the key and model work. The runner logs it to `runs.jsonl` as `smoke` and it never counts. Counted run 1 is refused without a smoke record for the identical provider and model.

### 10.6 Owner approvals (`scripts/approve.cjs`, owner-run only)
`node scripts/approve.cjs --item <item> --text "<statement>"` appends `{item, text, date}` to `eval/approvals.json`; the runner and freeze script read it. Items:
- `gate`: "I approve the gate, thresholds, split sizes and freeze procedure in SPEC sections 8 to 10 and DATA-PLAN as written. I wrote or edited, and have read in full, the spec, gates and reviews, and I take responsibility for them." Required for freeze stage 0. The design reviews were run by AI review agents; the owner decides which findings to accept, and records each review and his decisions in `eval/HISTORY.md` and `docs/AMENDMENTS.md`.
- `data-use`: before the first real provider call. The owner states which Gemini tier is used and that either (a) a tier whose terms do not use inputs to improve Google products is used (paid or equivalent), or (b) he has read the ABO licence text in `data/SOURCES.lock.json` and Google's Gemini API terms and accepts sending the sampled public images and text through the free tier. This is the owner's decision; an agent cannot make it. The date and result are copied into `eval/HISTORY.md`.
- `labels-own`: "I labelled these myself with no model output visible." Required for freeze stage 3.
- `no-claims`: the owner has read the README, EVAL-REPORT and CASE-STUDY for unmeasured or production claims. Required before any package step.
Approvals are not editable by any script other than `approve.cjs`, and `denylist.cjs` flags an `approvals.json` whose `item` is missing text.

## 11. Secrets and scans
### 11.1 `scripts/set-vlm-key.ps1`
Modelled on `scripts/set-github-token.ps1` in the workspace (`..\scripts\set-github-token.ps1`). Parameters: `-Provider` (default `gemini`, `ValidateSet('gemini','openai','anthropic')`), `-Model` (optional, also stores `LISTING_VLM_MODEL`), `-SetDefault` (switch, also stores `LISTING_VLM_PROVIDER`), `-SkipVerify` (switch). Steps:
1. `$ErrorActionPreference = 'Stop'`. Read the key with `Read-Host -AsSecureString`; convert via BSTR; free the BSTR; trim; empty input throws "No key entered."
2. Unless `-SkipVerify`, verify with one request that is assumed to spend no tokens: a model-list GET to the provider's host (`/v1/models` for OpenAI and Anthropic, `/v1beta/models` for Gemini) with the key in the header only. That the list call is token-free is unverified until the owner runs it. Outcomes:
   - HTTP 401 or 403: the key is rejected. **Do not modify any stored variable** (a previously saved valid key stays). Clear only the in-memory copy, throw "The provider rejected this key. Nothing was saved." (no echo of the key or the response body).
   - HTTP 429, a network error or a timeout: the key could not be verified. Do not modify anything; throw "Could not verify the key (network or rate limit). Run again, or use -SkipVerify to save without verifying."
   - HTTP 2xx: continue.
3. Save with `[Environment]::SetEnvironmentVariable('<NAME>', $plain, 'User')` and set `$env:<NAME>` for the current process. Variable names: `GEMINI_API_KEY` (default `-Provider gemini`), and for the optional adapters `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`. The script is run by the owner, never by an agent.
4. Null the plain-text variable. Print only "Saved <NAME> as a user-level environment variable. Open a new terminal to use it."
5. The script MUST NOT write the key to a file, the transcript, or the console. Limitation, stated in the README: user-level environment variables are stored in plain text under the user's registry hive; use a key with a spending limit.
The script is not executed by the build or by tests (tests only check its text with the deny-list and a static assertion that it contains no `Write-Host` of the variable and no file-write cmdlet that receives the key variable, and that no code path assigns a stored variable on the rejected or unverified branches).

### 11.2 `scripts/denylist.cjs`
Scans the repository (excluding `node_modules/`, `data/images/`, `data/heldout/` images and binary files) and, optionally, any path given. It includes `docs/`, `README.md`, `demo/` (both pages), `labelling/`, `scripts/` and `eval/` text files. It reports `path:line:rule` only and never prints the matched text. The rules are defined in code in `src/denylist-rules.cjs`; this document describes them in words so that these documents do not themselves trip the scan:
- **Key shapes:** OpenAI-style `sk-` keys, Anthropic `sk-ant-` keys, Google API keys (the prefix `AIza` followed by 35 key characters), long Bearer tokens, and API-key header assignments (`x-api-key` or `x-goog-api-key` followed by a value of 16 or more key characters).
- **Exact values:** the current values of `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` and `GOOGLE_API_KEY` in the process environment, if set and at least 8 characters, are searched for in every scanned file (including `eval/cache/`, `eval/results-private/` and `demo/`), compared in memory, never printed.
- **Local absolute paths:** a Windows drive path under a user-profile folder, and a POSIX home-directory path. Found in any scanned text file other than `.denylist.local`.
- **Owner-private terms** from `.denylist.local` (one per line, case-insensitive), covering employer and internal system names. The file is never committed or packaged. **The scan exits 2 if `.denylist.local` is missing or contains fewer than 3 terms.** The owner seeds it with the three internal-tooling and build-system names listed in the private file `.agents/owner-decisions.md` (not repeated here, so that these documents stay clean under the scan) and adds his employer and system names. The exit-2 rule does not apply when run by `npm test` under `NODE_TEST_CONTEXT`, where a fixture file is used. G09 records "denylist.local present with N terms" (the count only, never the terms).
- **Banned phrases** in the publishable outputs only (`README.md`, `demo/`, `docs/EVAL-REPORT.md`, `docs/CASE-STUDY.md`, `docs/DATA-SOURCES.md`; not the design documents, which must name the phrases): `in production`, `deployed at`, `used by`, `adoption`, `customers` and `users` (whole word, case-insensitive). A hit is a finding and must be reworded; the only allowlisted sentence is "There are no users, no production deployment and no adoption."
Exit code 0 when clean, 2 when findings exist. The check runs inside `npm test` and before any packaging. A test scans `docs/PRD.md`, `docs/SPEC.md`, `docs/DATA-PLAN.md` and `docs/AMENDMENTS.md` and must find nothing.

### 11.3 No-leak mechanics
`src/secrets.cjs` is the only module that reads key variables. `src/log.cjs` is the only logger and redacts every string equal to a known key value. Adapters build errors from `kind` and `status` only. Verdict files, cache files and reports contain no request headers. The Live page redacts its in-memory key from any error text (section 14b).

### 11.4 Honesty statements are enforced, not only written
`denylist.cjs` (G09) checks that the exact sentence "Built with AI coding agents; Anirudh wrote the spec, gates and reviews." appears in `README.md`, `docs/PRD.md`, `docs/SPEC.md`, `docs/DATA-PLAN.md`, `docs/EVAL-REPORT.md` (emitted by `report.cjs`), `docs/CASE-STUDY.md`, `demo/index.html` and `demo/live.html`, whichever of these exist at the time of the scan; the final scan before any packaging requires all of them to exist. The same scan requires, in `README.md`, `docs/CASE-STUDY.md` and `docs/EVAL-REPORT.md`, the sentence "Design reviews were run by AI review agents; the owner decided which findings to accept." The banned-phrase list includes causal statements that mismatches cause returns or complaints; the single hedged sentence in PRD section 1 ("generally believed to cause returns and complaints; this project does not measure that") is allowlisted verbatim. The `no-claims` approval (section 10.6) records the owner's reading.

## 12. Error handling, validation and invariants
### 12.1 Failure conditions
| Operation | Failure | Class | Caller sees | Log |
|---|---|---|---|---|
| ABO download | Host unreachable, HTTP error, size mismatch, archive unreadable | Fatal for `fetch` | Exit 2, message with URL path and status | error to stderr |
| ABO download | Licence text cannot be retrieved or no longer says CC BY-NC 4.0 | Fatal; **STOP and report to the owner** | Exit 2, "licence check failed" | error |
| ABO download | Dataset cannot be downloaded at all | Fatal; plan says stop and report alternatives (DATA-PLAN 3.6); nothing is scraped | Exit 2 | error |
| Sample build | An eligibility or size stop rule fires (DATA-PLAN 3.4) | Fatal | Exit 2 with the failing counts | error |
| Image fetch | One image missing or not a JPEG | Recoverable: the listing is replaced by the next eligible listing in the seeded order, once per slot, before manifests are frozen; after freeze it is fatal | Logged count | warn |
| Freeze/guard | Hash mismatch, budget exhausted, flags missing | Fatal | Exit 2 naming the failed check | error |
| VLM call | `rate_limit`, `server`, `timeout`, `network` | Recoverable, up to 3 retries | Eventually `provider_error` flag | warn per retry |
| VLM call | `auth`, `bad_request` | Fatal for the run | Exit 3 | error (kind and status only) |
| VLM call | `blocked` | Recoverable per listing | `cannot_tell` + `provider_error` | warn |
| VLM call | Circuit breaker, max calls | Fatal for the run | Exit 4, partial results cached | error |
| Parsing | Invalid JSON or schema | Recoverable (one retry), then `cannot_tell` + `parse_error` | Counted in G07 | warn |
| Baseline | JPEG decode failure | Recoverable per listing | `cannot_tell` + `image_error` | warn |
| Labels | Malformed file, wrong schema, wrong `tasksHash` | Fatal for loading | Visible page error; CLI exit 1 | page message / error |
| Eval | Missing verdicts for a frozen listing id, or label ids not covering the natural held-out set | Fatal | Exit 2 listing counts | error |
| Eval | Metric undefined (no positives or no flags) | Not an error | Reported `n/a`; dependent criterion per the gate table | none |
| Freeze/guard | Run K > 1 with a changed `promptHash`, `tau` or model; model id is an alias; no smoke record; approval missing | Fatal | Exit 2 naming the failed check | error |
| Labels | File has `synthetic: true` for a non-mock run, or `createdAt` earlier than stage 2, or `labels-own` approval missing | Fatal | Exit 2 | error |
| Scan | `.denylist.local` missing or empty; banned phrase; missing honesty sentence | Fatal for the scan | Exit 2, `path:line:rule` only | error |
| Live page | Rejected input row, cap exceeded, key rejected, CORS or network failure | Recoverable by the visitor | Visible message; key never shown | none (no logging, no analytics) |

Logging levels: `error` (run cannot continue), `warn` (a retry or a per-listing degradation), `info` (progress summaries). No level prints keys, image bytes or full model text; model text is only in the cache and in `results-private`.

### 12.2 Input validation
| Input | Rules | On failure |
|---|---|---|
| CLI flags | Known flags only; `--sets` values from the four set names; `--concurrency` integer 1 to 8; `--max-calls` positive integer; `--heldout-run` positive integer; `--reason` 10 to 300 characters | Exit 1, usage text |
| Env vars | Section 4.1 | Exit 1 |
| ABO listing JSON | Per line a JSON object; required: `item_id`, `main_image_id`, an English title (`item_name` entry with `language_tag` starting `en`), `product_type`, a colour value; unknown fields ignored | Listing is ineligible (counted by reason in the inventory) |
| Image files | Extension `.jpg`, magic bytes `FF D8`, size 1 KB to 2 MB, longest side at most 512 px | Listing replaced before freeze (12.1) |
| Model output | Section 4.4 | Section 4.4 |
| Labels JSON | Section 6 and DATA-PLAN 9 | Section 6 |
| `eval/prices.json` | Non-negative numbers | Cost shown as `not computed` |

### 12.3 Invariants and where they are enforced
- **No held-out peeking and the run budget.** Enforced in code by `src/freeze.cjs` and `src/sets.cjs`, called by the runner before any held-out request, because documentation alone cannot stop an accidental run. Backed by `eval/runs.jsonl` (append-only by convention; `eval.cjs` cross-checks its counted lines against the HISTORY run entries, so a deleted line is detected).
- **Prompt, tau, model and code are fixed after stage 2.** Enforced by `src/freeze.cjs` hashes (including `scripts/` and `package-lock.json`) before every held-out request, because a silent change would invalidate the pre-registration.
- **Sets are disjoint** (no shared `id`, `imageSha256`, or `(brand, model_name)` group). Enforced in `src/sample.cjs` when manifests are built, and re-asserted by `scripts/eval.cjs` and a test, because a leak would invalidate every metric.
- **Planted ground truth comes only from the planting logs.** Enforced in `src/metrics.cjs` (it accepts truth only from `planted`), because anything else would let model output define its own truth.
- **Human labels come only from the owner.** Enforced by (a) the rule in section 1.1, (b) `labelling.js` as the sole producer of a label file with `labeller: "owner"` and `synthetic: false`, (c) `eval.cjs` refusing any label file with `synthetic: true` unless the provider is `mock`, (d) freeze stage 3 refusing if the labels file `createdAt` is earlier than the stage 2 timestamp, or if the `labels-own` approval is missing, and (e) the label file's SHA-256 printed at stage 3 and copied by the owner into HISTORY. Labelling is a hard prerequisite for counted runs; before it, natural results are "not measured" and nothing is substituted. These checks make fabrication detectable, not impossible: the page also records no per-listing evidence of effort, which is an accepted limitation (AMENDMENTS), and the owner's dated `eval/HISTORY.md` line is the evidence.
- **Gate thresholds have one source.** `src/gate.cjs` holds them; a test parses the table between `GATE:BEGIN` and `GATE:END` in this file and fails on any difference.
- **The SPEC freeze covers the frozen region only**, so amendments and review responses never change the hash (pre-registration paragraph at the top of this file).
- **Mock output is never a measurement.** Enforced in `scripts/eval.cjs` (stamp and exit 12) and in the mock itself (refuses held-out data and records without `mockTruth`).
- **The key never leaves the environment (CLI) or the page's memory (Live).** Section 11.3 and 14b, plus the deny-list scan.
- **Labels are given blind.** Enforced by design of the labelling page (no model output present) and by the runner (natural held-out labels must be frozen before run 1).

## 13. Tests (`node --test`)
Unit tests (no network, no key):
- `stats`: Wilson known values, kappa on a hand-computed table, bootstrap with a fixed seed, quantiles.
- `metrics`: confusion counts on a hand-built set, `n/a` handling, cannot_tell accounting, effective-verdict rule at `tau`, near-stratum exclusion, G04 baseline `cannot_tell` counted as a miss, G06 owner `cannot_tell` counted as not confirmed.
- `parse` (against `src/core/parse.js`): valid JSON, fenced JSON, prose around JSON, missing attribute, bad verdict, confidence 85 or "high" (rejected), over-long reason, injection text inside a reason, empty string.
- `prompt`: escaping of quotes and angle brackets in titles, only non-null attributes included, prompt hash stable.
- `core parity`: the CLI path (`require`) and the browser bundle (`demo/core.bundle.js` evaluated in a Node `vm` context with a fake `window`) produce identical `promptHash`, `system`, `userText`, Gemini request body and parsed output on every fixture and recorded response; `build-core` output is current.
- `plant`: determinism for a fixed seed, exactly one attribute changed, title rewritten consistently, far/near strata honour the tables, ineligible listings skipped, dev and held-out logs written to separate files.
- `sample`: eligibility reasons, dedupe, stratified allocation, split disjointness, determinism.
- `sets`: every dev command refuses a held-out set name; `sets.cjs` throws without the capability.
- `baseline-colour`: on generated JPEG fixtures (solid red, solid navy on white, two-colour), including the adjacency tolerance (symmetric closure of the near-set table), tiny foreground (`cannot_tell`) and corrupt bytes.
- `baseline-text`: each rule, including the by-construction property on a planted fixture.
- `gate`: table-vs-code equality; PASS, FAIL and INCONCLUSIVE paths with synthetic metrics; sub-statuses; verdict of record is run 1.
- `freeze-git`: in a temporary git repository, stage N refuses on a dirty tree, on a missing previous stage commit, on a previous commit that is not an ancestor, and on a `eval/HISTORY.md` that lacks the previous commit id; a valid sequence of four stages creates four commits whose messages contain the stage names and hashes.
- `fixtures`: no label-pattern file outside `test/fixtures/` and `data/labels/`; every `*.fixture-labels.json` has `"synthetic": true` and no real manifest id; `build-sample` and `plant` print no held-out id or title; the model-identifier pinning rule accepts and rejects the listed examples.
- `freeze`: hash verification, stage timestamps, stage-3 refusal when labels are older than stage 2 or `labels-own` is missing, refusal of changed `promptHash`/`tau`/model for K > 1, budget counting (`void` runs do not count; `aborted` after a 2xx does), model-id alias rejection, `runs.jsonl` vs HISTORY cross-check, smoke-record requirement, approvals requirement.
- `labels`: a label file with `synthetic: true` is refused for a non-mock run; label ids and schema validation.
- `adapters`: request construction for each provider (URL, headers, body shape, key only in the header) against a stubbed `fetch`; recorded responses parsed into text and usage; each error status mapped to the right `kind`.
- `client`: cache hit avoids a call, retries and waits (fake timers), circuit breaker, `--yes` guard.
- `secrets`: log redaction, error messages contain no key, `denylist` detects each rule on seeded fixtures, never prints a match, and exits 2 on a missing or empty `.denylist.local`; the three design documents plus AMENDMENTS.md scan clean; the honesty sentence and banned-phrase checks work on fixtures.
- `set-vlm-key`: static text assertions (section 11.1).
- `labelling`: the page's validation and label-file builder are plain functions in `labelling.js` exported for Node tests (`typeof module`), covering schema and `tasksHash` rejection and round-trip.
- `live-input`: the 25-item cap, type and size rules, title length, schema and unknown-column rejection, CSV formula neutralisation, key redaction in an error string, the demo mock's stamp.
Integration tests (mock provider, fixture set of 10 listings with generated images): end-to-end `check` then `eval` to a `metrics.json`, `--check-repro` identical, and the report says "MOCK RUN, NOT A MEASUREMENT"; a Node `vm` end-to-end of the Live page logic with `provider=mock` (load file, validate, run, export).
Static tests (regex over files): the labelling page and `demo/index.html` contain no `http://` or `https://` references to remote resources, no inline scripts, no `fetch(` or `XMLHttpRequest`, and a CSP with `connect-src 'none'`. `demo/live.html` and `demo/live.js`: the only remote host string is `generativelanguage.googleapis.com`, no `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write` or `eval(`, no `localStorage`, `sessionStorage` appears only inside the opt-in code path, and the CSP equals the string in section 14b.
Not unit-testable (manual or live): real provider behaviour, the ABO download, whether the Live page's browser call to Google works from the chosen origin (CORS), the pages in a real browser (a headless-browser smoke test is optional and out of this step).

## 14. Results page (`demo/index.html`)
Static `index.html` + `demo.js` + `demo.css` and generated `results.js` (assigns `window.LISTING_RESULTS`). CSP as in section 6 (`connect-src 'none'`). No network. Sections, in order: status banner (the gate verdict of record from run 1, the Planted and Natural sub-statuses, or "No measured results yet"); "Planted test" table; "Natural test" table (a visibly separate section); baseline vs VLM; top mismatch patterns with counts; cost and latency; up to 12 examples (image thumbnail only if licence-checked and attributed, otherwise text only) showing title, attributes, verdict, confidence and reason; limits and honesty notes; ABO citation; a link to `live.html`. It renders only what `results.js` contains and shows an "unmeasured" state if the file has no results. The Results page and the Live page are separate files so the Results page stays provably network-free.

## 14a. Gemini terms and README note
The README MUST state: free-tier Gemini API prompts and images may be used by Google to improve its products, so nothing sensitive is ever sent by the evaluation (only the public ABO sample); that the owner recorded the `data-use` approval (section 10.6) before the first real call; and that, before publishing results, the owner checks Google's Gemini API terms on sharing model outputs. The Results page never calls a model and never takes a key. The Live page takes a visitor's own key (section 14b) and never contains the author's key.

## 14b. Live page, bring-your-own-key (`demo/live.html`)
Purpose: let a visitor, or the owner in front of a recruiter, run the same detector on a custom set. Live results are demonstrations, not measurements, and are not part of the evaluated gate; the page says so.

- **Shared code.** The page loads `core.bundle.js` (`window.ListingCore`) built from `src/core/*.js` and the embedded prompt template (section 2.3). It contains no copy of the prompt, parser or Gemini request builder. It shows `ListingCore.PINNED_MODEL`, the same identifier as `eval/freeze.json`, and a note that live results are not part of the gate. If `PINNED_MODEL` is `null` (before stage 2), real mode is disabled and only the demo mock works.
- **Provider.** Gemini only (direct `fetch` from the browser to `https://generativelanguage.googleapis.com/v1beta/models/<PINNED_MODEL>:generateContent`, header `x-goog-api-key`), plus the offline demo mock. No OpenAI or Anthropic in the browser.
- **Content security policy** (meta tag, first child of `<head>`): `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; connect-src https://generativelanguage.googleapis.com; base-uri 'none'; form-action 'none'`. The `'self'` source matches only on an `http(s)` origin, so the supported ways to open the page are a local static server (`http://localhost`) or `https` hosting. Double-click (file://) works for the offline demo mock only if the browser accepts `'self'` for file URLs; if it does not, the README documents a one-line Node static-server command for local use, and no other CSP variant is tried. Whether the browser-to-Google call passes CORS from the chosen origin is unverified until the owner tests it; if it does not, real mode is documented as unsupported and the page stays mock-only. This is stated in the README.
- **Key handling.** The key is held in a JavaScript variable only. No `localStorage`. `sessionStorage` is used only if the visitor ticks an unticked-by-default "remember for this tab" checkbox. The key is never placed in a URL, log line, DOM text, export or error message (`ListingCore.redact` is applied to every error string). The input is `type=password` with `autocomplete=off`. A "Clear key" button wipes the variable and the session copy. The key goes only in the `x-goog-api-key` header. No author key anywhere, and the deny-list scan covers `demo/`.
- **Notice before the first call** (visible, with a required tick): "Your key, the images and the text you enter are sent from your browser to Google under the Gemini API terms (the free tier may use inputs to improve Google products). Nothing is sent to the author. There is no analytics."
- **Inputs.** Single listing: choose or drag-drop one image file, and enter title, colour, item type, and optional material, pattern, pack count. Batch: load a CSV or JSON file of listings plus select the image files in one multi-file picker; a record's `image_filename` is matched to a selected file by exact name. Image URLs are NOT supported (cross-origin fetches need per-host CORS and `connect-src` entries; deliberately dropped, which narrows the owner's earlier idea to local files only).
- **Validation and cap.** Batch cap is a hard 25 items: a larger file is rejected with a visible message and nothing is sent. Allowed image types JPEG, PNG, WebP (checked by magic bytes, not extension), at most 4 MB each. Record schema `{title, colour, item_type, material?, pattern?, pack_count?, image_filename}`; `title` at most 250 characters, other text fields at most 80; `pack_count` an integer 1 to 100; unknown columns or keys are rejected; empty required fields are rejected; a record whose image is not among the selected files is rejected. Rejections are shown per row and the rest of the file is not run until fixed.
- **Output.** Per attribute: verdict, confidence, one-line reason, with the effective-verdict rule at the frozen `tau` (shown) from `ListingCore`; a summary table (counts per verdict, per attribute); export as CSV or JSON. Rendering uses `textContent` only, never `innerHTML` for any model or user text. CSV export prefixes any cell starting with `=`, `+`, `-` or `@` with a single quote and quotes every cell.
- **Concurrency and errors.** At most 2 requests in flight; 429, 5xx and network errors retry up to 3 times with 1, 2, 4 second waits; `blocked` and parse failures are shown as `cannot_tell` for that listing. An auth error stops the batch and shows "The key was rejected" (no key echo). A "Stop" button aborts remaining requests.
- **Demo mock.** With `provider = mock` the page needs no key and makes no network call. Because the evaluation mock refuses records without `mockTruth`, the Live page uses a separate demo mock in `src/core/live-input.js` that returns a deterministic verdict per (filename, attribute) hash, confidence 0.5 and the reason "demo mock, no model called". Every result row and export carries the stamp "MOCK, NOT A MEASUREMENT".
- **Tests.** Section 13 (`live-input`, `core parity`, the static assertions and the `vm` end-to-end with the mock).
- **Exposure.** This page can make a browser send data to a third party with the visitor's own key. Before it is hosted anywhere, a documented security review of this page MUST be recorded in `eval/HISTORY.md` (section 1.1 rule 1). Hosting is an owner decision and not part of this build.

## 15. Documentation outputs (after measurement)
`docs/DATA-SOURCES.md` (ABO citation, URL, licence text hash, access date, files and sizes, what was downloaded), `docs/EVAL-REPORT.md` (generated), `docs/CASE-STUDY.md` (written by the owner with the agent, using only measured numbers), `README.md`. All carry the honesty rules in PRD section 8, the honesty sentence and, in `README.md`, `CASE-STUDY.md` and `EVAL-REPORT.md`, the design-review sentence (section 11.4). Pooling exceptions: G07 (call failures) and cost per 1,000 listings are operational figures computed over both held-out sets together and are labelled as such; no accuracy figure is pooled.
<!-- FROZEN:END -->

## 16. Amendments and review responses
Moved to [AMENDMENTS.md](AMENDMENTS.md) so that recording them never changes the frozen hash.
