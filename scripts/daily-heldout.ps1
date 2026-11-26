# Owner-run daily batch for counted held-out run 1 on the Gemini free tier (docs/HELDOUT-RUN-PLAN.md).
# Runs at most -MaxCalls provider calls (default 18 of the 20/day free-tier cap), one call per 13 s, natural-heldout first,
# then planted-heldout. Prints counts only (no ids, titles or values) and never prints the key.
# Usage:  powershell -ExecutionPolicy Bypass -File scripts\daily-heldout.ps1 [-DryRun] [-Force] [-MaxCalls 18]
# Not part of the code hash (the hash covers *.cjs under scripts/). Agents must not run it without -DryRun.
param(
  [int]$MaxCalls = 18,
  [switch]$DryRun,
  [switch]$Force
)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
$Model = 'gemini-3.5-flash'
$Tau = '0.9'
$RunId = 'heldout-1'
$Total = 584            # natural-heldout 200 + planted-heldout 384
$NaturalN = 200
$Reason = 'Counted held-out run 1, continued daily within the free-tier quota (SPEC 10.2 and 10.3)'
$Log = Join-Path $Root 'eval\heldout-progress.log'
$Runs = Join-Path $Root 'eval\runs.jsonl'
$Cache = Join-Path $Root "eval\cache\gemini\$Model"
$OutDir = Join-Path $Root "eval\results-private\$RunId"

function Write-Out([string]$m) { Write-Host $m }
function CacheCount { if (Test-Path $Cache) { @(Get-ChildItem $Cache -Filter *.json -File).Count } else { 0 } }

# Pacific calendar day (the free-tier quota resets at midnight Pacific, DST handled by the time zone database).
$pac = [TimeZoneInfo]::ConvertTimeBySystemTimeZoneId([DateTime]::UtcNow, 'UTC', 'Pacific Standard Time')
$pacDay = $pac.ToString('yyyy-MM-dd')
$stamp = (Get-Date).ToString('yyyy-MM-dd HH:mm')

# Key: presence only. The runner reads GEMINI_API_KEY from the environment; fall back to the user-level variable.
if (-not $env:GEMINI_API_KEY) {
  $u = [Environment]::GetEnvironmentVariable('GEMINI_API_KEY', 'User')
  if ($u) { $env:GEMINI_API_KEY = $u }
}
if (-not $env:GEMINI_API_KEY -and -not $DryRun) { Write-Out 'No GEMINI_API_KEY found. Run scripts\set-key.ps1 first. Nothing was sent.'; exit 1 }

# Progress state comes from the log (counts only) and the cache directory.
$lines = if (Test-Path $Log) { @(Get-Content $Log) } else { @() }
$base = $null
foreach ($l in $lines) { if ($l -match '^BASELINE .*cache_files=(\d+)') { $base = [int]$Matches[1] } }
$firstDay = -not ($lines | Where-Object { $_ -match ' run=1 ' })
if ($null -eq $base) { $base = CacheCount }   # cache files that existed before run 1 (dev answers)
$doneBefore = [Math]::Max(0, (CacheCount) - $base)
$natFile = Join-Path $OutDir 'natural-heldout.vlm.jsonl'
$plFile = Join-Path $OutDir 'planted-heldout.vlm.jsonl'
$natDone = Test-Path $natFile
$plDone = Test-Path $plFile

if ($natDone -and $plDone) { Write-Out "Run complete: both held-out sets have result files. Next: record the run (docs\HELDOUT-RUN-PLAN.md, section 'Closing the run')."; exit 0 }
if (-not $Force -and ($lines | Where-Object { $_ -match "pacific=$pacDay " })) {
  Write-Out "Already ran for Pacific day $pacDay. The next batch is available after the midnight-Pacific reset (about 13:30 IST in winter). Use -Force only if you know today's quota is unused."
  exit 0
}
$set = if (-not $natDone) { 'natural-heldout' } else { 'planted-heldout' }
Write-Out "Held-out run 1, $stamp (Pacific day $pacDay). Answers so far: $doneBefore of $Total. Next set: $set. Call cap today: $MaxCalls."
if ($DryRun) { Write-Out 'Dry run: no call made, nothing written.'; exit 0 }

