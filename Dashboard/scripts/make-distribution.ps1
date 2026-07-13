# make-distribution.ps1 - assembles the Windows installer bundle.
#
# It produces ONE ZIP containing:
#   Install Horizon.cmd, bootstrap-install.ps1, SETUP.html, distribution.json  (the installer)
#   HorizonOS\Dashboard\  = app source (for auto-updates) + native-dist\win-unpacked
#
# SAFETY: it copies ONLY the app. No starter vault and no personal vault content are included.
# The installed app asks the user to choose an existing local Obsidian Sync folder.
#
# Run from Dashboard\:  npm run make:dist    (or: powershell -File scripts\make-distribution.ps1)

$ErrorActionPreference = "Stop"

function Step([string]$m) { Write-Host ""; Write-Host "==> $m" -ForegroundColor Cyan }
function Warn([string]$m) { Write-Host "    ! $m" -ForegroundColor Yellow }
function Ok([string]$m) { Write-Host "    $m" -ForegroundColor Green }

$dashboard = Split-Path -Parent $PSScriptRoot                 # ...\Dashboard
$installerDir = Join-Path $dashboard "dist-installer"
$prebuilt = Join-Path $dashboard "native-dist\win-unpacked"
$prebuiltBuildInfo = Join-Path $prebuilt "resources\app\dist\build-info.json"
$prebuiltPackage = Join-Path $prebuilt "resources\app\package.json"

# Version + output location (default: Desktop, safely outside the vault).
$version = "0.0.0"
try {
  $pkg = Get-Content -Raw (Join-Path $dashboard "package.json") | ConvertFrom-Json
  if ($pkg.version) { $version = [string]$pkg.version }
} catch { }

$stage = Join-Path $env:TEMP "horizon-dist-stage"
$zipPath = Join-Path ([Environment]::GetFolderPath("Desktop")) "Horizon-Setup-$version.zip"

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

# --- 2. Copy the app (source for updates + prebuilt for instant run) ------------------------
# Excludes: node_modules (huge; the installer restores it), the dist-installer folder itself,
# local development folders, leftover build files, and logs. Everything else (src, server.cjs,
# electron, launch scripts, and native-dist\win-unpacked) ships.
Step "Adding the Horizon app (source + prebuilt)"
$appExcludeDirs = @(
  (Join-Path $dashboard "node_modules"),
  (Join-Path $dashboard "dist-installer"),
  (Join-Path $dashboard "native-dist\win-unpacked.tmp")
)
$roboArgs = @($dashboard, $stageDashboard, "/E", "/XD")
$roboArgs += $appExcludeDirs
$roboArgs += @("/XF", "*.log", "*.err.log", "*.tsbuildinfo", "builder-debug.yml", "/NP", "/NFL", "/NDL", "/NJH", "/NJS")
robocopy @roboArgs | Out-Null
if ($LASTEXITCODE -ge 8) { Warn "App copy failed (robocopy $LASTEXITCODE)."; exit 1 }
Ok "App added (including the prebuilt native-dist\win-unpacked)."

# --- 3. Copy the installer + guide to the bundle root --------------------------------------
Step "Adding the installer and setup guide"
foreach ($f in @("Install Horizon.cmd", "bootstrap-install.ps1", "SETUP.html")) {
  Copy-Item -LiteralPath (Join-Path $installerDir $f) -Destination (Join-Path $stage $f) -Force
}
$distributionPath = Join-Path $installerDir "distribution.json"
$stagedDistributionPath = Join-Path $stage "distribution.json"
try {
  $distribution = Get-Content -Raw -LiteralPath $distributionPath | ConvertFrom-Json
  $branch = [string]$distribution.updateBranch
  $repoUrl = [string]$distribution.updateRepoUrl
  $remoteRef = (& git ls-remote $repoUrl "refs/heads/$branch" 2>$null | Select-Object -First 1)
  $commit = if ($remoteRef) { ($remoteRef -split "\s+")[0].Trim() } else { "" }
  if (-not $commit) { throw "Could not resolve the configured public update branch." }
  $buildInfo = Get-Content -Raw -LiteralPath $prebuiltBuildInfo | ConvertFrom-Json
  $packaged = Get-Content -Raw -LiteralPath $prebuiltPackage | ConvertFrom-Json
  if ([string]$buildInfo.commit -ne $commit) { throw "The prebuilt app does not match the public release commit." }
  if ([string]$buildInfo.version -ne $version -or [string]$packaged.version -ne $version) {
    throw "The prebuilt app version does not match package.json."
  }
  if ($buildInfo.dirty -eq $true) { throw "The prebuilt app was made from uncommitted source changes." }
  $prebuiltRenderer = Join-Path (Split-Path -Parent $prebuiltBuildInfo) ([string]$buildInfo.renderer)
  if (-not $buildInfo.renderer -or -not (Test-Path -LiteralPath $prebuiltRenderer)) {
    throw "The prebuilt renderer identity is missing."
  }
  $distribution | Add-Member -NotePropertyName buildCommit -NotePropertyValue $commit -Force
  $distribution | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $stagedDistributionPath -Encoding UTF8
  Ok "Update source pinned to $repoUrl ($branch) at $($commit.Substring(0, 8))."
} catch {
  Warn "Distribution verification failed: $($_.Exception.Message)"
  exit 1
}
$readme = Join-Path $installerDir "README.txt"
if (Test-Path -LiteralPath $readme) { Copy-Item -LiteralPath $readme -Destination (Join-Path $stage "README.txt") -Force }
Ok "Installer added."

# --- 4. Personal-data safety boundary -------------------------------------------------------
Step "Safety check - confirming the bundle contains app code only"
$unexpectedRootItems = @(Get-ChildItem -LiteralPath $stageHorizon -Force | Where-Object { $_.Name -ne "Dashboard" })
if ($unexpectedRootItems.Count -gt 0) {
  Warn "Unexpected files were staged beside Dashboard: $($unexpectedRootItems.Name -join ', ')"
  exit 1
}
Ok "No Calendar, Inbox, Runs, Project Registry, Research Papers, or local Horizon state was bundled."

# --- 5. Zip it -----------------------------------------------------------------------------
Step "Creating the ZIP"
if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
Compress-Archive -Path (Join-Path $stage "*") -DestinationPath $zipPath -CompressionLevel Optimal
$sizeMb = [math]::Round((Get-Item -LiteralPath $zipPath).Length / 1MB, 0)
Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "  Bundle ready:" -ForegroundColor Green
Write-Host "    $zipPath  (~$sizeMb MB)" -ForegroundColor White
Write-Host ""
Write-Host "  Before publishing:" -ForegroundColor White
Write-Host "   - To enable auto-updates, set distribution.json > updateRepoUrl" -ForegroundColor Gray
Write-Host "     to a PUBLIC, code-only repo, then re-run this builder. (See DISTRIBUTION.md.)" -ForegroundColor Gray
Write-Host "   - On the laptop: finish Obsidian Sync, unzip this bundle, then double-click 'Install Horizon.cmd'." -ForegroundColor Gray
Write-Host ""
