$ErrorActionPreference = "Stop"

$dashboard = $PSScriptRoot
$root = (Resolve-Path -LiteralPath (Join-Path $dashboard "..")).Path
$server = Join-Path $dashboard "server.cjs"
$port = 3873

function Test-HorizonPort {
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

function Get-NodeCommand {
  $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
  if ($nodeCommand) {
    return $nodeCommand.Source
  }

  return $null
}

if (Test-HorizonPort $port) {
  exit 0
}

if (Test-PortOpen $port) {
  throw "Port $port is already in use by another process."
}

$node = Get-NodeCommand
if (-not $node) {
  throw "Node.js was not found. Install Node.js, then launch Horizon again."
}

$oldPort = $env:PORT
$env:PORT = [string]$port

$outLog = Join-Path $env:TEMP "rawlings-os.log"
$errLog = Join-Path $env:TEMP "rawlings-os.err.log"
Start-Process -FilePath $node -ArgumentList @($server) -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput $outLog -RedirectStandardError $errLog | Out-Null

$env:PORT = $oldPort

for ($i = 0; $i -lt 30; $i++) {
  if (Test-HorizonPort $port) {
    exit 0
  }
  Start-Sleep -Milliseconds 250
}

throw "Horizon OS did not start. Logs are in $env:TEMP as rawlings-os.log and rawlings-os.err.log."
