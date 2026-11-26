# Listing Photo-vs-Text Mismatch Detector: Product Requirements Document
Status: v0.3 (revised after design reviews 1 and 2; planning, nothing measured yet). Owner: Anirudh Kaushik. Companion documents: [SPEC.md](SPEC.md) (build spec and pre-registered release gate), [DATA-PLAN.md](DATA-PLAN.md) (sample, splits, planting, freeze procedure), [AMENDMENTS.md](AMENDMENTS.md) (review responses and amendments). Generated later: `EVAL-REPORT.md`, `DATA-SOURCES.md`, `CASE-STUDY.md`.

Built with AI coding agents; Anirudh wrote the spec, gates and reviews.

## 1. Summary
Product photos on e-commerce marketplaces sometimes contradict the listing text: the title says "Navy", the photo shows red; the title says "Pack of 2", the photo shows one item; the attribute says "Leather", the photo looks like fabric. Mismatches between photo and text are generally believed to cause returns and complaints; this project does not measure that. Simple rules cannot read the content of a photo, and people cannot check millions of listings.

This project is a command-line pipeline that sends each listing's main image, title and a few structured attributes (colour, item type, material, pattern, pack count) to a vision-language model (VLM). The model returns, per attribute, a verdict (`match`, `mismatch`, `cannot_tell`), a confidence between 0 and 1 and a one-line reason. The pipeline also runs a cheap non-AI baseline, so the value added by the VLM is measured and not assumed. Two demo pages accompany it: a Results page with precomputed numbers, and a Live page where a visitor pastes their own Gemini key and runs the detector on a small custom set.

The project exists to produce one measured finding: **how often do photos and text disagree in a real public catalog sample, and what do the disagreements look like?** The answer is reported with a Wilson 95% interval and a characterisation of the top mismatch patterns, whatever the result is. A result of "very few mismatches" or "the VLM is not reliable enough" is a valid, publishable outcome.

Everything is a personal portfolio project on public data. There are no users, no production deployment and no adoption. Nothing here uses employer data, systems or accounts.

## 2. Why this project
The problem is mundane and costly (catalog quality). The solution is a creative use of a vision-language model as a cross-modal consistency checker. Whether a vision-language model is needed is a hypothesis: the baseline comparison (gate G04) is the test, and for colour a histogram check may suffice. The finding is measured, not promised. It is aimed at e-commerce supply-side roles (catalog quality, seller experience, associate product management).

Assumption: "AI is genuinely necessary" is tested, not asserted. The baseline comparison (SPEC section 8) decides whether the VLM earns its place for each attribute. If a histogram check does as well as the VLM for colour, the report says so.

## 3. Target readers and personas
This is a portfolio artefact. The readers are hiring managers and peers, not product users.

| Reader | What they should be able to do |
|---|---|
| Hiring manager in catalog quality or seller experience | Read a one-page case study and see a problem framing, a measured rate with an interval, mismatch patterns, and an honest account of cost and limits; try the Live page on a few listings with their own key |
| Technical reviewer | Re-run the pipeline end to end with the mock provider without a key, read the pre-registered gate, and check that the held-out discipline was followed |
| The owner (Anirudh) | Hand-label the natural sample in a local page, run the evaluation with a personal API key, and publish only what the numbers support |

## 4. Jobs to be done
1. When a catalog team asks "how bad is photo-text mismatch in our listings?", I want a defensible rate with an interval, so I can size the problem before building anything.
2. When I review the flagged listings, I want a per-attribute verdict, a confidence and a one-line reason, so I can fix or dismiss each flag in seconds.
3. When I consider using a VLM for this, I want the same data scored by a cheap non-AI baseline, so I know what the AI adds.
4. When I decide whether to trust the numbers, I want the gate, the splits and the run budget fixed and timestamped before the first measurement, so the results cannot have been tuned to look good.
5. When a recruiter wants to see it work, I want them to run it on their own handful of listings with their own key, without trusting me with their key.

## 5. Functional requirements
Numbered for traceability. SPEC.md gives the detail.

