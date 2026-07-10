# Horizon one-click bootstrap installer (runs on the friend's PC).
#
# What it does, in plain terms:
#   1. Copies the ready-to-run Horizon into a permanent folder (default: %USERPROFILE%\HorizonOS).
#   2. Makes sure Node.js and Git are present (used only for automatic updates) via winget.
#   3. Prepares dependencies so background auto-updates can rebuild the app.
#   4. Creates Desktop / Start-menu shortcuts and registers the auto-updater (via the app's install.ps1).
#   5. Optionally wires up auto-updates from a distribution repo (see distribution.json).
#   6. Launches Horizon and opens the Setup guide.
#
# Horizon RUNS from the prebuilt app, so Node/Git are not required just to use it - they only
# enable hands-off updates. The script is safe to run more than once.

$ErrorActionPreference = "Stop"

function Say([string]$m, [string]$color = "Gray") { Write-Host $m -ForegroundColor $color }
function Step([string]$m) { Write-Host ""; Write-Host "==> $m" -ForegroundColor Cyan }
function Warn([string]$m) { Write-Host "    ! $m" -ForegroundColor Yellow }

$bundle = $PSScriptRoot
$source = Join-Path $bundle "HorizonOS"
$configPath = Join-Path $bundle "distribution.json"
$setupGuide = Join-Path $bundle "SETUP.html"

if (-not (Test-Path -LiteralPath $source)) {
  Warn "Could not find the HorizonOS payload next to this installer."
  Warn "Make sure you extracted the whole ZIP (not just the installer) and try again."
  Read-Host "Press Enter to close"
  exit 1
}

Write-Host ""
Write-Host "  Horizon Setup" -ForegroundColor White
Write-Host "  Everything in orbit" -ForegroundColor DarkGray
Write-Host ""

