# Listing Photo-vs-Text Mismatch Detector: data plan
Version 1.2 (revised after design reviews 1 and 2; written before any data was downloaded or measured). Companion to [PRD.md](PRD.md) and [SPEC.md](SPEC.md). All numeric values here are pre-registered with the SPEC gate and hashed at freeze stage 0. Seeds, quotas and tables MUST NOT change after stage 0 (section 8) except by a recorded amendment (SPEC pre-registration paragraph). Review responses are in [AMENDMENTS.md](AMENDMENTS.md).

Built with AI coding agents; Anirudh wrote the spec, gates and reviews.

## 1. Source
- **Dataset:** Amazon Berkeley Objects (ABO), a public research dataset released by Amazon for non-commercial research. Used here only as a public dataset. No Amazon-internal data, systems, credentials or work accounts are involved at any point.
- **Parts used:** the listing metadata archive and the image metadata file, plus the **smallest image size** (`images/small`, the dataset's reduced-resolution JPEGs), for the selected listings only. Nothing from the 3D model, 360-view or catalog-image-with-render parts.
- **Host and files (to be verified at download time, not assumed):** the dataset's public bucket host `amazon-berkeley-objects.s3.amazonaws.com`. Planned files: `archives/abo-listings.tar` (about 83 MB; a HEAD request during planning returned 200 and 87,480,320 bytes) and `images/metadata/images.csv.gz` (about 6 MB; HEAD returned 200, 6,430,535 bytes). Images are fetched one file at a time from `images/small/<path>` using the `path` column of `images.csv.gz`, to avoid the multi-gigabyte image archive. If single-file access is refused, the fallback is the small-image archive (about 3 GB) with owner confirmation of disk space, extracting only the selected paths; without that confirmation, STOP.
- **Allowed network use for data:** only that host, only via `scripts/fetch-abo.cjs`. No scraping of any website, ever.

## 2. Licence and attribution
- ABO is published under **CC BY-NC 4.0** (attribution, non-commercial). This project is a non-commercial portfolio project.
- **Verify, do not assume.** `scripts/fetch-abo.cjs` MUST retrieve the dataset's licence statement from the dataset's own page or bucket (the page linked from the ABO project page) and store: the retrieved text, its SHA-256, the URL and the access date in `data/SOURCES.lock.json`. If the text cannot be retrieved, or does not state CC BY-NC 4.0 (or a more permissive licence), STOP and report to the owner; do not continue.
- `docs/DATA-SOURCES.md` (written after the fetch) MUST contain: dataset name and URL; licence name and the URL of the licence text; the access date; files and byte sizes downloaded; the exact citation as given by the dataset page (expected: Collins et al., "ABO: Dataset and Benchmarks for Real-World 3D Object Understanding", CVPR 2022; check the wording against the dataset page); a statement that images and metadata belong to their original rights holders under the dataset licence; and the sentence "Used for non-commercial portfolio research; no commercial use."
- **Redistribution.** Raw data (`data/`) is gitignored and excluded from any public package by default. A public package may include at most 12 thumbnails for the demo page and the manifests' listing ids, only if the retrieved licence text allows sharing with attribution; each thumbnail carries the citation. The owner decides at publishing time (out of scope here). The labels JSON files contain ids, verdicts and notes, not data from the dataset, and may be published.

## 3. Sample inventory, eligibility and stop rules
### 3.1 Fields read from each ABO listing record
Verify names against the actual files at inventory time and record any difference in `data/splits/inventory.json`. Expected: `item_id`, `item_name` (array of `{language_tag, value}`), `brand`, `color` (array of `{language_tag, value, standardized_values}`), `material`, `pattern`, `product_type` (array of `{value}`), `model_name`, `main_image_id`, `country`, `marketplace`.

### 3.2 Attribute fields used
| Attribute key | Source | Notes |
|---|---|---|
| `colour` | first English `color[].value`, trimmed | Required for every selected listing. Mapped to a colour family by `src/families.json`. Multiple distinct colour values: kept for natural sets, ineligible for colour swaps. |
| `item_type` | `product_type[0].value` mapped to a lower-case display name by `src/lexicon.json` (for example `SHOES` becomes `shoes`) | Required. |
| `material` | first English `material[].value`, trimmed | Optional. |
| `pattern` | first English `pattern[].value`, trimmed | Optional. |
| `pack_count` | parsed from the title (section 6.6) | Optional; no structured field exists in ABO as far as inspected. Natural and control listings only; never planted. |
| title | first English `item_name[].value`, trimmed; at most 250 characters | Required. |

### 3.3 Eligibility (a listing is a candidate only if all hold)
1. English title and colour value present (language tag starting `en`).
2. `product_type` is in the chosen categories (3.5).
3. `main_image_id` resolves in `images.csv.gz` and the small JPEG downloads, is a JPEG (magic bytes), 1 KB to 2 MB, longest side at most 512 px.
4. Title length 10 to 250 characters.
5. Not in a duplicate group already used: at most one listing per group, where group = `(brand, model_name)` if `model_name` exists, else `(brand, first 40 characters of lower-cased title)`. Also at most one listing per `imageSha256`. This keeps listings independent (ABO has many colour or size variants of one product) and prevents the same product appearing in two sets.
6. Marketplace preference: use `country == "IN"` listings if at least 3,000 eligible candidates exist after rules 1 to 5 in the whole inventory; otherwise all English-tagged listings. Record the choice and the counts in `inventory.json`.

### 3.4 Stop rules (any one fires: `build-sample` exits with code 2 and the owner is told; nothing is relaxed silently)
- S1: the licence check in section 2 fails.
- S2: fewer than 3 product types have at least 250 eligible candidates after rules 1 to 6.
- S3: in the chosen categories, fewer than 150 candidates are eligible for a colour swap (a single non-multicolour family **and a source-family colour word in the title**, so the title can always be rewritten; section 6.2; the 150 are counted after that condition), or fewer than 130 for an item-type swap (a noun of the source type in the title; section 6.3). (Quotas need 98 and 88; the surplus covers failed image downloads and rewrites.)
- S4: fewer than 95% of tried image downloads succeed.
- S5: after assignment, any set is below its size in section 4 by more than 5%.

### 3.5 Categories
Fashion and home categories with colour, material and item-type attributes. ABO's mix is heavier on home goods and footwear than on apparel, so the categories are chosen by a fixed rule after the inventory, not by name now:
1. Take product types in this priority order, keeping those with at least 250 eligible candidates: `SHOES`, `SANDAL`, `BOOT`, `SHIRT`, `DRESS`, `SWEATER`, `HANDBAG`, `RUG`, `CUSHION`, `BED`, `SOFA`, `CHAIR`, `LAMP`.
2. If fewer than 5 are selected, fill up to 5 with the remaining product types in descending candidate count, still at least 250 each.
3. Selected: 3 to 5 product types. The inventory file records candidate counts for every product type, so the choice is auditable. If the final choice has no apparel at all, say so in `DATA-SOURCES.md` and the report.
- **Allocation:** equal quota per selected category in every set (rounded; remainders go to the categories with the most candidates, in descending order). The overall rates in the report therefore describe this category-balanced sample, not the catalog's own mix. Per-category rates are always shown.

### 3.6 If ABO cannot be downloaded (stop and report; nothing is scraped)
If any download in section 1 fails, or the licence check in section 2 fails, the build STOPS and reports to the owner. Nothing is fetched from any other source until the owner decides. Candidate alternatives to present to the owner (each needs its own licence check and the owner's explicit choice before anything is downloaded; none is assumed to be suitable):
- A public fashion product-image dataset published on a dataset hub with a stated open licence and structured colour and item-type attributes (for example, a small-image fashion product dataset released for research). The owner confirms the licence text and the access terms (some require an account login, which is the owner's action).
- The same ABO files obtained from the dataset's official mirror, if the primary bucket host is unreachable (same licence, same checks).
- A smaller subset of ABO restricted to fewer product types, if S2 or S3 fires, with the reduced sample sizes stated in the report (the owner approves the change before it is made; the pre-registered gate is not relaxed).
Using any marketplace website, crawler or unofficial scraper is never an alternative.

## 4. Sets and sizes
Total 704 listings (inside the 300 to 1,000 target). Every listing belongs to exactly one set; no id, image hash or duplicate group is shared between sets.

| Set | Listings | Composition | Used for |
|---|---|---|---|
| `natural-dev` | 30 | untouched, random | prompt tuning on real listings; owner labels it first |
| `natural-heldout` | 200 | untouched, random | the natural mismatch rate, kappa (gate G05, G06) |
| `planted-dev` | 90 | 36 controls, 18 colour swaps (14 far, 4 near), 16 item-type swaps, 10 material swaps, 10 pattern swaps | prompt, `tau` and baseline tuning |
| `planted-heldout` | 384 | 160 controls, 80 colour swaps (60 far, 20 near), 72 item-type swaps, 36 material swaps, 36 pattern swaps | gate G01 to G04, G07 |

- A planted listing carries at most one swap. Controls are real, untouched listings with no change at all.
- The held-out sizes are chosen for precision: 60 far colour positives and 72 item-type positives, with 300 or more negatives per gated attribute. SPEC section 9.1 states the resulting interval widths.
- Material and pattern quotas are exploratory. If fewer eligible listings exist than a quota, the quota shrinks, the shortfall is recorded in the planting log and the report, and no stop rule applies. Colour and item type quotas are protected by S3.
- The natural sets are not enriched or filtered beyond section 3.3. The owner never selects listings.

## 5. Selection and split procedure (`src/sample.cjs`, `scripts/build-sample.cjs`)
1. Parse the listing archive. Build the candidate list per category with the eligibility rules (images are checked in step 5).
2. Order candidates deterministically: ascending SHA-256 of the string `"listing-mismatch-v1|" + id` (hex compare). No `Math.random`.
3. Dedupe by group and by image hash, keeping the first in this order.
4. Assign in this fixed order, each step drawing from the not-yet-used candidates of each category in the same order, per-category quota: `natural-heldout`, `natural-dev`, `planted-heldout` conditions in the order colour-far, colour-near, item-type, material, pattern, controls, then `planted-dev` in the same condition order. A swap condition draws only candidates eligible for that swap.
5. Download images for every assigned listing. A failed download or invalid image replaces that listing with the next eligible candidate in order for the same category and condition (the replacement is recorded). Replacements are allowed only before freeze stage 1.
6. Write manifests (section 7) in canonical form and print counts per set, category and condition.
Seeds: selection uses the SHA-256 ordering above (no random seed). All later seeded steps use mulberry32 with the seeds in the table below.

| Use | Seed |
|---|---|
| Planting target choice | 20250102 |
| Labelling page order | 20250103 |
| Bootstrap (SPEC 8.4) | 20250101 |
| Mock provider noise | listing id hashed with 20250104 |

## 6. Planting procedure (`src/plant.cjs`, `scripts/plant.cjs`)
Planting changes real listings in text only. The image is never altered.

### 6.1 General rules
- Exactly one attribute per planted listing is changed, to a value that is a different member of the same attribute kind.
- **Consistent rewrite.** The title is rewritten so that it agrees with the new attribute value, which is how a real photo-vs-text error looks (a seller writes consistent text about the wrong photo). The rewrite replaces the maximal consecutive run of words in the title that belong to the source value's family (for colour: all colour words of the source family, for example "Navy Blue" in the title becomes "Red"), matching case style (all upper, first letter upper, or lower). **Colour and item-type swaps are allowed only on listings whose title contains a source-family colour word (or a noun of the source item type), so `titleRewritten` is always `true` for them** and the title never contradicts the attribute (a text-vs-attribute conflict would let a model flag the swap without reading the photo). For the exploratory material and pattern swaps, if the source value does not appear in the title only the attribute changes and the planting log records `titleRewritten: false`; those pairs are reported separately as "text conflict possible". If any source-family word remains in the title after the rewrite, the candidate is rejected and the next eligible candidate is used.
- The planting log (split by set: `data/splits/planting-log-dev.jsonl` for `planted-dev`, `data/heldout/planting-log-heldout.jsonl` for `planted-heldout`) has one line per planted listing: `id`, `set`, `attribute`, `from`, `to`, `stratum`, `titleRewritten`, `titleBefore`, `titleAfter`. The two logs are the only ground truth of planted sets. Agents do not open the held-out log (SPEC 1.1 rule 3).
- Target values are chosen with mulberry32 seed 20250102, drawing sequentially in the order of the sorted listing ids.

### 6.2 Colour
Families (12): `black, white, grey, brown, beige, red, orange, yellow, green, blue, purple, pink`. A tag `multicolour` covers values such as "multi", "assorted", or two or more families, and is never swapped. `src/families.json` holds: the name-to-family map (common colour words and compound names such as navy, maroon, teal, cream, tan, charcoal, olive, mustard, turquoise, burgundy), sRGB prototypes for the baseline, and the table below.

| Source family | Near set (swap target in the **near** stratum; exploratory) |
|---|---|
| black | grey, brown, blue |
| white | beige, grey |
| grey | black, white, blue |
| brown | black, beige, orange, red |
| beige | white, brown, yellow |
| red | pink, orange, brown, purple |
| orange | red, yellow, brown |
| yellow | orange, beige, green |
| green | blue, yellow |
| blue | purple, green, black, grey |
| purple | blue, pink, red |
| pink | red, purple |

- **Near-set table use.** The table is the single definition of "near". The colour baseline's adjacency is its symmetric closure, untuned (SPEC 5.1).
- **Far stratum (gated):** the target is drawn uniformly from every family that is neither the source nor in the source's near set.
- **Near stratum (exploratory):** the target is drawn uniformly from the near set. These are ambiguous even for people (navy and black). They are reported separately and excluded from the gate tables.
- Eligible source: the colour value maps to exactly one non-multicolour family, **and the title contains at least one colour word of that family** (so the rewrite in 6.1 always happens). This applies to far and near swaps. The planting log records `titleRewritten: true` for every colour swap.
- In the planted-held-out set, a swap quota of 80 colour listings is 60 far and 20 near; in planted-dev, 14 far and 4 near.

### 6.3 Item type
- `src/lexicon.json` lists, for each selected product type, its display name, the nouns that identify it in titles (for example `shoes`, `sneakers`, `sandals`), its department, and the allowed swap targets. Allowed targets are other types from the same department that look clearly different in an image, and exclude look-alikes (for example sandal and slipper, shoes and sneakers, sofa and loveseat, chair and stool). The file is written from the inventory counts and general knowledge before freeze stage 1 and is hashed in it.
- Eligible source: the title contains at least one noun of the source type. The first noun occurrence is replaced by the target's primary noun (preserving case style) and the `item_type` attribute is set to the target's display name. If the title has no such noun the listing is not eligible for an item-type swap, so every item-type swap is rewritten consistently.
- If a category has no allowed targets within the chosen categories, the target may come from any selected category's type in the same department; if there is still none, the category contributes no item-type swaps (the quota shifts to other categories, recorded).

### 6.4 Material
Families (initial list, frozen with the lexicon): `leather, cotton, wool, polyester, metal, wood, plastic, glass, ceramic, rubber, foam`. Similar-set exclusions (never swapped between): leather and faux leather; cotton and linen and canvas; polyester and nylon and microfibre; wood and engineered wood and plywood. The material value must map to one family. Rewrite as in 6.1.

### 6.5 Pattern
Families: `solid, striped, floral, checked, geometric, animal_print, polka_dot`. Swap to any other family except similar pairs (checked and plaid, geometric and abstract). Eligible only if the pattern value maps to one family. Rewrite as in 6.1.

### 6.6 Pack count (natural and control listings only)
- Parse from the title: `(pack|set|lot|combo|bundle)\s+of\s+(\d{1,2})`, or `(\d{1,2})\s*[- ]?\s*(pack|pcs|pieces?|count|piece set)`. Accept a single integer from 2 to 20; if two different integers match, leave `pack_count` null.
- `pack_count` is sent to the model and the text baseline compares the title and the attribute. It is evaluated on the natural set as the owner labels it, and on planted controls as negatives. It is not planted, because ABO main images rarely show a countable pack and a planted pack-count error would have no reliable ground truth. The report states how many listings carry a pack count; if fewer than 15 natural held-out listings do, pack-count findings are reported as not evaluable.

### 6.7 Known limits of planting (stated before measuring)
- A control may itself contain a real mismatch, which makes planted precision a conservative figure (a correct real flag counts as a false positive). Likewise, if the original text was wrong and the swap happens to match the photo, a planted positive is wrong. Both are rare in expectation but unmeasured. After the gated run, the owner may adjudicate false positives and false negatives of the held-out run and report an "adjudicated" figure as a supplementary analysis, clearly labelled post-hoc and never used for the gate.
- A planted swap is a larger, cleaner error than most real ones. Planted metrics are an upper-bound style check of the machinery; they are not the natural result.

## 7. Files and layout
```
data/                                   gitignored; excluded from any public package by default
  raw/abo-listings.tar, listings/...    downloaded archive and extracted listing shards
  raw/images.csv.gz                     image metadata
  images/<xx>/<imageSha256>.jpg         small images for all assigned listings of every set, in ONE folder tree, named by content hash only (xx = first two hex chars), so the file system reveals no set membership or id; manifests map ids to these paths
  SOURCES.lock.json                     URLs, byte sizes, SHA-256 of each downloaded file, licence text, its hash, access date
  splits/inventory.json                 counts by reason and product type; choices made (3.3, 3.5)
  splits/natural-dev.json  planted-dev.json        dev manifests (canonical JSON arrays, SPEC 3.1 records)
  splits/planting-log-dev.jsonl         planted ground truth for planted-dev
  splits/image-hashes-natural-dev.txt  image-hashes-planted-dev.txt   sorted "<id> <imageSha256>" lines
  heldout/natural-heldout.json  planted-heldout.json   held-out manifests
  heldout/planting-log-heldout.jsonl    planted ground truth for planted-heldout
  heldout/image-hashes-natural-heldout.txt  image-hashes-planted-heldout.txt
  labels/natural-dev.labels.json        owner labels (section 9); written only by the owner
  labels/natural-heldout.labels.json
eval/freeze.json  eval/approvals.json  eval/runs.jsonl  eval/HISTORY.md  eval/cache/  eval/results-private/  eval/results/
```
- **Package exclusions.** `data/`, `eval/cache/`, `eval/results-private/`, `.denylist.local` and `.agents/` are in `.gitignore` and are never packaged; `.agents/` holds private owner context and review working files.
- **Held-out output rule.** For held-out sets every script prints only counts per set, category and condition, never ids, titles, values or verdicts (SPEC 1.1 rule 3).
- Dev work reads only `data/splits/` and `data/labels/natural-dev.labels.json` (through `src/sets.cjs`). Held-out files are in `data/heldout/` so that access control, review and the owner's optional move of that folder out of the workspace are simple (SPEC 10.4).
- **Canonical form for hashing.** Each manifest is written as a JSON array with records sorted by `id`, object keys sorted recursively, no insignificant whitespace, one record per line, UTF-8 without BOM, LF line endings, one trailing LF. The same canonicalisation is used for `tasks.js` content and `tasksHash`. File hashes use `fileHash` from `src/hash.cjs` (CRLF to LF, BOM stripped, SHA-256, lower-case hex), the same convention as the sibling project's evaluation.

## 8. Hashing and freeze procedure (four stages)
`scripts/freeze.cjs --stage gate|data|method|labels` writes or extends `eval/freeze.json` (with a UTC timestamp per stage) and prints the entry text for `eval/HISTORY.md`. Each stage is a commit in a local git repository (no remote), made by the owner running `freeze.cjs` (agents never do) and refused unless the tree is clean and the previous stage's commit is present and recorded in the committed `eval/HISTORY.md` (SPEC pre-registration paragraph). A stage cannot be rewritten once written (except `gate --amend`, SPEC pre-registration paragraph); a mismatch afterwards is a guard violation (SPEC 10.2). The hashes listed per stage are in SPEC 10.1.

| Stage | When | What is hashed (summary) | After this stage |
|---|---|---|---|
| 0 `gate` | after `src/gate.cjs`, `freeze.cjs` and the other code are written and tested, **before `fetch`** and before any data work; requires the owner's `gate` approval | frozen region of `docs/SPEC.md`, `docs/DATA-PLAN.md`, `src/gate.cjs` | gate, sizes, seeds, planting rules and freeze procedure cannot change except by recorded amendment |
| 1 `data` | after the sample, planting and image checks, before any prompt or baseline tuning and before any real-provider call | lexicon, initial families, the four manifests, the two planting logs, the four image-hash files, `SOURCES.lock.json` | no change to splits or planting; dev tuning allowed |
| 2 `method` | after dev tuning, before the owner labels `natural-heldout` and before any held-out call | prompt file and `promptHash`, final families, baseline tuning values, `tau`, model identifier, code hash | prompt, baselines, `tau` and model are immutable for counted runs |
| 3 `labels` | after the owner finishes `natural-heldout` and before run 1 | `data/labels/natural-heldout.labels.json`, `labelling/tasks.js` | natural held-out labels are fixed |

**Evidence for stages 0 to 3.** The owner runs `git init` once (no remote, never pushed). Each stage is one commit whose message contains the stage name and the printed hashes (the held-out hashes appear in the message because `data/` is ignored). The owner pastes the printed entry, with its commit id and the date, into `eval/HISTORY.md` and commits that file before the next stage. The commit chain and the dated HISTORY lines are the evidence. A local repository can be rewritten by whoever holds the files, so this makes backdating detectable, not impossible; an optional e-mail of each entry to himself adds a third-party timestamp.

Order of work (the sequence is part of the plan):
1. Write and test the code that enforces the gate (`gate.cjs`, `freeze.cjs`, `sets.cjs`, `approve.cjs`). Owner records the `gate` approval. **Freeze stage 0.** Only now may `fetch` run (`fetch` refuses without a stage-0 entry).
2. `fetch`, `sample`, `plant`; owner reviews the counts and 10 random planted examples from `planted-dev` only (titles before and after); fix any planting defect found, then **freeze stage 1**. A fix that changes this plan or the frozen SPEC text is a recorded amendment (made before any measurement, so not post-hoc); a fix inside `src/plant.cjs` only is not.
3. Owner labels `natural-dev` (30 listings) in the labelling page.
4. Owner records the `data-use` approval (SPEC 10.6). Smoke run (SPEC 10.5, three `planted-dev` listings) with the candidate model.
5. Dev tuning on `planted-dev` (numbers) and `natural-dev` (reading examples): prompt wording, baseline foreground threshold and share rule (SPEC 5.1), `tau` (SPEC 8.2). Held-out sets are not read by any tuning command. Record the baseline values in HISTORY.
6. **Freeze stage 2.**
7. Owner labels `natural-heldout` (200 listings) with no model output visible, then records the `labels-own` approval. Owner does not edit the prompt, baselines or `tau` after seeing these listings. **Freeze stage 3.**
8. Smoke record for the identical provider and model must exist. Counted held-out run 1 (both held-out sets). Evaluate. Log in `eval/HISTORY.md`. Run 1 is the verdict of record.
9. Runs 2 and 3 only under SPEC 10.2 (code bug fixes only).

## 9. Owner labelling
### 9.1 Scope
- 230 listings: `natural-dev` (30) and `natural-heldout` (200). Per listing there are 2 to 5 attribute judgements (colour and item type always; material, pattern and pack count when present), so roughly 700 to 900 judgements in total. At 10 to 15 seconds each this is about 2 to 3.5 hours, in several sittings. The page autosaves progress.
- Per judgement: `match`, `mismatch` or `cannot_tell`, with the question in SPEC section 6. Optional `tag` from the fixed list in SPEC 8.7 for a `mismatch`, and an optional `note` of at most 200 characters.
- The owner labels alone, and **only the owner produces label files**: no agent creates, edits, pre-fills or infers any file under `data/labels/` and no model or baseline output stands in for a label (SPEC 1.1 rule 2). Labelling `natural-heldout` completely is a hard prerequisite for counted runs (SPEC 10.2); until then natural results are "not measured" and no counted run happens. No second labeller, so inter-rater agreement is unknown and kappa measures agreement with one person. This is a stated limitation.

### 9.2 Page
`labelling/index.html` (SPEC section 6). Double-click to open. It reads `labelling/tasks.js` (generated from the manifests) and the images in `data/images/`. It saves to a downloadable JSON file. It needs no server and makes no network request.

### 9.3 Tasks content (`window.LISTING_TASKS`)
```json
{
  "schema": "listing-mismatch-tasks/v1",
  "tasksHash": "hex",
  "splits": {
    "natural-dev": [ { "id": "B07XXXXXXX", "title": "…", "image": "images/ab/ab12cd34.jpg",
                       "attributes": { "colour": "Navy Blue", "item_type": "shoes", "material": null, "pattern": null, "pack_count": null } } ],
    "natural-heldout": [ … ]
  },
  "order": { "natural-dev": ["id", …], "natural-heldout": ["id", …] }
}
```
It never includes planted records, baselines or model outputs. `order` is the seeded shuffle (seed 20250103).

### 9.4 Label file format and path
The page downloads `labels-<split>-<count>.json`. The owner saves it as `data/labels/<split>.labels.json` (`natural-dev.labels.json`, `natural-heldout.labels.json`).
```json
{
  "schema": "listing-mismatch-labels/v1",
  "split": "natural-heldout",
  "tasksHash": "hex",
  "labeller": "owner",
  "synthetic": false,
  "createdAt": "2025-01-01T00:00:00.000Z",
  "labels": [
    { "id": "B07XXXXXXX",
      "attributes": {
        "colour": { "verdict": "mismatch", "tag": "shade_ambiguity", "note": "photo is teal, text says blue" },
        "item_type": { "verdict": "match", "tag": null, "note": "" }
      } }
  ]
}
```
Validation (CLI loader and page): `labeller` must be `owner`; `synthetic` must be `false` (fixtures live only under `test/fixtures/` as `*.fixture-labels.json` with `synthetic: true` and no real id, and are refused for any non-mock run; SPEC 1.1 rule 2); `schema` and `tasksHash` must match; every id must be in the split; every non-null task attribute must have a verdict for a listing to count as complete; verdict in {`match`, `mismatch`, `cannot_tell`}; `tag` null or from the SPEC 8.7 list and only with `mismatch`; `note` at most 200 characters. For `natural-heldout`, all 200 listings must be complete before freeze stage 3; otherwise the freeze refuses and says how many are missing. An incomplete label file is never scored by the gate.

### 9.5 Evidence that the labels are the owner's
At freeze stage 3 the script prints the SHA-256 of `natural-heldout.labels.json`. The owner copies it into `eval/HISTORY.md` with a dated line "I labelled these myself with no model output visible" (recorded as the `labels-own` approval, SPEC 10.6). Stage 3 refuses if the labels file `createdAt` is earlier than the stage 2 timestamp. The labelling page is the only producer of the file.

## 10. Run budget
- Development runs on `planted-dev` and `natural-dev`: unlimited in number, each logged to `eval/runs.jsonl` as uncounted, subject to the owner's cost confirmation each time.
- Before run 1 the owner records the model's documented request limits and the days D needed for one run (SPEC 10.3); `--continue-run` is allowed D times.
- Counted held-out runs: **at most 3** over `planted-heldout` and `natural-heldout` together (SPEC 10.2). A run counts once at least one held-out request returned HTTP 2xx; a run that ends before that is `void` and does not count. Each counted run is logged in `eval/HISTORY.md` with provider, model, `promptHash`, code hash, `tau`, the gate result, and the reason for the run.
- **Run 1 is the first measurement and the gate verdict of record.** Runs 2 and 3 are allowed only after a code bug (in parsing, the client or the metrics) first reproduced by a unit test or on a development set; the prompt, `tau`, model, baselines, lexicon and families do not change (SPEC 10.2). The case study states "run 1 FAILED; after fix X, run K passed" if that is what happened.
- Because every held-out run uses the same sets, runs 2 and 3 are not independent of run 1. The report shows all runs, in order, and states which run each headline number comes from. The headline natural rate (owner labels) does not depend on any run.

## 11. Honest limits of the data (to be carried into the report)
- ABO is one marketplace's catalog released for research. Its mismatch rate need not resemble any other marketplace's.
- Selection requires an English title, a colour and a product type, so it over-represents complete listings.
- The main image of ABO listings is the only image used; real shoppers see several.
- Small images (reduced resolution) make fine detail (material, pattern, counts) hard. A low VLM score on those attributes may reflect the image size, not the model.
- Category balance is imposed, so overall figures are for the balanced sample.
- Gemini free-tier inputs may be used by Google to improve its products; the owner records a `data-use` decision (SPEC 10.6) before the first real call, after reading the ABO licence text and Google's terms.
- The pre-registered gate is easier on planted data than on real data; planted and natural results are reported separately and a pass on planted criteria is never described as a pass on natural criteria.
- One labeller, one pass, no adjudication.
