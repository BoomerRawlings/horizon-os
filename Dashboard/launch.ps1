$ErrorActionPreference = "Stop"

$showBoot = $false
if ($args -contains "-ShowBoot" -or $args -contains "--ShowBoot") {
  $showBoot = $true
}
$autoRestartDelayMs = 0
if ($args -contains "-AutoRestartDelayMs") {
  $delayIndex = [Array]::IndexOf($args, "-AutoRestartDelayMs")
  if ($delayIndex -ge 0 -and $args.Length -gt ($delayIndex + 1)) {
    $delayArg = [int]$args[$delayIndex + 1]
    if ($delayArg -ge 0) {
      $autoRestartDelayMs = $delayArg
    }
  }
}

if ($autoRestartDelayMs -gt 0) {
  Start-Sleep -Milliseconds $autoRestartDelayMs
}

$killParentPid = 0
if ($args -contains "-KillParentPid") {
  $killIndex = [Array]::IndexOf($args, "-KillParentPid")
  if ($killIndex -ge 0 -and $args.Length -gt ($killIndex + 1)) {
    $candidate = [int]$args[$killIndex + 1]
    if ($candidate -gt 0) {
      $killParentPid = $candidate
    }
  }
}

$scriptRoot = (Resolve-Path -LiteralPath $PSScriptRoot).Path
$nativeCandidates = @(
  (Join-Path $scriptRoot "native-dist\win-unpacked\Horizon.exe"),
  (Join-Path $scriptRoot "..\native-dist\win-unpacked\Horizon.exe"),
  (Join-Path $scriptRoot "..\..\native-dist\win-unpacked\Horizon.exe"),
  (Join-Path $scriptRoot "..\..\..\native-dist\win-unpacked\Horizon.exe")
)
$nativeApp = $null
foreach ($candidate in $nativeCandidates) {
  if (Test-Path -LiteralPath $candidate) {
    $nativeApp = (Resolve-Path -LiteralPath $candidate).Path
    break
  }
}

$server = $null
$serverCandidates = @(
  (Join-Path $scriptRoot "server.cjs"),
  (Join-Path $scriptRoot "Dashboard\server.cjs"),
  (Join-Path $scriptRoot "..\Dashboard\server.cjs"),
  (Join-Path $scriptRoot "..\..\Dashboard\server.cjs")
)
foreach ($candidate in $serverCandidates) {
  if (Test-Path -LiteralPath $candidate) {
    $server = (Resolve-Path -LiteralPath $candidate).Path
    break
  }
}
$root = if ($server) {
  Split-Path -Parent $server
} else {
  (Resolve-Path -LiteralPath (Join-Path $scriptRoot "..")).Path
}
$preferredPort = 3873

if (Test-Path -LiteralPath $nativeApp) {
  if ($killParentPid -gt 0) {
    Stop-ProcessWithTimeout -ProcessId $killParentPid -Attempts 50
  }
  if ($showBoot) {
    Start-Process -FilePath $nativeApp -ArgumentList @("--boot") | Out-Null
  } else {
    Start-Process -FilePath $nativeApp | Out-Null
  }
  exit 0
}

$bootSuffix = if ($showBoot) { "?boot=1" } else { "" }

function Stop-ProcessWithTimeout {
  param(
    [int]$ProcessId,
    [int]$Attempts = 40
  )
  if ($ProcessId -le 0) {
    return
  }

  try {
    Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
  } catch {
    # ignore
  }

  for ($i = 0; $i -lt $Attempts; $i += 1) {
    if (-not (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue)) {
      return
    }
    Start-Sleep -Milliseconds 75
  }
}

function Test-RawlingsPort {
  param([int]$Port)
  try {
    $response = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 1
    return $response.app -eq "rawlings-os" -and $response.ui -eq "horizon-react-vite"
  } catch {
    return $false
  }
}

function Test-PortOpen {
  param([int]$Port)
  try {
    $client = New-Object Net.Sockets.TcpClient
    $task = $client.ConnectAsync("127.0.0.1", $Port)
    $ok = $task.Wait(250)
    $client.Close()
    return $ok
  } catch {
    return $false
  }
}

function Get-EdgePath {
  $candidates = @(
    (Join-Path ${env:ProgramFiles(x86)} "Microsoft\Edge\Application\msedge_proxy.exe"),
    (Join-Path $env:ProgramFiles "Microsoft\Edge\Application\msedge_proxy.exe"),
    (Join-Path $env:ProgramFiles "Microsoft\Edge\Application\msedge.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "Microsoft\Edge\Application\msedge.exe"),
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

function Start-HorizonWindow {
  param([int]$Port)

  $url = "http://127.0.0.1:$Port/$bootSuffix"
  $edge = Get-EdgePath
  if ($edge) {
    Start-Process -FilePath $edge -ArgumentList @("--app=$url")
  } else {
    Start-Process $url
  }
}

if (Test-RawlingsPort $preferredPort) {
  Start-HorizonWindow $preferredPort
  exit 0
}

$port = $preferredPort
while ((Test-PortOpen $port) -and -not (Test-RawlingsPort $port)) {
  $port++
}

$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$node = if ($nodeCommand) { $nodeCommand.Source } else { $null }

$bundledNode = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if (-not $node -and (Test-Path -LiteralPath $bundledNode)) {
  $node = $bundledNode
}

if (-not $node) {
  Add-Type -AssemblyName PresentationFramework
  [System.Windows.MessageBox]::Show("Node.js was not found. Open this folder in Codex once, or install Node.js, then launch again.", "Horizon OS")
  exit 1
}

$oldPort = $env:PORT
$env:PORT = [string]$port

$outLog = Join-Path $env:TEMP "rawlings-os.log"
$errLog = Join-Path $env:TEMP "rawlings-os.err.log"
Start-Process -FilePath $node -ArgumentList @($server) -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput $outLog -RedirectStandardError $errLog | Out-Null

$env:PORT = $oldPort

for ($i = 0; $i -lt 30; $i++) {
  if (Test-RawlingsPort $port) {
    Start-HorizonWindow $port
    exit 0
  }
  Start-Sleep -Milliseconds 250
}

Add-Type -AssemblyName PresentationFramework
[System.Windows.MessageBox]::Show("Horizon OS did not start. Logs are in $env:TEMP as rawlings-os.log and rawlings-os.err.log.", "Horizon OS")
exit 1
