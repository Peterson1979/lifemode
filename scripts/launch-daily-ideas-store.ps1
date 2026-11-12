$ErrorActionPreference = 'Stop'
$ProjectRoot = 'C:\Users\opeti\LifeMode\lifemode'
$LogDirectory = Join-Path $ProjectRoot 'logs'
$CredentialFile = Join-Path $env:LOCALAPPDATA 'LifeMode\secrets\daily-ideas-r2.json'

New-Item -ItemType Directory -Force -Path $LogDirectory | Out-Null
$oldPort = $env:LIFEMODE_STORE_PORT
$oldUrlFile = $env:LIFEMODE_STORE_URL_FILE
$credentialNames = @('R2_ACCOUNT_ID','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','R2_BUCKET_NAME','R2_PUBLIC_BASE_URL')
$oldCredentials = @{}
$injectedCredentials = @()
$started = $false
$failureDetails = @()

try {
  if (Test-Path -LiteralPath $CredentialFile) {
    $storedCredentials = Get-Content -Raw -LiteralPath $CredentialFile | ConvertFrom-Json
    foreach ($name in $credentialNames) {
      $oldCredentials[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
      if (-not $oldCredentials[$name] -and $storedCredentials.$name) {
        $secure = ConvertTo-SecureString -String ([string]$storedCredentials.$name)
        $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
        try { [Environment]::SetEnvironmentVariable($name, [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr), 'Process'); $injectedCredentials += $name }
        finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
      }
    }
  }
  foreach ($Port in 4314..4330) {
    $UrlFile = Join-Path $env:TEMP "lifemode-daily-ideas-store-$Port.url"
    $StdoutLog = Join-Path $LogDirectory "daily-ideas-store-$Port.out.log"
    $StderrLog = Join-Path $LogDirectory "daily-ideas-store-$Port.err.log"
    Remove-Item -LiteralPath $UrlFile -Force -ErrorAction SilentlyContinue
    $env:LIFEMODE_STORE_PORT = [string]$Port
    $env:LIFEMODE_STORE_URL_FILE = $UrlFile
    $child = Start-Process -FilePath 'node.exe' -ArgumentList '--experimental-strip-types','scripts/daily-ideas-store-dashboard.ts' -WorkingDirectory $ProjectRoot -RedirectStandardOutput $StdoutLog -RedirectStandardError $StderrLog -WindowStyle Hidden -PassThru
    for ($i = 0; $i -lt 40; $i++) {
      if (Test-Path -LiteralPath $UrlFile) { break }
      if ($child.HasExited) { break }
      Start-Sleep -Milliseconds 250
    }
    if (Test-Path -LiteralPath $UrlFile) {
      $url = (Get-Content -Raw -LiteralPath $UrlFile).Trim()
      if ($url -match "^http://127\.0\.0\.1:$Port/\?token=") {
        Write-Output "LifeMode Daily Ideas Store dashboard started at $url"
        Write-Output "Dashboard process ID: $($child.Id)"
        try {
          Start-Process -FilePath $url -ErrorAction Stop
        } catch {
          Write-Warning "The dashboard server is running, but this execution environment could not launch the browser automatically. Open this URL manually: $url"
        }
        $started = $true
        break
      }
    }
    $errorText = (Get-Content -Raw -LiteralPath $StderrLog -ErrorAction SilentlyContinue).Trim()
    $failureDetails += "Port ${Port}: $errorText"
    if (-not $child.HasExited) { Stop-Process -Id $child.Id -Force -ErrorAction SilentlyContinue }
  }
} finally {
  if ($null -eq $oldPort) { Remove-Item Env:LIFEMODE_STORE_PORT -ErrorAction SilentlyContinue } else { $env:LIFEMODE_STORE_PORT = $oldPort }
  if ($null -eq $oldUrlFile) { Remove-Item Env:LIFEMODE_STORE_URL_FILE -ErrorAction SilentlyContinue } else { $env:LIFEMODE_STORE_URL_FILE = $oldUrlFile }
  foreach ($name in $credentialNames) {
    if ($injectedCredentials -contains $name) { [Environment]::SetEnvironmentVariable($name, $null, 'Process') }
  }
}

if (-not $started) { throw "Daily Ideas store dashboard could not start on ports 4314-4330. $($failureDetails -join ' | ')" }
