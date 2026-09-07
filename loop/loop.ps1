<#
.SYNOPSIS
  Autonomous execution loop driver for PrivaPilot (SIH26171).

.DESCRIPTION
  Re-invokes Claude Code or Antigravity CLI headlessly with LOOP.md as the per-iteration contract until
  an exit condition fires. Each iteration is a fresh agent context; continuity lives
  in loop/STATE.json. Stop it at any time with Ctrl+C -- state is on disk.

.EXAMPLE
  .\loop\loop.ps1                       # run until an exit condition fires
  .\loop\loop.ps1 -MaxIterations 5      # short leash for the first run
  .\loop\loop.ps1 -AgentBin agy         # run using agy CLI
  .\loop\loop.ps1 -DryRun               # print what it would do, run nothing
  .\loop\loop.ps1 -Reset                # clear a previous exit sentinel and resume
#>

[CmdletBinding()]
param(
  [int]$MaxIterations = 0,            # 0 = use limits.max_iterations from STATE.json
  [int]$SleepSeconds  = 5,
  [string]$RepoRoot   = "",           # defaults to the parent of this script's folder
  [string]$AgentBin   = "claude",     # "claude" or "agy"
  [string]$ClaudeBin  = "",           # backwards-compatible alias for AgentBin
  [string]$PermissionMode = "acceptEdits",   # "bypassPermissions" if headless runs stall on tool prompts
  [switch]$DryRun,
  [switch]$Reset
)

$ErrorActionPreference = "Stop"

# --- binary resolution --------------------------------------------------------
$bin = if (-not [string]::IsNullOrWhiteSpace($ClaudeBin)) { $ClaudeBin } else { $AgentBin }
$isAgy = ($bin -match "agy")

# --- paths -------------------------------------------------------------------
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if ([string]::IsNullOrWhiteSpace($RepoRoot)) { $RepoRoot = Split-Path -Parent $scriptDir }
$loopDir   = Join-Path $RepoRoot "loop"
$statePath = Join-Path $loopDir  "STATE.json"
$exitPath  = Join-Path $loopDir  ".exit"
$promptPath= Join-Path $RepoRoot "LOOP.md"
$logDir    = Join-Path $loopDir  "logs"

foreach ($p in @($promptPath, $statePath, (Join-Path $loopDir "CRITIC.md"))) {
  if (-not (Test-Path $p)) { throw "Missing required file: $p" }
}
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }

# --- preflight ---------------------------------------------------------------
if (Test-Path $exitPath) {
  $prev = (Get-Content $exitPath -Raw).Trim()
  if ($Reset) {
    Remove-Item $exitPath -Force
    Write-Host "[driver] cleared previous exit sentinel: $prev" -ForegroundColor Yellow
  } else {
    Write-Host "[driver] loop already exited: $prev" -ForegroundColor Yellow
    Write-Host "[driver] read loop/SUMMARY.md, then re-run with -Reset to resume."
    exit 0
  }
}

$state = Get-Content $statePath -Raw | ConvertFrom-Json
if ($MaxIterations -le 0) { $MaxIterations = [int]$state.limits.max_iterations }

$freeze = [datetime]::ParseExact($state.limits.freeze_date, "yyyy-MM-dd", $null)
if ((Get-Date).Date -ge $freeze.Date) {
  Write-Host "[driver] freeze date $($state.limits.freeze_date) reached -- not starting." -ForegroundColor Red
  exit 0
}

$prompt = Get-Content $promptPath -Raw
$startIteration = [int]$state.iteration

Write-Host "[driver] repo        : $RepoRoot"
Write-Host "[driver] agent binary: $bin $(if ($isAgy) { '(agy mode)' } else { '(claude mode)' })"
Write-Host "[driver] iteration   : $startIteration"
Write-Host "[driver] budget      : $MaxIterations iterations"
Write-Host "[driver] freeze date : $($state.limits.freeze_date)"
Write-Host ""

