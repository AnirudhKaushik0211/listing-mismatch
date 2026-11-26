# Evaluation report

Built with AI coding agents; Anirudh wrote the spec, gates and reviews.

Design reviews were run by AI review agents; the owner decided which findings to accept.

There are no users, no production deployment and no adoption.

## Status

**Pilot on practice (dev) data, not the pre-registered evaluation; full evaluation in progress.** No evaluation run exists. Freeze stages 0 to 2 are recorded in `eval/HISTORY.md`; held-out listings have not been run or opened, and this report gives no evaluation verdict.

A pilot with real `gemini-3.5-flash` verdicts (model not pinned by the provider) ran on 15 planted-dev and 7 natural-dev listings, with the colour baseline on the same listings. It is shown on the Results page (`demo/index.html`) with 95% Wilson intervals. Headline counts, all on dev listings that were also used to set `tau` (0.9) and the baseline settings:

- Colour, planted (15 listings): the model caught 7/7 planted colour swaps (95% interval 0.65 to 1.00) and falsely flagged 2/8 unchanged colours (0.07 to 0.59). The colour baseline gave the same counts.
- Item type, planted: 4/4 caught (0.51 to 1.00), 1/11 false flags (0.02 to 0.38). Material: 1/1 caught (0.21 to 1.00), 0/14 false flags, 4/15 cannot_tell (0.11 to 0.52).
- Natural (7 listings, owner labels): 1 owner mismatch (material), which the model also flagged; model and owner agreed on 17 of 21 attribute pairs. Too few listings for any mismatch rate.

These numbers show the pipeline works end to end on real model output. They are not the evaluation, are not an estimate of performance on other listings, and must not be quoted as results. Everything below the next line is the output of the mock provider on synthetic fixtures, stamped "MOCK RUN, NOT A MEASUREMENT"; this section is maintained by hand and `scripts/eval.cjs` regenerates the rest.
**MOCK RUN, NOT A MEASUREMENT.** This report was produced by the mock provider on synthetic fixtures. It exercises the pipeline only. Nothing in it describes real model or listing behaviour.

Status: MOCK RUN, NOT A MEASUREMENT. Gate: NOT EVALUABLE (mock provider).

Run: mock-fixture. Provider: mock. Model: mock. Prompt hash: 3a9f54d7a6b6798788e02aecfeaf1558f7a65912c1fd7951c468b6a0919d300d. tau: 0.6.

## Planted test (sets with known, programmatically derived ground truth)

Listings: 10. Planted and natural results are never pooled.

### baseline-colour

| attribute | TP | FP | FN | TN | precision | recall | F1 | cannot_tell rate |
|---|---|---|---|---|---|---|---|---|
| colour | 2 | 0 | 0 | 7 | 1.000 | 1.000 | 1.000 | 0.000 (0.000 to 0.299, n=9) |

### baseline-text

| attribute | TP | FP | FN | TN | precision | recall | F1 | cannot_tell rate |
|---|---|---|---|---|---|---|---|---|
| colour | 0 | 0 | 2 | 7 | n/a | 0.000 | 0.000 | 0.000 (0.000 to 0.299, n=9) |
| item_type | 0 | 0 | 2 | 8 | n/a | 0.000 | 0.000 | 0.000 (0.000 to 0.278, n=10) |
| material | 0 | 0 | 1 | 3 | n/a | 0.000 | 0.000 | 0.000 (0.000 to 0.490, n=4) |

### vlm

| attribute | TP | FP | FN | TN | precision | recall | F1 | cannot_tell rate |
|---|---|---|---|---|---|---|---|---|
| colour | 0 | 0 | 2 | 7 | n/a | 0.000 | 0.000 | 0.222 (0.063 to 0.547, n=9) |
| item_type | 2 | 1 | 0 | 7 | 0.667 | 1.000 | 0.800 | 0.000 (0.000 to 0.278, n=10) |
| material | 1 | 0 | 0 | 3 | 1.000 | 1.000 | 1.000 | 0.000 (0.000 to 0.490, n=4) |

Colour F1, far stratum: VLM 0.000, colour baseline 1.000; difference -1.000 (bootstrap 95% -1.000 to -1.000).

Near-stratum colour swaps are excluded from the gate tables. Flagged counts: {"baseline-colour":{"n":1,"flagged":0},"baseline-text":{"n":1,"flagged":0},"vlm":{"n":1,"flagged":0}}.

