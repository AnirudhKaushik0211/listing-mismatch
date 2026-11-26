# Held-out run 1: plan for the Gemini free tier

Status: prepared 2026-11-26. Nothing has been run. The owner starts it. Sources: SPEC 9, 10.2, 10.3, 10.5; `eval/HISTORY.md`; `src/freeze.cjs`; `scripts/listing-check.cjs`.

## Fixed facts
- Model `gemini-3.5-flash` (not pinned by the provider), `tau` 0.9, frozen stages 0 to 3 committed (gate ded105b, data 88718dd, method b0644eb, labels 5866880).
- Free tier, observed: 5 requests per minute and 20 requests per day per model per project; the day resets at midnight Pacific (about 13:30 IST in winter, 12:30 IST in summer time).
- Held-out size: 584 listings (natural-heldout 200, planted-heldout 384), one call each.
- Owner decision: stay on the free tier, no billing, no extra projects or keys.

## Run order and why
1. natural-heldout first (200 calls). It feeds G05 and G06 and the natural mismatch-rate finding.
2. planted-heldout second (384 calls). It feeds G01 to G04.
The wrapper runs one set per invocation. When natural-heldout finishes mid-day, it spends the rest of that day's budget (minus 2) on planted-heldout.

Stratification. The frozen runner has no ordering option and `--ids` refuses held-out sets. Both held-out manifests are written sorted by listing id (`canonicalManifest`), so each day's batch is a consecutive slice of an id-sorted list, which is unrelated to category or planted condition. That mixes categories and strata in expectation, but it is not a guaranteed quota per day. Guaranteed per-day stratification would need a change to `listing-check.cjs`, which is covered by the frozen code hash (see below), so it was not made. The cost of an uneven day is nil for the gate: G01 to G04 are computed only after all 384 planted answers exist.

## Daily budget and pacing
- 18 calls for the run, 2 spare for retries and the live demo. The cap is `--max-calls 18`. The runner counts every provider call against it, retries included, so a day cannot send more than 18.
- Pacing: `--concurrency 1 --min-interval-ms 13000`, one call per 13 s (4.6 per minute, under 5). A full day takes about 4 minutes.
- Cached answers cost no call. Each day the runner walks the set in manifest order, skips cached listings and makes new calls until the cap. A day with parse retries yields fewer than 18 new answers.

## Stopping on quota
- The runner's cap stop (`max calls reached`, exit 4) is the normal end of a day.
- Quota 429: the frozen client treats it as `rate_limit` and retries up to 3 times per listing (1, 2, 4 s) before recording a failure; five consecutive failures stop the run (exit 4). A quota day therefore wastes at most the 18-call cap and about 4 minutes, and caches nothing. The client cannot be changed to stop on the first quota 429 (code hash). The wrapper limits the damage: it runs once per Pacific day, writes a `daily-quota-429-no-answers` note when a day returns no answers with rate-limit retries, and the next scheduled day resumes. No retry loop runs outside the runner.
- Unknown: whether Google counts rejected 429 requests against the daily quota. Assume they may. The 2 spare calls are the margin.

## Expected dates (day 1 = Thursday 2026-11-26, if today's quota is unused; shift by one day per day of delay)
584 / 18 = 32.4, so at least 33 run days. Parse retries and quota misses add a few days.
| Milestone | Day | Date (no slack) | With about 10% slack |
|---|---|---|---|
| natural-heldout complete | 12 | 2026-12-07 | 2026-12-09 |
| planted-heldout complete | 33 | 2026-12-28 | 2026-12-31 |

## Validity under SPEC 10.2 and 10.3
- One run, one id: `--heldout-run 1` on day 1; every later day adds `--continue-run 1`. Run id `heldout-1` throughout. Same provider, model, `tau` 0.9, prompt and settings every day; the wrapper hard-codes them and the runner refuses any difference from stage 2.
- Each invocation re-checks the model id, prompt hash, code hash and every frozen stage hash (`checkHeldoutRun`), plus the gate and data-use approvals and the smoke record.
- D (SPEC 10.3): the owner records D = 40 before day 1. The estimate is 33 days plus slack for misses; `--continue-run` is allowed D times.
- Counted status: the run is counted once one request returns HTTP 2xx. A day-1 failure before any 2xx would leave the run `void`.
- No method changes. Nothing under `src/`, `scripts/*.cjs`, `labelling/labelling.js`, `package.json` or `package-lock.json` may change until the run ends. Any change alters the stage-2 code hash and the runner then refuses with `frozen hash changed (method.codeHash)`. The Milestone 1 workflow (demo packaging, tests) must not touch those files. `scripts/daily-heldout.ps1` and `docs/` are outside the hashed set. Checked on 2026-11-26: the current code hash equals the frozen one.
- Bookkeeping that must not be done early. The runner refuses a continuation if the number of `held-out run N` headings in `eval/HISTORY.md` differs from the number of counted runs in `eval/runs.jsonl`. Keep both at zero until the run ends: do not add a `## ... held-out run 1` heading to HISTORY and do not add a `completed` or `aborted` line to `runs.jsonl` mid-run. The pre-run record below deliberately avoids the words "held-out run".
- Do not look at model outputs on held-out sets before the run is complete (SPEC 10.4). The wrapper prints counts only and keeps the runner's raw output in `eval/results-private/heldout-1/last-run.log` (git-ignored). Do not open that file or the result files before the run ends.
- Progress counts are the number of new files in the runner's cache for this model since day 1 (baseline recorded in the log). Any other cached call on `gemini-3.5-flash` through the runner would inflate them. Result files are authoritative. Any other use of the same key (live demo, dev runs) also draws on the same 20-per-day quota.