# --- 1. Choose the install location -----------------------------------------------------------
$defaultTarget = Join-Path $env:USERPROFILE "HorizonOS"
$target = $defaultTarget
$answer = Read-Host "Install Horizon to `"$defaultTarget`"? (Enter to accept, or type a different folder)"
if ($answer -and $answer.Trim().Length -gt 0) { $target = $answer.Trim() }

$targetDashboard = Join-Path $target "Dashboard"
$targetApp = Join-Path $targetDashboard "native-dist\win-unpacked\Horizon.exe"
$alreadyInstalled = Test-Path -LiteralPath $targetApp

# --- 2. Copy the app + starter vault --------------------------------------------------------
Step "Copying Horizon to $target"
if ($alreadyInstalled) {
  Warn "Horizon is already installed here. Refreshing the app files; your notes are left untouched."
  # Refresh app code + prebuilt without deleting the user's vault data or installed node_modules.
  robocopy $source $target /E /XD (Join-Path $targetDashboard "node_modules") /NP /NFL /NDL /NJH /NJS | Out-Null
} else {
  New-Item -ItemType Directory -Path $target -Force | Out-Null
  robocopy $source $target /E /NP /NFL /NDL /NJH /NJS | Out-Null
}
if ($LASTEXITCODE -ge 8) {
  Warn "Copy reported errors (robocopy exit $LASTEXITCODE). Check that the destination is writable."
  Read-Host "Press Enter to close"
  exit 1
}
Say "    Done." "Green"

# --- 3. Dependencies (Node + Git) for automatic updates -------------------------------------
Step "Checking helpers for automatic updates (Node.js + Git)"
$hasWinget = [bool](Get-Command winget -ErrorAction SilentlyContinue)

function Ensure-Tool([string]$command, [string]$wingetId, [string]$label) {
  if (Get-Command $command -ErrorAction SilentlyContinue) {
    Say "    $label found." "Green"
    return $true
  }
  if ($hasWinget) {
    Say "    Installing $label..."
    try {
      winget install --id $wingetId --silent --accept-source-agreements --accept-package-agreements | Out-Null
    } catch {
      Warn "$label install did not complete automatically."
    }
    if (Get-Command $command -ErrorAction SilentlyContinue) { Say "    $label installed." "Green"; return $true }
  }
  Warn "$label is not installed. Horizon will still run; automatic updates need it."
  Warn "Install it later from https://nodejs.org (Node) or https://git-scm.com (Git)."
  return $false
}

$haveNode = Ensure-Tool "node" "OpenJS.NodeJS.LTS" "Node.js"
$haveGit = Ensure-Tool "git" "Git.Git" "Git"

# winget may install to a path not yet on this session's PATH; re-resolve for the steps below.
$env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")

# --- 4. Prepare dependencies for the updater (best effort) ----------------------------------
if ($haveNode) {
  Step "Preparing update dependencies (this can take a minute)"
  Push-Location $targetDashboard
  try {
    & npm install --no-audit --no-fund 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) { Say "    Ready." "Green" } else { Warn "npm install did not finish; updates will retry later." }
  } catch {
    Warn "Could not prepare update dependencies now; the updater will retry later."
  } finally {
    Pop-Location
  }
}

# --- 5. Optional: wire up automatic updates from a distribution repo -------------------------
$updateRepoUrl = ""
$updateBranch = "main"
if (Test-Path -LiteralPath $configPath) {
  try {
    $cfg = Get-Content -Raw -LiteralPath $configPath | ConvertFrom-Json
    if ($cfg.updateRepoUrl) { $updateRepoUrl = [string]$cfg.updateRepoUrl }
    if ($cfg.updateBranch) { $updateBranch = [string]$cfg.updateBranch }
  } catch {
    Warn "Could not read distribution.json; skipping auto-update wiring."
  }
}

if ($haveGit -and $updateRepoUrl -and -not (Test-Path -LiteralPath (Join-Path $target ".git"))) {
  Step "Connecting automatic updates"
  Push-Location $target
  try {
    & git init -b $updateBranch 2>&1 | Out-Null
    & git remote add origin $updateRepoUrl 2>&1 | Out-Null
    & git fetch --depth 1 origin $updateBranch 2>&1 | Out-Null
    # Point HEAD at the remote tip without disturbing the friend's already-copied files.
    & git reset --mixed FETCH_HEAD 2>&1 | Out-Null
    & git branch --set-upstream-to "origin/$updateBranch" $updateBranch 2>&1 | Out-Null
    Say "    Auto-updates connected to $updateRepoUrl ($updateBranch)." "Green"
  } catch {
    Warn "Auto-update wiring did not complete. Horizon still works; you can set it up later."
  } finally {
    Pop-Location
  }
} elseif (-not $updateRepoUrl) {
  Warn "No update source configured (distribution.json > updateRepoUrl is empty)."
  Warn "Horizon works fully; to enable hands-off updates later, set that value and re-run this installer."
}

# --- 6. Shortcuts + scheduled updater (delegates to the app's own installer) -----------------
Step "Creating shortcuts and the update schedule"
$appInstaller = Join-Path $targetDashboard "install.ps1"
if (Test-Path -LiteralPath $appInstaller) {
  try {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $appInstaller | Out-Null
    Say "    Shortcuts ready (Desktop + Start menu)." "Green"
  } catch {
    Warn "Shortcut/updater setup reported an issue: $($_.Exception.Message)"
  }
} else {
  Warn "App installer not found at $appInstaller; skipping shortcuts."
}

# --- 7. Launch + open the guide --------------------------------------------------------------
Step "Launching Horizon"
if (Test-Path -LiteralPath $targetApp) {
  Start-Process -FilePath $targetApp -ArgumentList "--boot" | Out-Null
  Say "    Horizon is starting." "Green"
} else {
  Warn "Could not find Horizon.exe at $targetApp."
}

if (Test-Path -LiteralPath $setupGuide) {
  Start-Process $setupGuide | Out-Null
}

Write-Host ""
Write-Host "  All set!" -ForegroundColor Green
Write-Host "  Horizon is installed at: $target" -ForegroundColor White
Write-Host "  Point Obsidian (optional) at that exact folder to edit the same notes." -ForegroundColor Gray
Write-Host "  In-app help lives under Settings > Advanced > How to use Horizon." -ForegroundColor Gray
Write-Host ""
Read-Host "Press Enter to close"
