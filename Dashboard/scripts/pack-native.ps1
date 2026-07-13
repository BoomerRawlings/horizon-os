# pack-native.ps1 — SAFE native Electron packaging for HorizonOS.
#
# Why this exists: electron-builder outputting directly into the vault
# (Dashboard\native-dist) fails with EPERM because Obsidian Sync / git file watchers
# lock the freshly-extracted Electron files during its atomic rename — and a failed run
# DELETES the existing Horizon.exe, breaking the launcher (native-dist is git-ignored, so
# there is no git recovery). This script builds to a temp dir OUTSIDE the vault, verifies
# a good build exists, and only THEN replaces native-dist. The working app is never
# removed before a verified replacement exists.
#
# Run from the Dashboard/ folder:  npm run native:pack:safe

$ErrorActionPreference = "Stop"

$dashboard = Split-Path -Parent $PSScriptRoot           # ...\Dashboard
$tempRoot  = Join-Path $env:TEMP "horizon-native-build" # OUTSIDE the vault
$tempApp   = Join-Path $tempRoot "win-unpacked\Horizon.exe"
$destDir   = Join-Path $dashboard "native-dist\win-unpacked"
$destApp   = Join-Path $destDir "Horizon.exe"
$sourceBuildInfo = Join-Path $dashboard "dist\build-info.json"
$tempBuildInfo = Join-Path $tempRoot "win-unpacked\resources\app\dist\build-info.json"
$destBuildInfo = Join-Path $destDir "resources\app\dist\build-info.json"

function Fail($msg) { Write-Host "PACK FAIL: $msg" -ForegroundColor Red; exit 1 }

try {
  $expectedCommit = (& git -C $dashboard rev-parse HEAD 2>$null).Trim()
  $expectedVersion = [string]((Get-Content -Raw -LiteralPath (Join-Path $dashboard "package.json") | ConvertFrom-Json).version)
} catch {
  Fail "Could not determine the source commit and version."
}

function Assert-BuildIdentity([string]$infoPath, [string]$label) {
  if (-not (Test-Path -LiteralPath $infoPath)) { Fail "$label build-info.json is missing." }
  try { $info = Get-Content -Raw -LiteralPath $infoPath | ConvertFrom-Json } catch { Fail "$label build-info.json is invalid." }
  if ([string]$info.commit -ne $expectedCommit) { Fail "$label commit does not match source HEAD." }
  if ([string]$info.version -ne $expectedVersion) { Fail "$label version does not match package.json." }
  $renderer = Join-Path (Split-Path -Parent $infoPath) ([string]$info.renderer)
  if (-not $info.renderer -or -not (Test-Path -LiteralPath $renderer)) { Fail "$label renderer identity is missing." }
}

Set-Location $dashboard

# a. Build the web assets first.
Write-Host "[1/6] npm run build ..."
npm run build
if ($LASTEXITCODE -ne 0) { Fail "npm run build failed - native-dist left untouched." }
Assert-BuildIdentity $sourceBuildInfo "Source"

# b. Clear the temp output dir, then package Electron into it (outside the vault).
Write-Host "[2/6] Packaging Electron to temp ($tempRoot) ..."
if (Test-Path -LiteralPath $tempRoot) { Remove-Item -LiteralPath $tempRoot -Recurse -Force }
npx electron-builder --win dir --config.directories.output="$tempRoot"
if ($LASTEXITCODE -ne 0) { Fail "electron-builder failed - native-dist left untouched." }

# c. Verify the new build is real BEFORE touching the live app.
Write-Host "[3/6] Verifying temp build ..."
if (-not (Test-Path -LiteralPath $tempApp)) { Fail "temp Horizon.exe missing - native-dist left untouched." }
Assert-BuildIdentity $tempBuildInfo "Packaged temp"

# d. Stop a running Horizon so the copy can replace files.
$running = Get-Process -Name Horizon -ErrorAction SilentlyContinue
if ($running) {
  Write-Host "[4/6] Stopping running Horizon.exe ($($running.Count) process(es)) ..."
  $running | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 500
} else {
  Write-Host "[4/6] No running Horizon.exe."
}

# e. Copy the verified build into native-dist (robocopy tolerates vault watcher locks;
#    /MIR mirrors so removed files are pruned). Exit codes 0-7 are success.
Write-Host "[5/6] Copying verified build into native-dist ..."
robocopy $tempRoot\win-unpacked $destDir /MIR /R:3 /W:2 /NP /NFL /NDL | Out-Null
if ($LASTEXITCODE -ge 8) { Fail "robocopy into native-dist failed (exit $LASTEXITCODE)." }

# f. Verify the live app now exists.
if (-not (Test-Path -LiteralPath $destApp)) { Fail "native-dist Horizon.exe missing after copy." }
Assert-BuildIdentity $destBuildInfo "Installed"

# g. Clean up temp.
Write-Host "[6/6] Cleaning temp ..."
Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "PACK SUCCESS: $destApp" -ForegroundColor Green
Write-Host "Launch check:  Horizon.exe --boot   (or double-click 'Launch Rawlings OS.cmd')"
exit 0
