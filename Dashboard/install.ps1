$ErrorActionPreference = "Stop"

$dashboard = $PSScriptRoot
$root = (Resolve-Path -LiteralPath (Join-Path $dashboard "..")).Path
$launcher = Join-Path $dashboard "launch.ps1"
$hiddenRunner = Join-Path $dashboard "run-hidden.vbs"
$nativeApp = Join-Path $dashboard "native-dist\win-unpacked\Horizon.exe"
$icon = Join-Path $dashboard "public\horizon-os-icon.ico"
$powershell = Join-Path $env:WINDIR "System32\WindowsPowerShell\v1.0\powershell.exe"
$wscript = Join-Path $env:WINDIR "System32\wscript.exe"
$appUrl = "http://127.0.0.1:3873/"

function Get-EdgePath {
  $candidates = @(
    (Join-Path ${env:ProgramFiles(x86)} "Microsoft\Edge\Application\msedge_proxy.exe"),
    (Join-Path $env:ProgramFiles "Microsoft\Edge\Application\msedge_proxy.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "Microsoft\Edge\Application\msedge.exe"),
    (Join-Path $env:ProgramFiles "Microsoft\Edge\Application\msedge.exe"),
    (Join-Path $env:LOCALAPPDATA "Microsoft\Edge\Application\msedge.exe")
  )

  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path -LiteralPath $candidate)) {
      return $candidate
    }
  }

  $edgeCommand = Get-Command msedge -ErrorAction SilentlyContinue
  if ($edgeCommand) {
    return $edgeCommand.Source
  }

  return $null
}

function New-HorizonShortcut {
  param(
    [Parameter(Mandatory = $true)][string]$Path
  )

  $folder = Split-Path -Parent $Path
  if (-not (Test-Path -LiteralPath $folder)) {
    New-Item -ItemType Directory -Path $folder -Force | Out-Null
  }

  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($Path)
  if (Test-Path -LiteralPath $nativeApp) {
    $shortcut.TargetPath = $nativeApp
    $shortcut.Arguments = ""
    $shortcut.WorkingDirectory = Split-Path -Parent $nativeApp
  } else {
    $edge = Get-EdgePath
    if ($edge) {
      $shortcut.TargetPath = $edge
      $shortcut.Arguments = "--app=$appUrl"
      $shortcut.WorkingDirectory = Split-Path -Parent $edge
    } else {
      $shortcut.TargetPath = $powershell
      $shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$launcher`""
      $shortcut.WorkingDirectory = $root
    }
  }
  $shortcut.IconLocation = $icon
  $shortcut.Description = "Horizon"
  $shortcut.Save()
}

function New-HorizonServerStartupShortcut {
  $startupShortcut = Join-Path ([Environment]::GetFolderPath("Startup")) "HorizonOS Server.lnk"
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($startupShortcut)
  $shortcut.TargetPath = $wscript
  $shortcut.Arguments = "`"$hiddenRunner`" `"server-start.ps1`""
  $shortcut.WorkingDirectory = $root
  $shortcut.IconLocation = $icon
  $shortcut.Description = "Starts the local Horizon server."
  $shortcut.Save()
  return $startupShortcut
}

function Register-HorizonDevUpdater {
  $taskName = "Horizon OS Dev Auto Update"
  $action = New-ScheduledTaskAction `
    -Execute $wscript `
    -Argument "`"$hiddenRunner`" `"update-dev.ps1`""

  $trigger = New-ScheduledTaskTrigger `
    -Once `
    -At (Get-Date).AddMinutes(1) `
    -RepetitionInterval (New-TimeSpan -Minutes 2) `
    -RepetitionDuration (New-TimeSpan -Days 3650)

  $settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 20)

  Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Description "Keeps the local Horizon OS development build current from GitHub." `
    -Force | Out-Null
}

$desktopShortcut = Join-Path ([Environment]::GetFolderPath("Desktop")) "HorizonOS.lnk"
$startMenuShortcut = Join-Path ([Environment]::GetFolderPath("Programs")) "HorizonOS.lnk"
$taskbarShortcut = Join-Path $env:APPDATA "Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar\HorizonOS.lnk"
$startupLaunchShortcut = Join-Path ([Environment]::GetFolderPath("Startup")) "HorizonOS.lnk"
$legacyTaskbarShortcut = Join-Path $env:APPDATA "Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar\Horizon OS.lnk"
$legacyStartupLaunchShortcut = Join-Path ([Environment]::GetFolderPath("Startup")) "Horizon OS.lnk"
$hadTaskbarShortcut = (Test-Path -LiteralPath $taskbarShortcut) -or (Test-Path -LiteralPath $legacyTaskbarShortcut)
$hadStartupLaunchShortcut = (Test-Path -LiteralPath $startupLaunchShortcut) -or (Test-Path -LiteralPath $legacyStartupLaunchShortcut)

$legacyShortcuts = @(
  (Join-Path ([Environment]::GetFolderPath("Desktop")) "Horizon OS.lnk"),
  (Join-Path ([Environment]::GetFolderPath("Programs")) "Horizon.lnk"),
  (Join-Path ([Environment]::GetFolderPath("Programs")) "Horizon OS\Horizon OS.lnk"),
  $legacyTaskbarShortcut,
  $legacyStartupLaunchShortcut,
  (Join-Path ([Environment]::GetFolderPath("Startup")) "Horizon OS Server.lnk")
)

foreach ($legacyShortcut in $legacyShortcuts) {
  if (Test-Path -LiteralPath $legacyShortcut) {
    Remove-Item -LiteralPath $legacyShortcut -Force
  }
}

$legacyStartFolder = Join-Path ([Environment]::GetFolderPath("Programs")) "Horizon OS"
if ((Test-Path -LiteralPath $legacyStartFolder) -and -not (Get-ChildItem -LiteralPath $legacyStartFolder -Force -ErrorAction SilentlyContinue)) {
  Remove-Item -LiteralPath $legacyStartFolder -Force
}

New-HorizonShortcut -Path $desktopShortcut
New-HorizonShortcut -Path $startMenuShortcut
if ($hadTaskbarShortcut) {
  New-HorizonShortcut -Path $taskbarShortcut
}
if ($hadStartupLaunchShortcut) {
  New-HorizonShortcut -Path $startupLaunchShortcut
}

if (Test-Path -LiteralPath $nativeApp) {
  $startupShortcut = Join-Path ([Environment]::GetFolderPath("Startup")) "HorizonOS Server.lnk"
  if (Test-Path -LiteralPath $startupShortcut) {
    Remove-Item -LiteralPath $startupShortcut -Force
  }
} else {
  $startupShortcut = New-HorizonServerStartupShortcut
  & $wscript $hiddenRunner "server-start.ps1"
}

try {
  Register-HorizonDevUpdater
  $updaterRegistered = $true
} catch {
  $updaterRegistered = $false
  Write-Warning "Could not register Horizon OS Dev Auto Update: $($_.Exception.Message)"
}

Write-Host "Installed Horizon OS launchers:"
Write-Host "  Desktop: $desktopShortcut"
Write-Host "  Start:   $startMenuShortcut"
if (Test-Path -LiteralPath $taskbarShortcut) {
  Write-Host "  Taskbar: $taskbarShortcut"
}
if ($startupShortcut -and (Test-Path -LiteralPath $startupShortcut)) {
  Write-Host "Installed startup helper: $startupShortcut"
}
if ($updaterRegistered) {
  Write-Host "Registered scheduled task: Horizon OS Dev Auto Update"
}
