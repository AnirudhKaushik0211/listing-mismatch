# Owner runbook: freeze stages 0 to 2 before labelling natural-heldout

Working directory for every command: the `listing-mismatch` project folder
Sources: DATA-PLAN section 8, SPEC 10, checked against `src/freeze.cjs` and `scripts/approve.cjs`. Nothing here has been run.

State when written: no git repo, no `eval/approvals.json`, no `eval/freeze.json`. `data/` (raw, splits, heldout, images) already exists; `.gitignore` exists.
Deviation to record in `eval/HISTORY.md`: fetch, sample and plant ran before stage 0, but DATA-PLAN section 8 step 1 says fetch runs only after stage 0. No model call was made, so no measurement leaked.

Each freeze stage needs a clean git tree, the previous stage's commit id in the committed `eval/HISTORY.md`, and the required approvals.

0. `git init`, `git add -A`, `git commit -m "chore: initial import"` (data/ is ignored).
1. `node scripts/approve.cjs --item gate --text "I approve the gate, thresholds, split sizes and freeze procedure in SPEC sections 8 to 10 and DATA-PLAN as written. I wrote or edited, and have read in full, the spec, gates and reviews, and I take responsibility for them."`
2. `git add eval/approvals.json`, `git commit -m "chore: gate approval"` (stage 0 needs a clean tree).
3. `node scripts/freeze.cjs --stage gate`. It prints the entry and commits `eval/freeze.json`. Paste the entry (commit id, date, deviation note) into `eval/HISTORY.md`, then `git add eval/HISTORY.md`, `git commit -m "docs: stage 0 entry"`.
4. Review the counts and 10 random planted-dev examples (planted-dev only). `node scripts/freeze.cjs --stage data`. Paste the entry into HISTORY.md and commit.
5. Label natural-dev (30 listings) in the labelling page. Save as `data/labels/natural-dev.labels.json`.
6. `node scripts/approve.cjs --item data-use --text "<statement>"`. The statement names the Gemini tier and says either (a) a paid tier whose terms do not use inputs to improve Google products, or (b) the owner has read the ABO licence text in `data/SOURCES.lock.json` and Google's Gemini API terms and accepts sending the sampled public images and text through the free tier. Commit `eval/approvals.json`; record date and result in HISTORY.md. Stage 2 refuses without it.
7. (Run by the agent after the owner confirms steps 0-6.) Smoke run (3 planted-dev listings): `node scripts/listing-check.cjs --checker vlm --provider gemini --model gemini-3.5-flash --smoke --yes`
8. (Run by the agent.) Dev tuning (real Gemini calls, dev sets only; held-out sets are refused): `node scripts/listing-check.cjs --checker vlm --provider gemini --model gemini-3.5-flash --sets planted-dev,natural-dev --run-id dev-1 --tau 0.7` (add `--yes` after reading the cost estimate). Also `--checker baseline-colour` (tune `--colour-fg`, `--colour-share`) and `--checker baseline-text`. Then `node scripts/eval.cjs --run dev-1` to choose tau. Edit prompts and baselines only in this phase. Record baseline values and tau in HISTORY.md.
9. (Owner.) Commit all edits (clean tree), then `node scripts/freeze.cjs --stage method --model gemini-3.5-flash --tau 0.9`. Paste the entry into HISTORY.md and commit. Prompt, tau, model, baselines and code are now immutable for counted runs. If the prompt changed after the smoke run, rerun the smoke run on the final model (SPEC 10.5).
10. Only then label natural-heldout, save `data/labels/natural-heldout.labels.json`, record `labels-own`, freeze stage 3.

Model pin: `gemini-3.5-flash` (owner decision after gemini-3.8-flash returned 503/429 and gemini-2.5-flash returned 404). Not pinned by the provider; its quota dimension reports gemini-3.6-flash. Free tier: 5 RPM, 20 requests per day per model. Pace dev runs with `--concurrency 1 --min-interval-ms 13000`. Baseline values (fg 245, share 0.33) are in `eval/baseline-tuning.json`.

Before run 1: record the model's per-minute and per-day request limits and D in HISTORY.md (SPEC 10.3).
