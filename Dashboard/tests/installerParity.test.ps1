$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$dashboardRoot = [System.IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$packagePath = Join-Path $dashboardRoot "package.json"
$builderPath = Join-Path $dashboardRoot "scripts\build-installer.ps1"

function Assert-True([bool]$Condition, [string]$Message) {
  if (-not $Condition) { throw $Message }
}

function Assert-Equal([object]$Expected, [object]$Actual, [string]$Label) {
  if ([string]$Expected -ne [string]$Actual) {
    throw "$Label mismatch. Expected '$Expected'; found '$Actual'."
  }
}

function Assert-File([string]$Path, [string]$Label) {
  Assert-True (Test-Path -LiteralPath $Path -PathType Leaf) "$Label is missing: $Path"
}

$package = Get-Content -Raw -LiteralPath $packagePath | ConvertFrom-Json
$version = [string]$package.version
Assert-True ($version -match '^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$') "package.json must contain a semantic release version."
Assert-Equal "horizon" $package.name "NSIS per-user install-directory name"
Assert-Equal "Horizon" $package.productName "Package product name"
Assert-Equal "Horizon" $package.build.productName "Windows product name"
Assert-Equal "com.rawlings.horizon" $package.build.appId "Windows upgrade identity"

$scriptNames = @($package.scripts.PSObject.Properties.Name)
Assert-True ($scriptNames -notcontains "make:dist") "The retired ZIP make:dist command must not be published."
Assert-Equal "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-installer.ps1" $package.scripts.'native:installer' "native:installer command"
foreach ($releaseGate in @(
  "privacy:scan",
  "test:vault",
  "test:crypto",
  "test:legacy-migration",
  "test:server-self-check",
  "smoke",
  "test:heuristics",
  "test:research-desk",
  "test:infinite-research",
  "test:research-documents",
  "test:updater",
  "test:updater-parity",
  "test:installer-parity"
)) {
  Assert-True ($scriptNames -contains $releaseGate) "package.json is missing release gate '$releaseGate'."
}

Assert-Equal "native-dist" $package.build.directories.output "electron-builder output directory"
Assert-True ($package.build.asar -eq $false) "The guarded builder requires asar=false so packaged contents can be verified."

$windowsTargets = @($package.build.win.target | ForEach-Object { [string]$_ })
Assert-True ($windowsTargets.Count -eq 1 -and $windowsTargets[0] -eq "nsis") "Windows packaging must produce only an NSIS installer."
Assert-Equal 'Horizon-Setup.${ext}' $package.build.win.artifactName "Windows installer filename"

Assert-True ($package.build.nsis.oneClick -eq $true) "NSIS oneClick must remain enabled."
Assert-True ($package.build.nsis.perMachine -eq $false) "NSIS must remain a per-user install."
Assert-True ($package.build.nsis.allowElevation -eq $true) "NSIS must permit elevation when Windows requires it."
Assert-True ($package.build.nsis.createDesktopShortcut -eq $true) "The installer must create a desktop shortcut."
Assert-True ($package.build.nsis.createStartMenuShortcut -eq $true) "The installer must create a Start menu shortcut."
Assert-True ($package.build.nsis.runAfterFinish -eq $true) "The installer must offer to launch Horizon after setup."
Assert-True ($package.build.nsis.deleteAppDataOnUninstall -eq $false) "Uninstall must preserve the user's local Horizon data."
Assert-Equal "Horizon" $package.build.nsis.shortcutName "Installed shortcut name"

$packagedPatterns = @($package.build.files | ForEach-Object { [string]$_ })
foreach ($requiredPattern in @(
  "dist/**/*",
  "electron/**/*",
  "public/horizon-os-icon.ico",
  "public/horizon-os-icon.png",
  "server.cjs",
  "server/**/*",
  "server/integrationStoreCrypto.cjs",
  "server/starter-vault/.obsidian/app.json",
  "package.json"
)) {
  Assert-True ($packagedPatterns -contains $requiredPattern) "electron-builder files is missing '$requiredPattern'."
}

Assert-File $builderPath "Guarded NSIS builder"
$builderText = Get-Content -Raw -LiteralPath $builderPath
$parseTokens = $null
$parseErrors = $null
[System.Management.Automation.Language.Parser]::ParseFile($builderPath, [ref]$parseTokens, [ref]$parseErrors) | Out-Null
Assert-True (@($parseErrors).Count -eq 0) "Guarded NSIS builder contains a PowerShell syntax error."
foreach ($builderMarker in @(
  "privacy:scan",
  "test:vault",
  "test:crypto",
  "test:legacy-migration",
  "test:server-self-check",
  "smoke",
  "test:heuristics",
  "test:research-desk",
  "test:infinite-research",
  "test:research-documents",
  "test:updater",
  "test:updater-parity",
  "test:installer-parity",
  "Running packaged Constellation smoke test",
  "HORIZON_SMOKE_SERVER_PATH",
  "HORIZON_SMOKE_PACKAGE_PATH",
  "Assert-CleanWorkingTree",
  "status --porcelain --untracked-files=all",
  "Source build-info.json reports uncommitted source changes.",
  "Packaged build-info.json reports uncommitted source changes.",
  "dirty -isnot [bool]",
  "Remove-GuardedOutput",
  "Horizon-Setup.exe",
  "--win",
  "nsis",
  ".obsidian\app.json",
  "integrationStoreCrypto.cjs",
  "Get-FileHash"
)) {
  Assert-True ($builderText.Contains($builderMarker)) "Guarded builder is missing required release check '$builderMarker'."
}
Assert-True (-not $builderText.Contains("Write-Warning")) "The release builder must fail, not warn, when source identity is dirty."

$cleanStepIndex = $builderText.IndexOf('Step "Verifying clean release source"', [System.StringComparison]::Ordinal)
$firstCleanCallIndex = $builderText.IndexOf('Assert-CleanWorkingTree $gitPath', $cleanStepIndex, [System.StringComparison]::Ordinal)
$releaseGatesIndex = $builderText.IndexOf('Step "Running release gates"', [System.StringComparison]::Ordinal)
$secondCleanCallIndex = $builderText.IndexOf('Assert-CleanWorkingTree $gitPath', $releaseGatesIndex, [System.StringComparison]::Ordinal)
$cleanBuildIndex = $builderText.IndexOf('Step "Cleaning prior build output"', [System.StringComparison]::Ordinal)
Assert-True ($cleanStepIndex -ge 0 -and $firstCleanCallIndex -gt $cleanStepIndex -and $firstCleanCallIndex -lt $releaseGatesIndex) "The clean-worktree gate must run before release tests."
Assert-True ($secondCleanCallIndex -gt $releaseGatesIndex -and $secondCleanCallIndex -lt $cleanBuildIndex) "The clean-worktree gate must run again after tests and before building."

$packagedValidationIndex = $builderText.IndexOf('Step "Validating the installer and packaged app"', [System.StringComparison]::Ordinal)
$packagedSmokeIndex = $builderText.IndexOf('Step "Running packaged Constellation smoke test"', [System.StringComparison]::Ordinal)
Assert-True ($packagedValidationIndex -ge 0 -and $packagedSmokeIndex -gt $packagedValidationIndex) "The packaged Constellation smoke test must run against the completed unpacked app."

foreach ($requiredSourceItem in @(
  "server\integrationStoreCrypto.cjs",
  "electron\legacyWindowsMigration.cjs",
  "server\starter-vault\00_Index.md",
  "server\starter-vault\AGENTS.md",
  "server\starter-vault\HORIZON.md",
  "server\starter-vault\.obsidian\app.json",
  "server\starter-vault\00_System\manifests\dashboard.manifest.json",
  "server\starter-vault\00_System\manifests\integrations.manifest.json",
  "server\starter-vault\06_Integrations\index.md"
)) {
  Assert-File (Join-Path $dashboardRoot $requiredSourceItem) "Required installer source item '$requiredSourceItem'"
}

$retiredBundleRoot = Join-Path $dashboardRoot "dist-installer"
$retiredBundleFiles = @()
if (Test-Path -LiteralPath $retiredBundleRoot) {
  $retiredBundleFiles = @(Get-ChildItem -LiteralPath $retiredBundleRoot -File -Force -Recurse)
}
Assert-True ($retiredBundleFiles.Count -eq 0) "Retired dist-installer payload files still exist."
Assert-True (-not (Test-Path -LiteralPath (Join-Path $dashboardRoot "scripts\make-distribution.ps1") -PathType Leaf)) "Retired make-distribution.ps1 still exists."

Write-Host "Installer preflight passed for Horizon v$version (one-EXE NSIS release)." -ForegroundColor Green
