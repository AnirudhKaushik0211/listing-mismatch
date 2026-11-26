# Case study: listing photo-vs-text mismatch detector
Template. Every real-world value is a `[[placeholder]]`. Fill only with real, checked numbers; delete any clause you cannot support. Nothing below has been measured yet.

Built with AI coding agents; Anirudh wrote the spec, gates and reviews.

Design reviews were run by AI review agents; the owner decided which findings to accept.

## One-line summary
A per-attribute check of whether a product photo contradicts its listing text, comparing a vision model with a non-AI baseline on a public catalog sample, with a gate fixed before measuring.

## Links
- Results page: [[address after publishing]]
- Repository: [[repository address]]
- Date: [[YYYY-MM-DD]]

## The problem
A listing's photo can disagree with its title or attributes (a navy product listed as red, a different item type). Mismatches are generally believed to cause returns and complaints; this project does not measure that. [[One or two sentences from your own experience of the problem, if any, with no employer details.]]

## What I built
- A command-line pipeline: data prep, planted swaps with known ground truth, a vision-model client (Gemini primary, mock for offline runs), two baselines, metrics and a report.
- A local labelling page and a results page, plus a bring-your-own-key live page.
- A gate written before any measurement (docs/SPEC.md section 9).
- Honest scope. There are no users, no production deployment and no adoption.

## Key decisions and trade-offs
- Planted tests give known answers but are easier than real mistakes, so planted and natural results are never pooled.
- Owner labels are produced only by the owner, in the labelling page, with no model output visible.
- `cannot_tell` is a first-class verdict, and a low-confidence mismatch is downgraded at a threshold chosen on development data only.
- The baseline is deliberately fair (it tolerates near shades), so a gap over it means something.
- [[Anything that changed during the build, with the reason.]]

## How I evaluated it
- Sets: [[sizes]]. Held-out sets were frozen with hashes before any model saw them.
- Gate result of record (counted run 1): [[GATE PASS | GATE FAIL | GATE INCONCLUSIVE]]. Planted criteria: [[status]]. Natural criteria: [[status]]. Intervals: [[Wilson 95% intervals from docs/EVAL-REPORT.md]].
- If a later run passed after a fix: "run 1 FAILED; after fix [[X]], run [[K]] passed", and the headline stays run 1.
- If natural criteria were INCONCLUSIVE (fewer than 15 owner mismatch pairs), say so and make no claim on them. Do not call the project "gate passed" in that case.

## What I found
- Natural mismatch rate: [[k/n with Wilson interval]], measured on the sampled ABO subset, owner-labelled.
- Most common patterns: [[counts per tag from the labels]].
- Model vs baseline on colour (planted): [[F1 difference with bootstrap interval]].
- Cost per 1,000 listings and latency: [[from eval/cost.json]].

## Limits
- One marketplace catalog, category-balanced, one labeller, one pass.
- The model name is [[dated snapshot | not pinned by the provider]].
- Small images limit material and pattern judgements.
- The planted set is easier than real mistakes.

## What I would do next
- [[Only items you actually plan to do.]]