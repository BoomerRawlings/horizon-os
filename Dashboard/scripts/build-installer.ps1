[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$dashboardRoot = [System.IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$distRoot = Join-Path $dashboardRoot "dist"
$nativeOutput = Join-Path $dashboardRoot "native-dist"
$installerPath = Join-Path $nativeOutput "Horizon-Setup.exe"
$packagedAppRoot = Join-Path $nativeOutput "win-unpacked\resources\app"
$packagePath = Join-Path $dashboardRoot "package.json"
$electronBuilder = Join-Path $dashboardRoot "node_modules\.bin\electron-builder.cmd"

function Step([string]$Message) {
  Write-Host ""
  Write-Host ("==> " + $Message) -ForegroundColor Cyan
}

function Assert-File([string]$Path, [string]$Label, [long]$MinimumBytes = 1) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "$Label is missing: $Path"
  }
  $item = Get-Item -LiteralPath $Path
  if ($item.Length -lt $MinimumBytes) {
    throw "$Label is unexpectedly small ($($item.Length) bytes): $Path"
  }
  return $item
}

function Read-Json([string]$Path, [string]$Label) {
  Assert-File $Path $Label | Out-Null
  try {
    return Get-Content -Raw -LiteralPath $Path | ConvertFrom-Json
  } catch {
    throw "$Label is not valid JSON: $Path"
  }
}

function Invoke-External([string]$Label, [string]$FilePath, [string[]]$Arguments) {
  Write-Host ("    " + $Label) -ForegroundColor Gray
  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Label failed with exit code $LASTEXITCODE."
  }
}

