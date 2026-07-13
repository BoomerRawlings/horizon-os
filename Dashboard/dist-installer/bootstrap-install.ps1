# Horizon Windows installer.
#
# What it does, in plain terms:
#   1. Copies Horizon into the current user's local application folder.
#   2. Makes sure Node.js and Git are present (used only for automatic updates) via winget.
#   3. Prepares dependencies so background auto-updates can rebuild the app.
#   4. Creates Desktop / Start-menu shortcuts and registers the auto-updater (via the app's install.ps1).
#   5. Configures automatic updates from distribution.json when available.
#   6. Launches Horizon, which asks for the existing synced Obsidian vault on first run.
#
# Horizon RUNS from the prebuilt app, so Node/Git are not required just to use it - they only
# enable hands-off updates. The script is safe to run more than once.

$ErrorActionPreference = "Stop"

function Say([string]$m, [string]$color = "Gray") { Write-Host $m -ForegroundColor $color }
function Step([string]$m) { Write-Host ""; Write-Host "==> $m" -ForegroundColor Cyan }
function Warn([string]$m) { Write-Host "    ! $m" -ForegroundColor Yellow }
function Invoke-InstallerGit([string[]]$Arguments) {
  $output = & git @Arguments 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "git $($Arguments -join ' ') failed: $($output -join ' ')"
  }
  return $output
}

$bundle = $PSScriptRoot
$source = Join-Path $bundle "HorizonOS"
$configPath = Join-Path $bundle "distribution.json"

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

# --- 1. Use a stable per-user application location -------------------------------------------
# Vault data is deliberately NOT installed here. Horizon stores the selected synced-vault
# path in %APPDATA%\Horizon and reads the vault in place.
$target = Join-Path $env:LOCALAPPDATA "HorizonOS"

$targetDashboard = Join-Path $target "Dashboard"
$targetApp = Join-Path $targetDashboard "native-dist\win-unpacked\Horizon.exe"
$alreadyInstalled = Test-Path -LiteralPath $targetApp

# --- 2. Copy the app only -------------------------------------------------------------------
Step "Copying Horizon to $target"
if ($alreadyInstalled) {
  Warn "Horizon is already installed here. Refreshing app files; the connected vault is never copied or replaced."
  # Refresh app code + prebuilt without deleting installed node_modules.
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
    # winget updates the persistent PATH, but not this already-running setup window.
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
    if (Get-Command $command -ErrorAction SilentlyContinue) { Say "    $label installed." "Green"; return $true }
  }
  Warn "$label is not installed. Horizon will still run; automatic updates need it."
  Warn "Install it later from https://nodejs.org (Node) or https://git-scm.com (Git)."
  return $false
}

$haveNode = Ensure-Tool "node" "OpenJS.NodeJS.LTS" "Node.js"
$haveGit = Ensure-Tool "git" "Git.Git" "Git"

# --- 4. Prepare dependencies for the updater (best effort) ----------------------------------
if ($haveNode) {
  Step "Preparing update dependencies (this can take a minute)"
  Push-Location $targetDashboard
  try {
    & npm ci --no-audit --no-fund 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) { Say "    Ready." "Green" } else { Warn "Dependency setup did not finish; updates will retry later." }
  } catch {
    Warn "Could not prepare update dependencies now; the updater will retry later."
  } finally {
    Pop-Location
  }
}

# --- 5. Optional: wire up automatic updates from a distribution repo -------------------------
$updateRepoUrl = ""
$updateBranch = "main"
$buildCommit = ""
if (Test-Path -LiteralPath $configPath) {
  try {
    $cfg = Get-Content -Raw -LiteralPath $configPath | ConvertFrom-Json
    if ($cfg.updateRepoUrl) { $updateRepoUrl = [string]$cfg.updateRepoUrl }
    if ($cfg.updateBranch) { $updateBranch = [string]$cfg.updateBranch }
    if ($cfg.buildCommit) { $buildCommit = [string]$cfg.buildCommit }
  } catch {
    Warn "Could not read distribution.json; skipping auto-update wiring."
  }
}

if ($haveGit -and $updateRepoUrl -and -not (Test-Path -LiteralPath (Join-Path $target ".git"))) {
  Step "Connecting automatic updates"
  Push-Location $target
  try {
    Invoke-InstallerGit @("init", "-b", $updateBranch) | Out-Null
    Invoke-InstallerGit @("remote", "add", "origin", $updateRepoUrl) | Out-Null
    Invoke-InstallerGit @("fetch", "--depth", "50", "origin", $updateBranch) | Out-Null

    # Track only app code. Even if the public source grows other top-level content later,
    # the updater will never pull it beside the app or mistake it for the user's vault.
    Invoke-InstallerGit @("sparse-checkout", "init", "--no-cone") | Out-Null
    Invoke-InstallerGit @("sparse-checkout", "set", "--no-cone", "/Dashboard/", "/.gitignore") | Out-Null

    $installRef = "FETCH_HEAD"
    if ($buildCommit) {
      & git cat-file -e "$buildCommit`^{commit}" 2>$null
      if ($LASTEXITCODE -eq 0) { $installRef = $buildCommit }
    }

    # This is a fresh, fixed app-only folder. Align its tracked source with the exact commit
    # used to build the bundled executable; ignored native-dist and node_modules stay intact.
    Invoke-InstallerGit @("reset", "--hard", $installRef) | Out-Null
    Invoke-InstallerGit @("checkout", "-B", $updateBranch, $installRef) | Out-Null
    Invoke-InstallerGit @("branch", "--set-upstream-to", "origin/$updateBranch", $updateBranch) | Out-Null
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

# --- 7. Launch -------------------------------------------------------------------------------
Step "Launching Horizon"
if (Test-Path -LiteralPath $targetApp) {
  Start-Process -FilePath $targetApp -ArgumentList "--boot" | Out-Null
  Say "    Horizon is starting." "Green"
} else {
  Warn "Could not find Horizon.exe at $targetApp."
}

Write-Host ""
Write-Host "  All set!" -ForegroundColor Green
Write-Host "  Horizon is installed at: $target" -ForegroundColor White
Write-Host "  On first launch, choose the top-level folder already created by Obsidian Sync." -ForegroundColor Gray
Write-Host "  Horizon will read that vault in place; only integration sign-ins remain machine-specific." -ForegroundColor Gray
Write-Host "  A short setup reference remains in the extracted folder as SETUP.html." -ForegroundColor Gray
Write-Host "  In-app help lives under Settings > Advanced > How to use Horizon." -ForegroundColor Gray
Write-Host ""
Read-Host "Press Enter to close"
