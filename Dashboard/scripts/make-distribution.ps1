# make-distribution.ps1 - assembles the shareable Horizon bundle you hand to a friend.
#
# It produces ONE ZIP containing:
#   Install Horizon.cmd, bootstrap-install.ps1, SETUP.html, distribution.json  (the installer)
#   HorizonOS\                                                                  (ready-to-run)
#     AGENTS.md, HORIZON.md, 00_Index.md, Calendar\, Inbox\, Runs\, Project Registry\  (empty starter vault)
#     Dashboard\  = app source (for auto-updates) + native-dist\win-unpacked (prebuilt, instant run)
#
# SAFETY: it copies ONLY the app and a clean, EMPTY starter vault. Your personal notes
# (your real Calendar/Inbox/Runs/Project Registry) are never included. The script prints a
# summary so you can confirm before sharing.
#
# Run from Dashboard\:  npm run make:dist    (or: powershell -File scripts\make-distribution.ps1)

param(
  [string]$OutputDirectory = [Environment]::GetFolderPath("Desktop")
)

$ErrorActionPreference = "Stop"

function Step([string]$m) { Write-Host ""; Write-Host "==> $m" -ForegroundColor Cyan }
function Warn([string]$m) { Write-Host "    ! $m" -ForegroundColor Yellow }
function Ok([string]$m) { Write-Host "    $m" -ForegroundColor Green }

$dashboard = Split-Path -Parent $PSScriptRoot                 # ...\Dashboard
$installerDir = Join-Path $dashboard "dist-installer"
$starterVault = Join-Path $installerDir "starter-vault"
$prebuilt = Join-Path $dashboard "native-dist\win-unpacked"

# Version + output location (default: Desktop, safely outside the vault).
$version = "0.0.0"
try {
  $pkg = Get-Content -Raw (Join-Path $dashboard "package.json") | ConvertFrom-Json
  if ($pkg.version) { $version = [string]$pkg.version }
} catch { }

$stage = Join-Path $env:TEMP "horizon-dist-stage"
if (-not (Test-Path -LiteralPath $OutputDirectory)) {
  New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
}
$zipPath = Join-Path (Resolve-Path -LiteralPath $OutputDirectory).Path "Horizon-Setup-$version.zip"

Write-Host ""
Write-Host "  Horizon distribution builder  (v$version)" -ForegroundColor White
Write-Host ""

# --- 0. Make sure a fresh prebuilt exists --------------------------------------------------
if (-not (Test-Path -LiteralPath (Join-Path $prebuilt "Horizon.exe"))) {
  Warn "No prebuilt app found at native-dist\win-unpacked."
  $build = Read-Host "Build it now with 'npm run native:pack:safe'? (Y/n)"
  if ($build -eq "" -or $build -match '^[Yy]') {
    Push-Location $dashboard
    try { npm run native:pack:safe } finally { Pop-Location }
  } else {
    Warn "Cannot build the bundle without the prebuilt app. Exiting."
    exit 1
  }
}

# --- 1. Clean staging ----------------------------------------------------------------------
Step "Preparing a clean staging folder"
if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
$stageHorizon = Join-Path $stage "HorizonOS"
$stageDashboard = Join-Path $stageHorizon "Dashboard"
New-Item -ItemType Directory -Path $stageDashboard -Force | Out-Null
Ok "Staging at $stage"

# --- 2. Copy the clean, EMPTY starter vault ------------------------------------------------
Step "Adding the empty starter vault (no personal data)"
robocopy $starterVault $stageHorizon /E /NP /NFL /NDL /NJH /NJS | Out-Null
if ($LASTEXITCODE -ge 8) { Warn "Starter vault copy failed (robocopy $LASTEXITCODE)."; exit 1 }
Ok "Starter vault added."

# --- 3. Copy the app (source for updates + prebuilt for instant run) ------------------------
# Excludes: node_modules (huge; the installer restores it), the dist-installer folder itself,
# my dev .claude folder, leftover build temp, and logs. Everything else (src, server.cjs,
# electron, launch scripts, and native-dist\win-unpacked) ships.
Step "Adding the Horizon app (source + prebuilt)"
$appExcludeDirs = @(
  (Join-Path $dashboard "node_modules"),
  (Join-Path $dashboard ".claude"),
  (Join-Path $dashboard "dist-installer"),
  (Join-Path $dashboard "native-dist\win-unpacked.tmp")
)
$roboArgs = @($dashboard, $stageDashboard, "/E", "/XD")
$roboArgs += $appExcludeDirs
$roboArgs += @("/XF", "*.log", "*.err.log", "*.tsbuildinfo", "builder-debug.yml", "/NP", "/NFL", "/NDL", "/NJH", "/NJS")
robocopy @roboArgs | Out-Null
if ($LASTEXITCODE -ge 8) { Warn "App copy failed (robocopy $LASTEXITCODE)."; exit 1 }
Ok "App added (including the prebuilt native-dist\win-unpacked)."

# --- 4. Copy the installer + guide to the bundle root --------------------------------------
Step "Adding the installer and setup guide"
foreach ($f in @("Install Horizon.cmd", "bootstrap-install.ps1", "SETUP.html", "distribution.json")) {
  Copy-Item -LiteralPath (Join-Path $installerDir $f) -Destination (Join-Path $stage $f) -Force
}
$readme = Join-Path $installerDir "README.txt"
if (Test-Path -LiteralPath $readme) { Copy-Item -LiteralPath $readme -Destination (Join-Path $stage "README.txt") -Force }
Ok "Installer added."

# --- 5. Personal-data safety summary -------------------------------------------------------
Step "Safety check - what's in the bundle's vault"
$calItems = @(Get-ChildItem -LiteralPath (Join-Path $stageHorizon "Calendar\Items") -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne "index.md" })
$captures = @(Get-ChildItem -LiteralPath (Join-Path $stageHorizon "Inbox\Captures") -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne "index.md" })
$triage = @(Get-ChildItem -LiteralPath (Join-Path $stageHorizon "Inbox\To Triage") -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne "index.md" })
Write-Host ("    Calendar items: {0}  |  Captures: {1}  |  To-Triage: {2}" -f $calItems.Count, $captures.Count, $triage.Count)
if ($calItems.Count -gt 0 -or $captures.Count -gt 0 -or $triage.Count -gt 0) {
  Warn "Unexpected content found in the starter vault - review before sharing!"
} else {
  Ok "Starter vault is clean (only placeholders)."
}

# --- 6. Zip it -----------------------------------------------------------------------------
Step "Creating the ZIP"
if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
Compress-Archive -Path (Join-Path $stage "*") -DestinationPath $zipPath -CompressionLevel Optimal
$sizeMb = [math]::Round((Get-Item -LiteralPath $zipPath).Length / 1MB, 0)
Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "  Bundle ready:" -ForegroundColor Green
Write-Host "    $zipPath  (~$sizeMb MB)" -ForegroundColor White
Write-Host ""
Write-Host "  Before sending:" -ForegroundColor White
Write-Host "   - Auto-update source: dist-installer/distribution.json" -ForegroundColor Gray
Write-Host "     Review it before sharing a fork. (See DISTRIBUTION.md.)" -ForegroundColor Gray
Write-Host "   - Your friend unzips it and double-clicks 'Install Horizon.cmd'." -ForegroundColor Gray
Write-Host ""