## Natural test (owner labels)

Labels here are synthetic fixture labels (not human labels).

Listings labelled: 6. Natural mismatch rate: 0.333 (0.097 to 0.700, n=6). Cannot-tell sensitivity: lower-bound reading 0.333 (0.097 to 0.700, n=6); upper-bound reading 0.667 (0.300 to 0.903, n=6).

### baseline-colour

Kappa (three-class, colour, item type, material): 0.435 (bootstrap 0.264 to 0.617); binary kappa 1.000; flags 2, confirmed 2, hit rate 1.000; cannot_tell rate 0.538 (0.291 to 0.768, n=13).

| attribute | TP | FP | FN | TN | precision | recall | F1 | cannot_tell rate |
|---|---|---|---|---|---|---|---|---|
| colour | 2 | 0 | 0 | 4 | 1.000 | 1.000 | 1.000 | 0.000 (0.000 to 0.390, n=6) |
| item_type | 0 | 0 | 0 | 5 | n/a | n/a | n/a | 1.000 (0.566 to 1.000, n=5) |
| pack_count | 0 | 0 | 0 | 1 | n/a | n/a | n/a | 1.000 (0.207 to 1.000, n=1) |

### baseline-text

Kappa (three-class, colour, item type, material): 0.339 (bootstrap 0.000 to 0.821); binary kappa 0.000; flags 0, confirmed 0, hit rate n/a; cannot_tell rate 0.077 (0.014 to 0.333, n=13).

| attribute | TP | FP | FN | TN | precision | recall | F1 | cannot_tell rate |
|---|---|---|---|---|---|---|---|---|
| colour | 0 | 0 | 2 | 4 | n/a | 0.000 | 0.000 | 0.000 (0.000 to 0.390, n=6) |
| item_type | 0 | 0 | 0 | 5 | n/a | n/a | n/a | 0.000 (0.000 to 0.434, n=5) |
| pack_count | 0 | 0 | 0 | 1 | n/a | n/a | n/a | 0.000 (0.000 to 0.793, n=1) |

### vlm

Kappa (three-class, colour, item type, material): 1.000 (bootstrap 1.000 to 1.000); binary kappa 1.000; flags 2, confirmed 2, hit rate 1.000; cannot_tell rate 0.154 (0.043 to 0.422, n=13).

| attribute | TP | FP | FN | TN | precision | recall | F1 | cannot_tell rate |
|---|---|---|---|---|---|---|---|---|
| colour | 2 | 0 | 0 | 4 | 1.000 | 1.000 | 1.000 | 0.000 (0.000 to 0.390, n=6) |
| item_type | 0 | 0 | 0 | 5 | n/a | n/a | n/a | 0.000 (0.000 to 0.434, n=5) |
| pack_count | 0 | 0 | 0 | 1 | n/a | n/a | n/a | 0.000 (0.000 to 0.793, n=1) |

Listings where the text-only baseline finds a title-vs-attribute disagreement (not a photo mismatch): 0.

## Operations (pooled over both sets, labelled as pooled)

Call-level failures: 0 of 16 listings sent (rate 0.000). Attribute-level parse errors (not part of G07): 0.

## Cost and latency

Tokens: 14400 input, 1280 output. cost: not computed (no eval/prices.json entry). Cost per 1,000 listings: not computed. Latency ms: p50 1, p95 1, mean 1.0. (Mock figures are fixed placeholders.)

## Gate criteria

(Mock run: these rows only show that the gate code runs. They say nothing about any model.)

| id | status | detail |
|---|---|---|
| G01 | FAIL | precision or recall not defined (n/a) |
| G02 | FAIL | precision 0.667, recall 1.000 |
| G03 | PASS | cannot_tell rate 0.105 |
| G04 | FAIL | F1 difference -1.000, lower bound -1.000 |
| G05 | INCONCLUSIVE | owner mismatch pairs 2 < 15 |
| G06 | INCONCLUSIVE | VLM flags 2 < 10 |
| G07 | PASS | failure rate 0.000 |
| G08 | FAIL | not checked |
| G09 | FAIL | not checked |

## Limits

- One marketplace catalog sample; its rate need not resemble any other marketplace.
- One labeller, one pass; agreement is with one person.
- Planted swaps are larger and cleaner than most real errors.
- Small images make material and pattern hard to judge.
- Model not pinned by the provider unless the identifier is a dated snapshot.
