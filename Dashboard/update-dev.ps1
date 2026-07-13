$ErrorActionPreference = "Stop"

$dashboard = $PSScriptRoot
$root = (Resolve-Path -LiteralPath (Join-Path $dashboard "..")).Path
$hiddenRunner = Join-Path $dashboard "run-hidden.vbs"
$nativeApp = Join-Path $dashboard "native-dist\win-unpacked\Horizon.exe"
$wscript = Join-Path $env:WINDIR "System32\wscript.exe"
$port = 3873
$log = Join-Path $env:TEMP "horizon-os-dev-update.log"

function Write-UpdateLog {
  param([string]$Message)
  $stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  Add-Content -Path $log -Value "[$stamp] $Message"
}

function Invoke-Git {
  param(
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [int]$TimeoutSeconds = 120
  )

  $output = & git -C $root @Arguments 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "git $($Arguments -join ' ') failed: $output"
  }
  return ($output -join "`n").Trim()
}

function Get-HorizonServerProcess {
  $listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1

  if (-not $listener) {
    return $null
  }

  $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)" -ErrorAction SilentlyContinue
  if ($process -and $process.CommandLine -like "*server.cjs*") {
    return $process
  }

  return $null
}

function Get-HorizonWindowProcesses {
  $appUrl = "http://127.0.0.1:$port"
  $edgeWindows = @(Get-CimInstance Win32_Process -Filter "Name = 'msedge.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*--app=$appUrl*" })
  $nativeWindows = @(Get-CimInstance Win32_Process -Filter "Name = 'Horizon.exe'" -ErrorAction SilentlyContinue |
    Where-Object { -not $_.ExecutablePath -or $_.ExecutablePath -eq $nativeApp })

  return @($edgeWindows + $nativeWindows)
}

function Get-NodeCommand {
  $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
  if ($nodeCommand) {
    return $nodeCommand.Source
  }

  return $null
}

function Start-HiddenDashboardScript {
  param([Parameter(Mandatory = $true)][string]$ScriptName)

  if ((Test-Path -LiteralPath $hiddenRunner) -and (Test-Path -LiteralPath $wscript)) {
    Start-Process -FilePath $wscript `
      -ArgumentList @($hiddenRunner, $ScriptName) `
      -WorkingDirectory $root `
      -WindowStyle Hidden | Out-Null
    return
  }

  $scriptPath = Join-Path $dashboard $ScriptName
  Start-Process -FilePath "powershell.exe" `
    -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", $scriptPath) `
    -WorkingDirectory $root `
    -WindowStyle Hidden | Out-Null
}

try {
  Write-UpdateLog "Checking for updates."

  # Only TRACKED, uncommitted changes should block an auto-update. The live vault is
  # constantly full of untracked runtime files (captures, run logs, queue notes); treating
  # those as "local changes" made this updater skip forever, so the packaged app never
  # refreshed. Untracked files are never touched by `git pull`, so they are safe to ignore.
  $status = Invoke-Git -Arguments @("status", "--porcelain")
  $trackedDirty = @($status -split "`n" | Where-Object { $_ -and ($_ -notmatch '^\?\?') })
  if ($trackedDirty.Count -gt 0) {
    Write-UpdateLog "Skipped update because tracked local changes are present."
    exit 0
  }

  Invoke-Git -Arguments @("fetch", "--prune", "origin") | Out-Null

  $current = Invoke-Git -Arguments @("rev-parse", "HEAD")
  try {
    $upstream = Invoke-Git -Arguments @("rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}")
  } catch {
    $branch = Invoke-Git -Arguments @("rev-parse", "--abbrev-ref", "HEAD")
    $upstream = "origin/$branch"
  }
  $latest = Invoke-Git -Arguments @("rev-parse", $upstream)

  if ($current -eq $latest) {
    Write-UpdateLog "Already up to date."
    exit 0
  }

  $serverProcess = Get-HorizonServerProcess
  $windowProcesses = Get-HorizonWindowProcesses
  $hadWindow = $windowProcesses.Count -gt 0
  $wasRunning = ($null -ne $serverProcess) -or $hadWindow

  if ($wasRunning) {
    if ($windowProcesses.Count -gt 0) {
      Write-UpdateLog "Closing Horizon OS app window before update."
      foreach ($windowProcess in $windowProcesses) {
        Stop-Process -Id $windowProcess.ProcessId -Force -ErrorAction SilentlyContinue
      }
    }

    if ($serverProcess) {
      Write-UpdateLog "Stopping running Horizon OS server before update."
      Stop-Process -Id $serverProcess.ProcessId -Force -ErrorAction SilentlyContinue
    }

    Start-Sleep -Milliseconds 700
  }

  Write-UpdateLog "Pulling update from $upstream."
  Invoke-Git -Arguments @("pull", "--ff-only") | Out-Null

  $node = Get-NodeCommand
  if (-not $node) {
    throw "Node.js was not found."
  }

  Write-UpdateLog "Installing dependencies."
  Push-Location $dashboard
  try {
    & npm ci --no-audit --no-fund | Out-Null
    if ($LASTEXITCODE -ne 0) {
      throw "npm ci failed."
    }

    Write-UpdateLog "Building Horizon OS."
    & npm run build | Out-Null
    if ($LASTEXITCODE -ne 0) {
      throw "npm run build failed."
    }

    Write-UpdateLog "Packaging Horizon native app."
    # native:pack:safe builds the web bundle, packages Electron to a temp dir OUTSIDE the
    # vault, verifies it, and only then mirrors it into native-dist. The previous call here
    # (native:pack:only) is a disabled guard-rail stub that always exits 1, so every update
    # rebuilt source but never repackaged the app the taskbar launches - leaving it stale.
    & npm run native:pack:safe | Out-Null
    if ($LASTEXITCODE -ne 0) {
      throw "npm run native:pack:safe failed."
    }
  } finally {
    Pop-Location
  }

  if ($hadWindow) {
    Write-UpdateLog "Relaunching Horizon OS."
    Start-HiddenDashboardScript -ScriptName "launch.ps1"
  } elseif ($wasRunning) {
    Write-UpdateLog "Restarting Horizon OS local server."
    Start-HiddenDashboardScript -ScriptName "server-start.ps1"
  } else {
    Write-UpdateLog "Updated while closed; leaving Horizon OS closed."
  }
} catch {
  Write-UpdateLog "Update failed: $($_.Exception.Message)"
  exit 1
}