- **F1 Data prep.** Download ABO listing metadata and the smallest image size from the dataset's published distribution only, select a sample, build manifests, and record the licence and source in `DATA-SOURCES.md`. No scraping of any website. If ABO cannot be downloaded, stop and report alternatives (DATA-PLAN 3.6).
- **F2 Planting.** Build a planted test set: real listings where exactly one attribute in the text is swapped, with known ground truth.
- **F3 Natural set and labelling.** Build a natural set of about 200 untouched listings (plus a 30-listing natural dev set), and provide a local labelling page (static HTML and JavaScript, double-click, no server, no network) in which the owner labels each attribute `match`, `mismatch` or `cannot_tell`, and downloads the labels as JSON.
- **F4 VLM check.** For each listing, call a VLM through a provider-agnostic client (Google Gemini as the primary adapter, optional OpenAI and Anthropic adapters, selected by environment variable, plus a `mock` provider) and parse the answer into a per-attribute verdict, confidence and reason.
- **F5 Baseline.** Run a non-AI baseline: a colour-histogram check against the colour attribute, and text-only consistency heuristics.
- **F6 Evaluation.** Compute per-attribute precision, recall and F1 for `mismatch`, the `cannot_tell` rate, Cohen's kappa against the owner's labels, the natural mismatch rate with a Wilson interval, a baseline-vs-VLM comparison, cost per 1,000 listings and latency.
- **F7 Gate.** Check the pre-registered release gate and report PASS, FAIL or INCONCLUSIVE per criterion, with the verdict of record taken from counted run 1. Never edit the gate after measurement.
- **F8 Pattern analysis.** Characterise the top mismatch patterns in the natural set (for example, colour names that map to different shades, pack-count errors), with counts from the owner's pattern tags on mismatch labels. VLM reasons are quoted as examples only (SPEC 8.7).
- **F9a Results page.** A static, browser-only results page (no network calls) showing the precomputed results and a small set of examples.
- **F9b Live page (bring your own key).** A separate static page where a visitor pastes their own Gemini key and runs the same detector (same shared code, prompt and parsing as the CLI) on one listing or a batch of at most 25 from a CSV or JSON file with local image files; verdicts, confidence and reasons are shown and exportable. The key stays in the browser's memory, only Google's API host is contacted, nothing is sent to the author, and no author key exists anywhere. A mock mode runs with no key and no network. Live results are demonstrations and are not part of the evaluated gate (SPEC 14b).
- **F10 Key handling.** A PowerShell script, modelled on the existing token script in this workspace, stores the personal API key as a user-level environment variable. Scripts read it from the environment. The key is never printed, logged or written to any file.
- **F11 Mock mode.** The whole pipeline and all tests run with the mock provider and no key.
- **F12 Label integrity.** Human labels are produced only by the owner in the labelling page. No agent creates, edits or pre-fills a label, and no model output stands in for one; labelling is a hard prerequisite for counted runs, and until it is done natural results are "not measured" (SPEC 1.1, 10.2, 12.3).

## 6. Non-functional requirements
- **N1 Reproducibility.** Given the same manifests, prompt, model identifier and response cache, the evaluation produces a byte-identical `metrics.json`.
- **N2 Cost control.** A full real-provider run on all sets stays inside an owner-confirmed budget (SPEC section 10.3). The CLI prints an estimate and asks for confirmation before any paid run.
- **N3 Licence compliance.** Raw data stays under `data/` and is excluded from any public package unless the licence text, checked at download time, allows redistribution with attribution.
- **N4 Dependencies.** Node.js 22 or newer on Windows and PowerShell. Python is not installed and is not used. One pinned third-party package is allowed (`jpeg-js`, for decoding images in the baseline); everything else uses Node built-ins.
- **N5 Privacy and secrets.** Only the public ABO sample is sent to the VLM provider by the evaluation, after the owner records a data-use decision on the provider's tier (SPEC 10.6). The CLI reads API keys from the environment only. The Live page takes the visitor's own key and keeps it in memory. All of this is covered by the deny-list scan.
- **N6 Honest documentation.** See section 8.
- **N7 Publishing control.** Agents never publish, push, create a remote or host anything. Publishing is a later owner decision, preceded by the deny-list scan and a security review of the Live page (SPEC 1.1).

## 7. Acceptance criteria
Each is checkable by a command or a file inspection.

