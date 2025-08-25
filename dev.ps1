param(
  [ValidateSet('up','down','logs','phase:a','phase:b','phase:c')]
  [string]$Action = 'up'
)

#!/usr/bin/env pwsh
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Config (PS5-compatible; avoid ?? operator)
if (-not $env:TEMPORAL_PORT -or $env:TEMPORAL_PORT -eq '') { $env:TEMPORAL_PORT = '7233' }
if (-not $env:TEMPORAL_UI_PORT -or $env:TEMPORAL_UI_PORT -eq '') { $env:TEMPORAL_UI_PORT = '8080' }

# Docker Compose command - use array for better argument handling
$DC = @('docker', 'compose')

function Have-Service($name) {
  try {
    $services = & $DC[0] $DC[1] config --services 2>$null
    return $services -contains $name
  } catch { return $false }
}

function Wait-Tcp($HostName, $Port, $Name) {
  Write-Host "Waiting for $Name ..."
  for ($i=0; $i -lt 60; $i++) {
    try {
      $client = New-Object System.Net.Sockets.TcpClient
      $iar = $client.BeginConnect($HostName, [int]$Port, $null, $null)
      $ok = $iar.AsyncWaitHandle.WaitOne(500)
      if ($ok -and $client.Connected) { $client.Close(); Write-Host "$Name is up"; return }
      $client.Close()
    } catch { }
    Start-Sleep -Milliseconds 500
  }
  throw "Timeout waiting for $Name"
}

function Wait-Http($Url, $Name) {
  Write-Host "Waiting for $Name ..."
  for ($i=0; $i -lt 60; $i++) {
    try {
      Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 -Uri $Url | Out-Null
      Write-Host "$Name is up"
      return
    } catch { }
    Start-Sleep -Milliseconds 500
  }
  Write-Warning "Skipping: $Name not responding (continuing)"
}

function Phase-Cmd($Phase) {
  switch ($Phase) {
    'phase:a' { & $DC[0] $DC[1] run --rm ops npm run ops:phase:a; break }
    'phase:b' { & $DC[0] $DC[1] run --rm ops npm run ops:phase:b; break }
    'phase:c' { & $DC[0] $DC[1] run --rm ops npm run ops:phase:c; break }
    default { throw "Unknown phase '$Phase'" }
  }
}

switch ($Action) {
  'up' {
    Write-Host "Bringing up Temporal stack..."
    
    # Check if 127.0.0.1:7233 is listening, if not start temporal services
    $temporalListening = $false
    try {
      $client = New-Object System.Net.Sockets.TcpClient
      $iar = $client.BeginConnect('127.0.0.1', [int]$env:TEMPORAL_PORT, $null, $null)
      $ok = $iar.AsyncWaitHandle.WaitOne(500)
      if ($ok -and $client.Connected) { 
        $temporalListening = $true
        $client.Close()
        Write-Host "Temporal already running on 127.0.0.1:$env:TEMPORAL_PORT"
      } else {
        $client.Close()
      }
    } catch { }
    
    if (-not $temporalListening) {
      Write-Host "Starting Temporal services..."
      & $DC[0] $DC[1] up -d temporal-postgres temporal temporal-ui | Out-Null
    } else {
      Write-Host "Ensuring Temporal services are up..."
      & $DC[0] $DC[1] up -d temporal-postgres temporal temporal-ui | Out-Null
    }

    Wait-Tcp '127.0.0.1' $env:TEMPORAL_PORT ("Temporal gRPC :" + $env:TEMPORAL_PORT)
    Wait-Http ("http://127.0.0.1:" + $env:TEMPORAL_UI_PORT) ("Temporal UI :" + $env:TEMPORAL_UI_PORT)

    if (Have-Service 'worker') {
      Write-Host "Starting worker via Docker..."
      & $DC[0] $DC[1] up -d worker | Out-Null
    } else {
      Write-Host "Starting worker locally via npm shim..."
      # Launch worker via the actual npm shim to ensure proper environment
      try {
        # First try npm directly
        $npm = Get-Command npm -ErrorAction SilentlyContinue
        if ($npm) {
          $npmPath = if ($npm.Source) { $npm.Source } else { "npm" }
        } else {
          # Try npm.cmd on Windows
          $npmCmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
          if ($npmCmd) {
            $npmPath = $npmCmd.Source
          } else {
            throw "npm not found"
          }
        }
        
        Write-Host "Using npm at: $npmPath"
        Start-Process -NoNewWindow -FilePath $npmPath `
          -ArgumentList @("run", "-w", "apps/worker", "start") `
          -WorkingDirectory $PSScriptRoot
        Write-Host "Worker started via npm run -w apps/worker start."
      } catch {
        Write-Host "Falling back to npx tsx..."
        try {
          $npx = (Get-Command npx.cmd -ErrorAction Stop).Source
          Start-Process -NoNewWindow -FilePath $npx `
            -ArgumentList @("tsx","apps/worker/src/worker.ts") `
            -WorkingDirectory $PSScriptRoot
          Write-Host "Worker started via npx tsx."
        } catch {
          Write-Host "Falling back to Node dist..."
          $node = (Get-Command node.exe -ErrorAction Stop).Source
          Start-Process -NoNewWindow -FilePath $node `
            -ArgumentList @("apps\worker\dist\worker.js") `
            -WorkingDirectory $PSScriptRoot
          Write-Host "Worker started via node dist."
        }
      }
    }

    Write-Host ""
    Write-Host "Logs (Ctrl+C to stop viewing; services keep running):"
    if (Have-Service 'worker') {
      & $DC[0] $DC[1] logs -f temporal temporal-ui worker
    } else {
      & $DC[0] $DC[1] logs -f temporal temporal-ui
    }
    break
  }

  'down' {
    Write-Host "Stopping stack..."
    & $DC[0] $DC[1] down -v
    break
  }

  'logs' {
    if (Have-Service 'worker') {
      & $DC[0] $DC[1] logs -f temporal temporal-ui worker
    } else {
      & $DC[0] $DC[1] logs -f temporal temporal-ui
    }
    break
  }

  'phase:a' { if (-not (Have-Service 'ops')) { throw "'ops' service not found in docker-compose.yml." }; Phase-Cmd $Action; break }
  'phase:b' { if (-not (Have-Service 'ops')) { throw "'ops' service not found in docker-compose.yml." }; Phase-Cmd $Action; break }
  'phase:c' { if (-not (Have-Service 'ops')) { throw "'ops' service not found in docker-compose.yml." }; Phase-Cmd $Action; break }
}
Write-Host ""
Write-Host "Done. Useful commands:"
Write-Host "  .\dev.ps1 logs               # tail Temporal & worker logs"
Write-Host "  .\dev.ps1 phase:a            # Shadow canary (no promotions)"
Write-Host "  .\dev.ps1 phase:b            # Controlled promotions (muted)"
Write-Host "  .\dev.ps1 phase:c            # Full E2E (muted comms)"