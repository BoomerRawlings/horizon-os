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
$sourceRepo = Join-Path $testRoot "source-repo"
$remoteRepo = Join-Path $testRoot "remote.git"
$version = [string]((Get-Content -Raw -LiteralPath (Join-Path $dashboardRoot "package.json") | ConvertFrom-Json).version)
$renderer = "assets/index-recovery.js"

function Write-Utf8([string]$Path, [string]$Content) {
  $parent = Split-Path -Parent $Path
  New-Item -ItemType Directory -Path $parent -Force | Out-Null
  [System.IO.File]::WriteAllText($Path, $Content, [System.Text.UTF8Encoding]::new($false))
}

function Invoke-TestInstaller([string]$Destination) {
  $previousErrorAction = $ErrorActionPreference
  $output = @()
  $exitCode = 1
  try {
    $ErrorActionPreference = "Continue"
    $output = @(& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installer `
      -InstallRoot $Destination -SkipDependencies -SkipShortcuts -SkipLaunch -NonInteractive 2>&1)
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorAction
  }
  return @{ ExitCode = $exitCode; Output = $output }
}

function Invoke-TestGit([string[]]$Arguments) {
  $previousErrorAction = $ErrorActionPreference
  $output = @()
  $exitCode = 1
  try {
    $ErrorActionPreference = "Continue"
    $output = @(& git @Arguments 2>&1)
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorAction
  }
  if ($exitCode -ne 0) {
    throw "git $($Arguments -join ' ') failed: $($output -join ' ')"
  }
  return @($output | ForEach-Object { [string]$_ })
}

try {
  if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw "Git is required for the installer recovery test."
  }

  New-Item -ItemType Directory -Path $sourceRepo -Force | Out-Null
  Write-Utf8 (Join-Path $sourceRepo ".gitignore") "Dashboard/native-dist/`r`nDashboard/node_modules/`r`n"
  Write-Utf8 (Join-Path $sourceRepo "Dashboard\package.json") ((@{ name = "horizon-installer-fixture"; version = $version } | ConvertTo-Json))
  Write-Utf8 (Join-Path $sourceRepo "Dashboard\README.md") "Installer recovery fixture`r`n"
  Invoke-TestGit @("-C", $sourceRepo, "init", "-b", "main") | Out-Null
  Invoke-TestGit @("-C", $sourceRepo, "config", "user.name", "Horizon Installer Test") | Out-Null
  Invoke-TestGit @("-C", $sourceRepo, "config", "user.email", "installer-test@localhost") | Out-Null
  Invoke-TestGit @("-C", $sourceRepo, "add", ".") | Out-Null
  Invoke-TestGit @("-C", $sourceRepo, "commit", "-m", "Fixture") | Out-Null
  $commit = ([string](Invoke-TestGit @("-C", $sourceRepo, "rev-parse", "HEAD") | Select-Object -Last 1)).Trim()
  Invoke-TestGit @("clone", "--bare", $sourceRepo, $remoteRepo) | Out-Null

  New-Item -ItemType Directory -Path $bundle -Force | Out-Null
  [System.IO.File]::Copy($installerSource, $installer)
  Write-Utf8 (Join-Path $payload "Dashboard\package.json") ((@{ name = "horizon-installer-fixture"; version = $version } | ConvertTo-Json))
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
    updateRepoUrl = $remoteRepo
  } | ConvertTo-Json))

  $oldNative = Join-Path $installRoot "Dashboard\native-dist\win-unpacked"
  Write-Utf8 (Join-Path $oldNative "Horizon.exe") "old executable"
  Write-Utf8 (Join-Path $oldNative "resources\app\package.json") '{"version":"0.2.2"}'
  Write-Utf8 (Join-Path $oldNative "resources\app\dist\assets\index-old.js") "old renderer"
  Write-Utf8 (Join-Path $oldNative "resources\app\dist\build-info.json") '{"commit":"0000000000000000000000000000000000000000","dirty":false,"renderer":"assets/index-old.js","version":"0.2.2"}'
  Write-Utf8 (Join-Path $installRoot "Dashboard\native-dist\.horizon-app-only") "Horizon app-only installation`r`n"

  # Reproduce the laptop failure: a .git folder with an unborn HEAD was left behind.
  Write-Utf8 (Join-Path $installRoot ".git\HEAD") "ref: refs/heads/main`r`n"

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
  $installedHead = ([string](Invoke-TestGit @("-C", $installRoot, "rev-parse", "HEAD") | Select-Object -Last 1)).Trim()
  $installedUpstream = ([string](Invoke-TestGit @("-C", $installRoot, "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}") | Select-Object -Last 1)).Trim()
  $installedOrigin = ([string](Invoke-TestGit @("-C", $installRoot, "remote", "get-url", "origin") | Select-Object -Last 1)).Trim()
  if ($installedHead -ne $commit) {
    throw "The repaired update checkout is not pinned to the packaged build."
  }
  if ($installedUpstream -ne "origin/main") {
    throw "The repaired update checkout has no usable upstream."
  }
  if ([System.IO.Path]::GetFullPath($installedOrigin) -ne [System.IO.Path]::GetFullPath($remoteRepo)) {
    throw "The repaired update checkout points at the wrong source."
  }

  Write-Utf8 (Join-Path $bundle "distribution.json") ((@{
    buildCommit = "2222222222222222222222222222222222222222"
    updateBranch = "main"
    updateRepoUrl = $remoteRepo
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