function Invoke-Batch([string]$setName, [int]$cap) {
  $a = @('scripts\listing-check.cjs', '--checker', 'vlm', '--provider', 'gemini', '--model', $Model, '--sets', $setName,
    '--run-id', $RunId, '--tau', $Tau, '--concurrency', '1', '--min-interval-ms', '13000', '--max-calls', "$cap", '--yes',
    '--heldout-run', '1', '--reason', $Reason)
  if (-not $script:firstDay) { $a += @('--continue-run', '1') }
  New-Item -ItemType Directory -Force $OutDir | Out-Null
  $before = CacheCount
  $ErrorActionPreference = 'Continue'
  $raw = & node @a 2>&1 | ForEach-Object { "$_" }
  $code = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
  $script:firstDay = $false
  # Keep the raw runner output only in the git-ignored private results folder.
  Set-Content -Path (Join-Path $OutDir 'last-run.log') -Value $raw
  $new = (CacheCount) - $before
  $retries = @($raw | Where-Object { $_ -match 'retry \d+ after' }).Count
  $quota = @($raw | Where-Object { $_ -match 'after rate_limit' }).Count
  foreach ($l in $raw) { if ($l -match '^check .* listings written') { Write-Out ($l -replace '\s*\(held-out: counts only\)', '') } }
  $refusal = $raw | Where-Object { $_ -match 'refused' } | Select-Object -First 1
  $note = if ($code -eq 0) { 'set-complete' }
          elseif ($refusal) { 'refused: ' + ($refusal -replace '^\[error\]\s*', '') }
          elseif ($raw -match 'max calls reached') { 'daily-cap-reached' }
          elseif ($raw -match 'circuit breaker|more than 10%') { 'stopped-on-failures' }
          else { 'stopped' }
  if ($new -eq 0 -and $quota -gt 0) { $note = 'daily-quota-429-no-answers' }
  return [pscustomobject]@{ Code = $code; New = $new; Retries = $retries; Quota429 = $quota; Note = $note }
}

if ($firstDay) {
  # SPEC 10.2: log "started" before the first held-out call (eval/runs.jsonl is not hashed; this is not a counted status).
  $hasStart = (Test-Path $Runs) -and (Select-String -Path $Runs -Pattern '"run":1' -Quiet)
  if (-not $hasStart) { Add-Content -Path $Runs -Value ('{"run":1,"status":"started","provider":"gemini","model":"' + $Model + '","tau":' + $Tau + ',"date":"' + (Get-Date).ToString('yyyy-MM-dd') + '"}') }
  if (-not ($lines | Where-Object { $_ -match '^BASELINE ' })) { Add-Content -Path $Log -Value "BASELINE date=$stamp cache_files=$base total=$Total natural=$NaturalN planted=$($Total - $NaturalN)" }
}

$r = Invoke-Batch $set $MaxCalls
$newTotal = $r.New
$code = $r.Code
$note = $r.Note
# If natural-heldout finished mid-day, spend the remaining budget (minus 2 for parse retries) on planted-heldout.
if ($set -eq 'natural-heldout' -and $code -eq 0) {
  $left = $MaxCalls - $r.New - 2
  if ($left -ge 1) {
    Start-Sleep -Seconds 13
    $r2 = Invoke-Batch 'planted-heldout' $left
    $newTotal += $r2.New; $code = $r2.Code; $note = 'natural-complete; ' + $r2.Note
    $r.Retries += $r2.Retries; $r.Quota429 += $r2.Quota429
  }
}
$done = [Math]::Max(0, (CacheCount) - $base)
$nat = [Math]::Min($done, $NaturalN); $pl = [Math]::Max(0, $done - $NaturalN)
$msg = "$stamp run=1 pacific=$pacDay new=$newTotal done=$done/$Total natural=$nat/$NaturalN planted=$pl/$($Total - $NaturalN) retries=$($r.Retries) rate_limit_retries=$($r.Quota429) exit=$code note=$note"
Add-Content -Path $Log -Value $msg
Write-Out "Today: $newTotal new answers. Total $done of $Total (natural $nat/$NaturalN, planted $pl/$($Total - $NaturalN)). Retries $($r.Retries), rate-limit retries $($r.Quota429). Runner exit $code ($note)."
if ($note -like 'refused*') { Write-Out $note; exit 2 }
# Exit 4 with 'daily-cap-reached' or a quota stop is the normal end of a free-tier day.
if ($code -eq 0 -or $note -match 'daily-cap-reached|quota|set-complete|natural-complete') { exit 0 }
exit $code