function Remove-GuardedOutput([string]$Path, [string]$ExpectedLeaf) {
  $resolvedRoot = $dashboardRoot.TrimEnd("\", "/") + [System.IO.Path]::DirectorySeparatorChar
  $resolved = [System.IO.Path]::GetFullPath($Path)
  if (-not $resolved.StartsWith($resolvedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to remove a path outside Dashboard: $resolved"
  }
  if ([System.IO.Path]::GetFileName($resolved) -ne $ExpectedLeaf) {
    throw "Refusing to remove unexpected output path: $resolved"
  }
  if (Test-Path -LiteralPath $resolved) {
    Remove-Item -LiteralPath $resolved -Recurse -Force
  }
}

function Assert-SameValue([object]$Expected, [object]$Actual, [string]$Label) {
  if ([string]$Expected -ne [string]$Actual) {
    throw "$Label does not match the clean source build."
  }
}

function Assert-CleanWorkingTree([string]$GitPath) {
  $statusOutput = @(& $GitPath -C $dashboardRoot status --porcelain --untracked-files=all 2>&1)
  if ($LASTEXITCODE -ne 0) {
    throw "Horizon could not verify the Git working tree. Release packaging stopped."
  }
  $changes = @($statusOutput | ForEach-Object { [string]$_ } | Where-Object { $_.Trim() })
  if ($changes.Count -gt 0) {
    $preview = ($changes | Select-Object -First 12) -join [Environment]::NewLine
    throw "Release packaging requires a clean Git working tree, including no untracked files. Commit or remove these changes first:`n$preview"
  }
}

$npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npmCommand) { $npmCommand = Get-Command npm -ErrorAction SilentlyContinue }
if (-not $npmCommand) { throw "npm is required. Install Node.js, then run npm install in Dashboard." }
$npmPath = $npmCommand.Source

$gitCommand = Get-Command git.exe -ErrorAction SilentlyContinue
if (-not $gitCommand) { $gitCommand = Get-Command git -ErrorAction SilentlyContinue }
if (-not $gitCommand) { throw "Git is required to prove the release source is clean." }
$gitPath = $gitCommand.Source

$package = Read-Json $packagePath "Source package.json"
$expectedVersion = [string]$package.version
if ($expectedVersion -notmatch '^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$') {
  throw "package.json has an invalid release version: $expectedVersion"
}

Write-Host ""
Write-Host "Horizon guarded Windows installer builder (v$expectedVersion)" -ForegroundColor White
Write-Host "This creates one shareable file: Dashboard\native-dist\Horizon-Setup.exe" -ForegroundColor DarkGray

Step "Verifying clean release source"
Assert-CleanWorkingTree $gitPath

Push-Location $dashboardRoot
try {
  Step "Running release gates"
  foreach ($scriptName in @(
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
    Invoke-External "npm run $scriptName" $npmPath @("run", $scriptName)
  }
  Assert-CleanWorkingTree $gitPath

  if (@(Get-Process -Name Horizon -ErrorAction SilentlyContinue).Count -gt 0) {
    throw "Horizon is running. Close Horizon, then run npm run native:installer again."
  }

  Assert-File $electronBuilder "Local electron-builder" | Out-Null

  Step "Cleaning prior build output"
  Remove-GuardedOutput $distRoot "dist"
  Remove-GuardedOutput $nativeOutput "native-dist"

  Step "Creating a clean renderer build"
  Invoke-External "npm run build" $npmPath @("run", "build")

  $sourceBuildInfoPath = Join-Path $distRoot "build-info.json"
  $sourceBuildInfo = Read-Json $sourceBuildInfoPath "Source build-info.json"
  Assert-SameValue $expectedVersion $sourceBuildInfo.version "Source build version"
  if (($sourceBuildInfo.PSObject.Properties.Name -notcontains "dirty") -or ($sourceBuildInfo.dirty -isnot [bool]) -or $sourceBuildInfo.dirty) {
    throw "Source build-info.json reports uncommitted source changes. Release packaging stopped."
  }

  Step "Building the NSIS installer"
  Invoke-External "electron-builder --win nsis --publish never" $electronBuilder @("--win", "nsis", "--publish", "never")

  Step "Validating the installer and packaged app"
  $installer = Assert-File $installerPath "Horizon NSIS installer" 1048576
  $installerCandidates = @(Get-ChildItem -LiteralPath $nativeOutput -Filter "Horizon-Setup*.exe" -File)
  if ($installerCandidates.Count -ne 1 -or $installerCandidates[0].FullName -ne $installer.FullName) {
    throw "Expected exactly one installer named Horizon-Setup.exe in native-dist."
  }

  if (-not (Test-Path -LiteralPath $packagedAppRoot -PathType Container)) {
    throw "The unpacked package is missing, so installer contents cannot be verified: $packagedAppRoot"
  }

  $packagedPackagePath = Join-Path $packagedAppRoot "package.json"
  $packagedPackage = Read-Json $packagedPackagePath "Packaged package.json"
  Assert-SameValue $expectedVersion $packagedPackage.version "Packaged app version"

  $packagedBuildInfoPath = Join-Path $packagedAppRoot "dist\build-info.json"
  $packagedBuildInfo = Read-Json $packagedBuildInfoPath "Packaged build-info.json"
  foreach ($field in @("version", "commit", "renderer", "dirty")) {
    Assert-SameValue $sourceBuildInfo.$field $packagedBuildInfo.$field "Packaged build-info $field"
  }
  if (($packagedBuildInfo.PSObject.Properties.Name -notcontains "dirty") -or ($packagedBuildInfo.dirty -isnot [bool]) -or $packagedBuildInfo.dirty) {
    throw "Packaged build-info.json reports uncommitted source changes. Release packaging stopped."
  }
  if ([string]$packagedBuildInfo.commit -eq "unknown" -or [string]$packagedBuildInfo.renderer -eq "unknown") {
    throw "Packaged build-info.json does not contain a verifiable source and renderer identity."
  }

  $packagedDist = [System.IO.Path]::GetFullPath((Join-Path $packagedAppRoot "dist"))
  $packagedDistPrefix = $packagedDist.TrimEnd("\", "/") + [System.IO.Path]::DirectorySeparatorChar
  $rendererPath = [System.IO.Path]::GetFullPath((Join-Path $packagedDist ([string]$packagedBuildInfo.renderer)))
  if (-not $rendererPath.StartsWith($packagedDistPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Packaged renderer identity points outside the renderer directory."
  }
  Assert-File $rendererPath "Packaged renderer" | Out-Null

  $starterRoot = Join-Path $packagedAppRoot "server\starter-vault"
  foreach ($starterItem in @(
    "00_Index.md",
    "AGENTS.md",
    "HORIZON.md",
    ".obsidian\app.json",
    "00_System\manifests\dashboard.manifest.json",
    "00_System\manifests\integrations.manifest.json",
    "06_Integrations\index.md",
    "Calendar\Items\index.md",
    "Inbox\Captures\index.md",
    "Inbox\To Triage\index.md",
    "Project Registry\index.md",
    "Research Papers\index.md",
    "Runs\CaptureQueue\index.md"
  )) {
    Assert-File (Join-Path $starterRoot $starterItem) "Packaged starter workspace item '$starterItem'" | Out-Null
  }
  Read-Json (Join-Path $starterRoot ".obsidian\app.json") "Packaged .obsidian/app.json" | Out-Null

  $sourceStarterRoot = [System.IO.Path]::GetFullPath((Join-Path $dashboardRoot "server\starter-vault"))
  $sourceStarterPrefix = $sourceStarterRoot.TrimEnd("\", "/") + [System.IO.Path]::DirectorySeparatorChar
  $sourceStarterFiles = @(Get-ChildItem -LiteralPath $sourceStarterRoot -File -Force -Recurse)
  if ($sourceStarterFiles.Count -eq 0) {
    throw "The source starter workspace is empty."
  }
  foreach ($sourceStarterFile in $sourceStarterFiles) {
    $relativeStarterPath = $sourceStarterFile.FullName.Substring($sourceStarterPrefix.Length)
    $packagedStarterFile = Join-Path $starterRoot $relativeStarterPath
    Assert-File $packagedStarterFile "Packaged starter workspace item '$relativeStarterPath'" | Out-Null
    $sourceHash = (Get-FileHash -LiteralPath $sourceStarterFile.FullName -Algorithm SHA256).Hash
    $packagedHash = (Get-FileHash -LiteralPath $packagedStarterFile -Algorithm SHA256).Hash
    if ($sourceHash -ne $packagedHash) {
      throw "Packaged starter workspace item differs from source: $relativeStarterPath"
    }
  }

  Assert-File (Join-Path $packagedAppRoot "server\integrationStoreCrypto.cjs") "Packaged credential-encryption module" | Out-Null
  Assert-File (Join-Path $packagedAppRoot "electron\legacyWindowsMigration.cjs") "Packaged legacy Windows migration module" | Out-Null

  foreach ($personalRoot in @(
    "00_System",
    "06_Integrations",
    "Calendar",
    "Inbox",
    "Project Registry",
    "Research Papers",
    "Runs"
  )) {
    if (Test-Path -LiteralPath (Join-Path $packagedAppRoot $personalRoot)) {
      throw "Personal workspace root was packaged beside the app: $personalRoot"
    }
  }
  foreach ($legacyItem in @("dist-installer", "scripts\make-distribution.ps1")) {
    if (Test-Path -LiteralPath (Join-Path $packagedAppRoot $legacyItem)) {
      throw "Legacy ZIP installer content was packaged: $legacyItem"
    }
  }

  Step "Running packaged Constellation smoke test"
  $packagedServerPath = Join-Path $packagedAppRoot "server.cjs"
  Assert-File $packagedServerPath "Packaged local server" | Out-Null
  $previousSmokeServerPath = [Environment]::GetEnvironmentVariable("HORIZON_SMOKE_SERVER_PATH", "Process")
  $previousSmokePackagePath = [Environment]::GetEnvironmentVariable("HORIZON_SMOKE_PACKAGE_PATH", "Process")
  try {
    $env:HORIZON_SMOKE_SERVER_PATH = $packagedServerPath
    $env:HORIZON_SMOKE_PACKAGE_PATH = $packagedPackagePath
    Invoke-External "Packaged Constellation smoke test" $npmPath @("run", "smoke")
  } finally {
    if ($null -eq $previousSmokeServerPath) {
      Remove-Item Env:\HORIZON_SMOKE_SERVER_PATH -ErrorAction SilentlyContinue
    } else {
      $env:HORIZON_SMOKE_SERVER_PATH = $previousSmokeServerPath
    }
    if ($null -eq $previousSmokePackagePath) {
      Remove-Item Env:\HORIZON_SMOKE_PACKAGE_PATH -ErrorAction SilentlyContinue
    } else {
      $env:HORIZON_SMOKE_PACKAGE_PATH = $previousSmokePackagePath
    }
  }

  $hash = Get-FileHash -LiteralPath $installer.FullName -Algorithm SHA256
  $sizeMb = [Math]::Round($installer.Length / 1MB, 1)

  Write-Host ""
  Write-Host "INSTALLER READY" -ForegroundColor Green
  Write-Host ("Path:    {0}" -f $installer.FullName) -ForegroundColor White
  Write-Host ("Version: {0}" -f $expectedVersion) -ForegroundColor White
  Write-Host ("Size:    {0} MB" -f $sizeMb) -ForegroundColor White
  Write-Host ("SHA256:  {0}" -f $hash.Hash) -ForegroundColor White
} finally {
  Pop-Location
}
