$ErrorActionPreference = 'Stop'
$ProjectRoot = 'C:\Users\opeti\LifeMode\lifemode'
$Port = 4311
$UrlFile = Join-Path $env:TEMP 'lifemode-editorial-approval.url'
$LogDirectory = Join-Path $ProjectRoot 'logs'
$StdoutLog = Join-Path $LogDirectory 'editorial-operations.out.log'
$StderrLog = Join-Path $LogDirectory 'editorial-operations.err.log'
$CredentialFile = Join-Path $env:LOCALAPPDATA 'LifeMode\secrets\daily-ideas-r2.json'

New-Item -ItemType Directory -Force -Path $LogDirectory | Out-Null

if (Test-Path -LiteralPath $CredentialFile) {
  try {
    $storedCredentials = Get-Content -Raw -LiteralPath $CredentialFile | ConvertFrom-Json
    $credentialNames = @('R2_ACCOUNT_ID','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','R2_BUCKET_NAME','R2_PUBLIC_BASE_URL')
    foreach ($name in $credentialNames) {
      if (-not [Environment]::GetEnvironmentVariable($name, 'Process') -and $storedCredentials.$name) {
        $secure = ConvertTo-SecureString -String ([string]$storedCredentials.$name)
        $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
        try { [Environment]::SetEnvironmentVariable($name, [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr), 'Process') }
        finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
      }
    }
  } catch {
    Write-Warning "Could not load R2 secrets from $CredentialFile"
  }
}

$listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $listener) {
  Remove-Item -LiteralPath $UrlFile -Force -ErrorAction SilentlyContinue
  Start-Process -FilePath 'node.exe' -ArgumentList '--experimental-strip-types','scripts/editorial-approval-dashboard.ts' -WorkingDirectory $ProjectRoot -RedirectStandardOutput $StdoutLog -RedirectStandardError $StderrLog -WindowStyle Hidden | Out-Null
  for ($i = 0; $i -lt 40; $i++) {
    if (Test-Path -LiteralPath $UrlFile) { break }
    Start-Sleep -Milliseconds 250
  }
}
if (-not (Test-Path -LiteralPath $UrlFile)) { throw "Editorial dashboard did not start. See $StderrLog" }
$url = (Get-Content -Raw -LiteralPath $UrlFile).Trim()
if ($url -notmatch '^http://127\.0\.0\.1:4311/\?token=') { throw "Invalid editorial dashboard URL file. See $StdoutLog" }
Start-Process $url