if ($DryRun) {
  Write-Host "[driver] DRY RUN -- would invoke:" -ForegroundColor Cyan
  if ($isAgy) {
    Write-Host "  $bin -p <LOOP.md, $($prompt.Length) chars> --dangerously-skip-permissions"
  } else {
    Write-Host "  $bin -p <LOOP.md, $($prompt.Length) chars> --permission-mode $PermissionMode"
  }
  exit 0
}

# --- the loop ----------------------------------------------------------------
$ran = 0
$lastLedgerCount = @($state.ledger).Count

for ($i = 1; $i -le $MaxIterations; $i++) {

  $stamp   = Get-Date -Format "yyyyMMdd-HHmmss"
  $logPath = Join-Path $logDir "iter-$($startIteration + $i)-$stamp.log"
  Write-Host "[driver] --- iteration $($startIteration + $i) --- $(Get-Date -Format 'HH:mm:ss')" -ForegroundColor Cyan

  Push-Location $RepoRoot
  try {
    # Headless single-shot. Each call is a fresh context by design.
    if ($isAgy) {
      & $bin -p $prompt --dangerously-skip-permissions 2>&1 | Tee-Object -FilePath $logPath
    } else {
      & $bin -p $prompt --permission-mode $PermissionMode 2>&1 | Tee-Object -FilePath $logPath
    }
    $code = $LASTEXITCODE
  } finally {
    Pop-Location
  }
  $ran++

  if ($code -ne 0) {
    Write-Host "[driver] agent exited $code -- see $logPath" -ForegroundColor Red
    "EXIT: runner-error ($bin exit code $code, iteration $($startIteration + $i))" |
      Set-Content -Path $exitPath -Encoding utf8
    break
  }

  # --- exit sentinel written by the agent ---
  if (Test-Path $exitPath) {
    Write-Host "[driver] $((Get-Content $exitPath -Raw).Trim())" -ForegroundColor Green
    break
  }

  # --- driver-side stall guard: agent must advance the ledger every iteration ---
  try {
    $state = Get-Content $statePath -Raw | ConvertFrom-Json
  } catch {
    "EXIT: state-corrupt (driver could not parse STATE.json after iteration $($startIteration + $i))" |
      Set-Content -Path $exitPath -Encoding utf8
    Write-Host "[driver] STATE.json unparseable -- stopping." -ForegroundColor Red
    break
  }

  $ledgerCount = @($state.ledger).Count
  if ($ledgerCount -eq $lastLedgerCount) {
    Write-Host "[driver] no ledger entry added this iteration -- agent did not complete step 7." -ForegroundColor Yellow
    "EXIT: no-progress (ledger unchanged after iteration $($startIteration + $i))" |
      Set-Content -Path $exitPath -Encoding utf8
    break
  }
  $lastLedgerCount = $ledgerCount

  if ([int]$state.stall_counter -ge 3) {
    "EXIT: stalled (stall_counter=$($state.stall_counter))" | Set-Content -Path $exitPath -Encoding utf8
    Write-Host "[driver] stalled -- three iterations with no commit and no queue change." -ForegroundColor Yellow
    break
  }

  if ((Get-Date).Date -ge $freeze.Date) {
    "EXIT: deadline-freeze" | Set-Content -Path $exitPath -Encoding utf8
    Write-Host "[driver] freeze date reached mid-loop." -ForegroundColor Yellow
    break
  }

  Start-Sleep -Seconds $SleepSeconds
}

if (-not (Test-Path $exitPath) -and $ran -ge $MaxIterations) {
  "EXIT: iteration-cap (driver budget $MaxIterations exhausted)" | Set-Content -Path $exitPath -Encoding utf8
  Write-Host "[driver] iteration budget exhausted." -ForegroundColor Yellow
}

# --- report ------------------------------------------------------------------
Write-Host ""
Write-Host "[driver] ran $ran iteration(s). Logs: $logDir" -ForegroundColor Cyan
$summaryPath = Join-Path $loopDir "SUMMARY.md"
if (Test-Path $summaryPath) {
  Write-Host ""
  Get-Content $summaryPath -Raw | Write-Host
} else {
  Write-Host "[driver] no SUMMARY.md written -- check the last log and loop/NEEDS_HUMAN.md." -ForegroundColor Yellow
}
