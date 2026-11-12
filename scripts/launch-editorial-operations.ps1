$ErrorActionPreference = 'Stop'
$ProjectRoot = 'C:\Users\opeti\LifeMode\lifemode'
$Port = 4311
$LogDirectory = Join-Path $ProjectRoot 'logs'
$UrlFile = Join-Path $LogDirectory 'editorial-operations.url'
$StdoutLog = Join-Path $LogDirectory 'editorial-operations.out.log'
$StderrLog = Join-Path $LogDirectory 'editorial-operations.err.log'
$CredentialFile = Join-Path $env:LOCALAPPDATA 'LifeMode\secrets\daily-ideas-r2.json'

New-Item -ItemType Directory -Force -Path $LogDirectory | Out-Null

function Get-TrimmedContent([string]$Path) {
  if (Test-Path -LiteralPath $Path) {
    $raw = Get-Content -Raw -LiteralPath $Path -ErrorAction SilentlyContinue
    if ($null -ne $raw) { return $raw.Trim() }
  }
  return ''
}

# 1. Load Cloudflare R2 secrets if present
try {
  if (Test-Path -LiteralPath $CredentialFile -ErrorAction SilentlyContinue) {
    $storedCredentials = Get-Content -Raw -LiteralPath $CredentialFile -ErrorAction SilentlyContinue | ConvertFrom-Json
    $credentialNames = @('R2_ACCOUNT_ID','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','R2_BUCKET_NAME','R2_PUBLIC_BASE_URL')
    foreach ($name in $credentialNames) {
      if (-not [Environment]::GetEnvironmentVariable($name, 'Process') -and $storedCredentials.$name) {
        $secure = ConvertTo-SecureString -String ([string]$storedCredentials.$name)
        $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
        try { [Environment]::SetEnvironmentVariable($name, [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr), 'Process') }
        finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
      }
    }
  }
} catch {
  # Graceful fallback if credentials cannot be accessed
}

# 2. Terminate any previous dashboard process on port 4311 to guarantee latest code is served
$existingConn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($existingConn -and $existingConn.OwningProcess) {
  try {
    $existingProc = Get-Process -Id $existingConn.OwningProcess -ErrorAction SilentlyContinue
    if ($existingProc -and $existingProc.ProcessName -eq 'node') {
      Write-Output "Stopping previous dashboard process (PID $($existingProc.Id)) on port $Port to ensure latest code runs..."
      Stop-Process -Id $existingProc.Id -Force -ErrorAction SilentlyContinue
      Start-Sleep -Milliseconds 800
    }
  } catch {}
}

# 4. Remove stale URL file and clear old logs before starting
try {
  Remove-Item -LiteralPath $UrlFile -Force -ErrorAction SilentlyContinue
  if (Test-Path -LiteralPath $StdoutLog) { Clear-Content -LiteralPath $StdoutLog -ErrorAction SilentlyContinue }
  if (Test-Path -LiteralPath $StderrLog) { Clear-Content -LiteralPath $StderrLog -ErrorAction SilentlyContinue }
} catch {}

# 5. Set environment variables for the dashboard server
$env:LIFEMODE_APPROVAL_PORT = [string]$Port
$env:LIFEMODE_APPROVAL_URL_FILE = $UrlFile

# 6. Start Node dashboard server as a persistent, detached background process
$cmdLine = "cmd.exe /c ""node.exe --experimental-strip-types scripts/editorial-approval-dashboard.ts > `"$StdoutLog`" 2> `"$StderrLog`""""
$spawnedPid = $null

try {
  $wmiResult = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
    CommandLine = $cmdLine
    CurrentDirectory = $ProjectRoot
  }
  if ($wmiResult.ReturnValue -eq 0) {
    $spawnedPid = $wmiResult.ProcessId
  }
} catch {
  # Fallback to Start-Process if WMI is unavailable
  $child = Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', $cmdLine -WorkingDirectory $ProjectRoot -WindowStyle Hidden -PassThru
  $spawnedPid = $child.Id
}

# 7. Wait until the server responds successfully over HTTP (up to 20 seconds)
$started = $false
$url = $null
$timeoutSeconds = 20
$stopwatch = [System.Diagnostics.Stopwatch]::StartNew()

while ($stopwatch.Elapsed.TotalSeconds -lt $timeoutSeconds) {
  # Check if stderr already recorded a fatal startup error (e.g. EADDRINUSE or syntax error)
  $errText = Get-TrimmedContent $StderrLog
  if ($errText -match 'Error:' -or $errText -match 'SyntaxError:' -or $errText -match 'EADDRINUSE') {
    break
  }

  $candidateUrl = Get-TrimmedContent $UrlFile
  if ($candidateUrl -match '^http://127\.0\.0\.1:\d+/\?token=[a-f0-9]+') {
    try {
      $res = Invoke-WebRequest -Uri $candidateUrl -Method Get -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
      if ($res.StatusCode -eq 200) {
        $url = $candidateUrl
        $started = $true
        break
      }
    } catch {
      # Process is still binding ports or initializing
    }
  }
  Start-Sleep -Milliseconds 250
}

# 8. If startup failed, display the actual server error
if (-not $started -or -not $url) {
  $stderr = Get-TrimmedContent $StderrLog
  $stdout = Get-TrimmedContent $StdoutLog

  $errorDetails = if ($stderr) {
    $stderr
  } elseif ($stdout) {
    $stdout
  } else {
    "No output in logs. Check $StdoutLog and $StderrLog"
  }

  throw "Editorial dashboard failed to start on http://127.0.0.1:$Port`n`nServer Error Output:`n$errorDetails"
}

# 9. Server is confirmed healthy and responding with HTTP 200: Open in default browser
Write-Output "LifeMode Editorial Operations dashboard started successfully at $url"
if ($spawnedPid) {
  Write-Output "Server process ID: $spawnedPid"
}

try {
  Start-Process -FilePath $url -ErrorAction Stop
} catch {
  Write-Warning "The dashboard server is running at $url, but the default browser could not be opened automatically: $_"
}