## Gaps found in the frozen runner (reported, not changed)
1. `listing-check.cjs` does not append `{"run":K,"status":"started"|"completed"|"aborted"}` lines to `eval/runs.jsonl` for held-out runs, although SPEC 10.2 says the runner does. At the end it appends one line with `status:"dev"` and no run number. Because the code hash is frozen and a stage cannot be rewritten, the wrapper appends the `started` line on day 1, and the owner appends the closing line by hand (below). `eval.cjs` refuses held-out sets until a counted run line exists.
2. No ordering, no per-set daily cap across sets (`--max-calls` applies per set invocation, so the wrapper runs one set at a time), no first-quota-429 stop.
3. D is not enforced in code.
Whether to fix these requires a new freeze (a stage cannot be rewritten) and is an owner decision. Not recommended: the manual path works and keeps the frozen method.

## Owner steps
### A. Before day 1: append to `eval/HISTORY.md` (SPEC 10.3 pre-run step; owner-only record)
```
## 2026-11-26 Pre-run record: request limits and days needed (SPEC 10.3)
Model gemini-3.5-flash on the Gemini free tier. Limits as observed from provider 429 responses, not published by Google: 5 requests per minute and 20 requests per day per project per model (quotaId GenerateRequestsPerDayPerProjectPerModel-FreeTier), daily reset at midnight Pacific. Held-out size 584 listings (200 natural, 384 planted), one request each. Plan: 18 requests per day, 1 request per 13 seconds, 2 per day kept spare, so at least 33 days. D = 40 days (33 plus slack for retries and missed days). The run continues with --continue-run 1 under identical settings; each continuation re-checks the model id and the frozen hashes. Details: docs/HELDOUT-RUN-PLAN.md.
```
Then `git add eval/HISTORY.md` and `git commit -m "docs: pre-run request limits and D"`. (Note: the working tree currently has someone else's uncommitted edit to `eval/HISTORY.md`; commit only after that edit is committed or deliberately included.)

### B. Approval commands
SPEC 10.6 defines no held-out-run approval item. The runner needs the existing `gate` and `data-use` approvals (present in `eval/approvals.json`) and the smoke record (present). Nothing to run.

### C. Daily command (from the project folder)
```
powershell -ExecutionPolicy Bypass -File scripts\daily-heldout.ps1
```
Preview without any call: add `-DryRun`. Once per Pacific day; a second run the same day prints "Already ran" and exits (override with `-Force`). Progress is appended to `eval/heldout-progress.log` (counts only; safe to commit).

### D. Optional: daily Scheduled Task at 13:45 local while logged in (not created)
```
$root = (Get-Location).Path   # run this from the project folder
$act = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$root\scripts\daily-heldout.ps1`"" -WorkingDirectory $root
$trg = New-ScheduledTaskTrigger -Daily -At 13:45
$set = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 1)
Register-ScheduledTask -TaskName 'ListingMismatchHeldoutDaily' -Action $act -Trigger $trg -Settings $set -Description 'Counted held-out run 1, daily batch (free tier)'
```
It runs as you, only while you are logged on (default for a task registered without a password). The key comes from your user-level `GEMINI_API_KEY`. The task keeps firing after the run ends and then does nothing. Remove it: `Unregister-ScheduledTask -TaskName 'ListingMismatchHeldoutDaily' -Confirm:$false`. Check it: `Get-ScheduledTaskInfo -TaskName 'ListingMismatchHeldoutDaily'`.
Do not run the daily command by hand on a day the task will also run, unless you accept the "Already ran" guard doing its job.

### E. Closing the run (after both result files exist, `Run complete` is printed)
1. Append to `eval/runs.jsonl` (replace the date; use `aborted` instead of `completed` if you stop early after at least one answer): `{"run":1,"status":"completed","provider":"gemini","model":"gemini-3.5-flash","tau":0.9,"sets":["natural-heldout","planted-heldout"],"runId":"heldout-1","date":"YYYY-MM-DD"}`
2. Append the HISTORY entry in the same commit, with a heading containing `held-out run 1`: provider, model, promptHash 3a9f54d7a6b6798788e02aecfeaf1558f7a65912c1fd7951c468b6a0919d300d, code hash 43a9e26b9935fc717860623e520e86d2d92e97cf9161cfdcbd64086de753ba91, tau 0.9, start and end dates, number of run days, reason, and the gate result after step 3.
3. Then `node scripts/eval.cjs --run heldout-1`.