1. `docs/PRD.md`, `docs/SPEC.md`, `docs/DATA-PLAN.md` and `docs/AMENDMENTS.md` exist, and SPEC section 9 contains the release gate with numeric thresholds and a statement of what PASS, FAIL and INCONCLUSIVE mean.
2. The gate, the split sizes, the run budget and the planting rules are written before any measurement. `eval/HISTORY.md` records, at freeze stage 0 and before any data download, the SHA-256 of the frozen region of `docs/SPEC.md`, of `docs/DATA-PLAN.md` and of `src/gate.cjs`, with the owner's dated approval, as a local git commit (no remote) whose message holds those hashes; stages 1 to 3 (data, method, labels) are commits too, each recorded in the committed `eval/HISTORY.md` before the next stage (SPEC pre-registration paragraph; the evidence makes backdating detectable, not impossible).
3. With no API key set, `npm test` passes and `node scripts/listing-check.cjs --provider mock` runs the whole pipeline on a bundled fixture.
4. Held-out set hashes are recorded in `eval/freeze.json` before the first held-out run; a held-out run with a mismatching hash, a changed prompt, `tau` or model after run 1, or a fourth counted run, is refused by the CLI.
5. The natural mismatch rate is reported as `k/n` with a Wilson 95% interval, with `cannot_tell` handled by the rule in SPEC section 8.6, and is labelled as measured on the sampled ABO subset only. Counted runs require the owner's complete, frozen labels; before that the Results page says "not measured".
6. Planted and natural results appear in separate tables and are never pooled in one accuracy number. The overall gate status is shown with separate Planted and Natural sub-statuses.
7. `eval/HISTORY.md` logs every held-out run, including failed ones; the case study headline shows run 1.
8. The labelling page opens by double-click, makes no network request, and saves labels in the format in DATA-PLAN section 9. The Results page makes no network request. The Live page contacts only the Gemini API host, holds the key in memory only, rejects batches over 25 items, and works with the demo mock without a key.
9. No file in the repository contains an API key or the exact value of a key set in the environment (deny-list scan, SPEC section 11), including `demo/`.
10. No document claims production use, users, adoption, or a result that was not measured, and the exact honesty sentence appears in the README, EVAL-REPORT, CASE-STUDY and both demo pages (enforced by the scan, SPEC 11.4).

## 8. Honesty rules (apply to every document and page)
- No claims of production use, users or adoption.
- State: "Built with AI coding agents; Anirudh wrote the spec, gates and reviews." The README and CASE-STUDY also say: "Design reviews were run by AI review agents; the owner decided which findings to accept." The owner records each review and his accept or reject decisions in `eval/HISTORY.md`.
- Causal claims about returns or complaints appear only in the hedged form in section 1.
- Planted results (known ground truth, an easier task) and natural results (owner-labelled, the real question) are always reported separately.
- Report failures, near-misses and limits. If the gate fails, the report says it failed. If run 1 failed and a later run passed, both are stated.
- The finding describes the sampled ABO subset, not "e-commerce" in general. Amazon Berkeley Objects is a public research dataset, and its image-to-listing relationship (for example, a main image that shows a different variant) may differ from other marketplaces.
- No Amazon-internal data, systems, credentials, tools or process details anywhere. The only Amazon-related input is the publicly released ABO dataset.
- The owner labels are one person's judgement. Inter-rater agreement is not measured (limitation).

## 9. Assumptions
- A1. ABO listings carry enough structured fields (colour, item type, and for many listings material or pattern) in English to build the sample. DATA-PLAN section 3 defines the inventory check and the stop rule if this is false.
- A2. ABO has no structured pack-count field, so pack count is derived from title text and is evaluated on natural and control listings only, as exploratory (DATA-PLAN section 6.6).
- A3. The owner can label about 230 listings (roughly 800 attribute judgements) in a few sittings; the page saves progress locally. No basis for the time estimate beyond the owner's judgement; the pilot on `natural-dev` (30 listings) will show whether it holds.
- A4. The owner uses Google Gemini (personal Google account, key from Google AI Studio) as the primary VLM; OpenAI and Anthropic adapters are optional. The owner accepts the cost estimate before each paid run and records the data-use decision before the first real call.
- A5. The listings ABO provides are ordinary catalog entries. The natural mismatch rate may be low (a few percent), in which case the natural gate criteria G05 and G06 may be INCONCLUSIVE. The project is designed to report that honestly and still be useful (SPEC section 9, pre-stated expectation and section 9.2).
- A6. A browser call to the Gemini API from the Live page may or may not work from a given origin (CORS); this is verified by the owner during build, and the Live page falls back to mock-only if it does not (SPEC 14b).

## 10. Out of scope
- Publishing, pushing, or creating any GitHub repository, Pages site or hosting of the Live page (a later, separate owner decision; agents never do it).
- Training or fine-tuning any model.
- Multi-image listings, video, 3D models (ABO's other modalities), and image quality or policy checks (blur, watermark, nudity).
- Detecting price, brand or counterfeit problems.
- A web service, database, authentication, multi-user labelling, or inter-rater studies. A hosted backend holding any author key.
- Image-URL input on the Live page (local files only).
- Any scraping of marketplace websites; any use of non-public data.
- Claims about the share of mismatches on any particular real marketplace.
