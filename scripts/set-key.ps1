# Stores a VLM API key as a USER-LEVEL environment variable. Run this yourself in a terminal; agents must not run it.
# Modelled on ..\..\scripts\set-github-token.ps1: the key is read with hidden input and is never written to a file or printed.
# Example (default provider is Gemini, key from Google AI Studio):
#   powershell -ExecutionPolicy Bypass -File scripts\set-key.ps1 -Model gemini-2.5-flash -SetDefault
# Limitation: user-level environment variables are stored as plain text under your Windows user registry hive.
# Use a key with a spending limit, and do not use a key that is shared with anything else.
param(
  [ValidateSet('gemini','openai','anthropic')][string]$Provider = 'gemini',
  [string]$Model,
  [switch]$SetDefault,
  [switch]$SkipVerify
)
$ErrorActionPreference = 'Stop'
$names = @{ gemini = 'GEMINI_API_KEY'; openai = 'OPENAI_API_KEY'; anthropic = 'ANTHROPIC_API_KEY' }
$varName = $names[$Provider]

$secure = Read-Host -Prompt "Paste your $Provider API key (input is hidden), then press Enter" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
$plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
if ([string]::IsNullOrWhiteSpace($plain)) { throw 'No key entered.' }
$plain = $plain.Trim()

# 1) Verify with one model-list GET (the key travels in a header only). That this call spends no tokens is unverified until you run it.
if (-not $SkipVerify) {
  $uri = switch ($Provider) {
    'gemini'    { 'https://generativelanguage.googleapis.com/v1beta/models' }
    'openai'    { 'https://api.openai.com/v1/models' }
    'anthropic' { 'https://api.anthropic.com/v1/models' }
  }
  $headers = switch ($Provider) {
    'gemini'    { @{ 'x-goog-api-key' = $plain } }
    'openai'    { @{ 'Authorization' = "Bearer $plain" } }
    'anthropic' { @{ 'x-api-key' = $plain; 'anthropic-version' = '2023-06-01' } }
  }
  $status = 0
  try {
    Invoke-WebRequest -Uri $uri -Headers $headers -Method Get -UseBasicParsing -TimeoutSec 30 | Out-Null
    $status = 200
  } catch {
    if ($_.Exception.Response -and $_.Exception.Response.StatusCode) { $status = [int]$_.Exception.Response.StatusCode } else { $status = -1 }
  }
  $headers = $null
  # Gemini reports an invalid key as HTTP 400, so 400 counts as rejected.
  if ($status -eq 400 -or $status -eq 401 -or $status -eq 403) {
    $plain = $null
    throw 'The provider rejected this key. Nothing was saved.'
  }
  if ($status -ne 200) {
    $plain = $null
    throw 'Could not verify the key (network or rate limit). Run again, or use -SkipVerify to save without verifying.'
  }
}

# 2) Save as a user-level environment variable and set it for this process.
[Environment]::SetEnvironmentVariable($varName, $plain, 'User')
Set-Item -Path "Env:$varName" -Value $plain
$plain = $null
if ($Model) { [Environment]::SetEnvironmentVariable('LISTING_VLM_MODEL', $Model, 'User') }
if ($SetDefault) { [Environment]::SetEnvironmentVariable('LISTING_VLM_PROVIDER', $Provider, 'User') }
Write-Host "Saved $varName as a user-level environment variable. Open a new terminal to use it."