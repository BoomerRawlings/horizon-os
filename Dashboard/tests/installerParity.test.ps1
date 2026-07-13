$ErrorActionPreference = "Stop"

$dashboardRoot = Split-Path -Parent $PSScriptRoot
$installerSource = Join-Path $dashboardRoot "dist-installer\bootstrap-install.ps1"
$tempBase = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
$testRoot = Join-Path $tempBase ("horizon-installer-parity-" + [guid]::NewGuid().ToString("N"))
$bundle = Join-Path $testRoot "bundle"
$installer = Join-Path $bundle "Install-Horizon.ps1"
$payload = Join-Path $bundle "HorizonOS"
$installRoot = Join-Path $testRoot "installed"
$badInstallRoot = Join-Path $testRoot "mismatch"
$commit = "1111111111111111111111111111111111111111"
$version = "0.2.5"
$renderer = "assets/index-recovery.js"

function Write-Utf8([string]$Path, [string]$Content) {
  $parent = Split-Path -Parent $Path
  New-Item -ItemType Directory -Path $parent -Force | Out-Null
  [System.IO.File]::WriteAllText($Path, $Content, [System.Text.UTF8Encoding]::new($false))
}

function Invoke-TestInstaller([string]$Destination) {
  $output = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installer `
    -InstallRoot $Destination -SkipHelpers -SkipShortcuts -SkipLaunch -NonInteractive 2>&1
  return @{ ExitCode = $LASTEXITCODE; Output = @($output) }
}

try {
  New-Item -ItemType Directory -Path $bundle -Force | Out-Null
  [System.IO.File]::Copy($installerSource, $installer)
  $native = Join-Path $payload "Dashboard\native-dist\win-unpacked"
  Write-Utf8 (Join-Path $native "Horizon.exe") "test executable"
  Write-Utf8 (Join-Path $native "resources\app\package.json") ((@{ version = $version } | ConvertTo-Json))
  Write-Utf8 (Join-Path $native "resources\app\dist\$renderer") "new renderer"
  Write-Utf8 (Join-Path $native "resources\app\dist\build-info.json") ((@{
    commit = $commit
    dirty = $false
    renderer = $renderer
    version = $version
  } | ConvertTo-Json))
  Write-Utf8 (Join-Path $bundle "distribution.json") ((@{
    buildCommit = $commit
    updateBranch = "main"
    updateRepoUrl = ""
  } | ConvertTo-Json))

  $oldNative = Join-Path $installRoot "Dashboard\native-dist\win-unpacked"
  Write-Utf8 (Join-Path $oldNative "Horizon.exe") "old executable"
  Write-Utf8 (Join-Path $oldNative "resources\app\package.json") '{"version":"0.2.2"}'
  Write-Utf8 (Join-Path $oldNative "resources\app\dist\assets\index-old.js") "old renderer"
  Write-Utf8 (Join-Path $oldNative "resources\app\dist\build-info.json") '{"commit":"0000000000000000000000000000000000000000","dirty":false,"renderer":"assets/index-old.js","version":"0.2.2"}'

  $success = Invoke-TestInstaller $installRoot
  if ($success.ExitCode -ne 0) {
    throw "Repair install failed: $($success.Output -join [Environment]::NewLine)"
  }

  $installedDist = Join-Path $installRoot "Dashboard\native-dist\win-unpacked\resources\app\dist"
  $installedBuild = Get-Content -Raw -LiteralPath (Join-Path $installedDist "build-info.json") | ConvertFrom-Json
  if ([string]$installedBuild.commit -ne $commit -or [string]$installedBuild.version -ne $version) {
    throw "Installed build identity does not match the recovery package."
  }
  if (-not (Test-Path -LiteralPath (Join-Path $installedDist $renderer))) {
    throw "The recovery renderer was not installed."
  }
  if (Test-Path -LiteralPath (Join-Path $installedDist "assets\index-old.js")) {
    throw "The stale renderer survived the repair install."
  }

  Write-Utf8 (Join-Path $bundle "distribution.json") ((@{
    buildCommit = "2222222222222222222222222222222222222222"
    updateBranch = "main"
    updateRepoUrl = ""
  } | ConvertTo-Json))
  $mismatch = Invoke-TestInstaller $badInstallRoot
  if ($mismatch.ExitCode -eq 0) {
    throw "Installer accepted a renderer that did not match the release identity."
  }

  Write-Host "Installer parity tests passed." -ForegroundColor Green
} finally {
  if (Test-Path -LiteralPath $testRoot) {
    $resolved = [System.IO.Path]::GetFullPath($testRoot)
    if (-not $resolved.StartsWith($tempBase, [System.StringComparison]::OrdinalIgnoreCase)) {
      throw "Refusing to clean outside the temporary directory: $resolved"
    }
    Remove-Item -LiteralPath $resolved -Recurse -Force
  }
}
