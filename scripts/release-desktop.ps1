$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$clientDir = Join-Path $repoRoot "client"
$tauriConfPath = Join-Path $clientDir "src-tauri\tauri.conf.json"
$keyPath = Join-Path $env:USERPROFILE ".tauri\cakma.key"

if (-not (Test-Path $keyPath)) {
  throw "Signing key not found at $keyPath"
}

$tauriConf = Get-Content $tauriConfPath -Raw | ConvertFrom-Json
$version = $tauriConf.version
Write-Host "Building Çakma v$version with updater signing..." -ForegroundColor Cyan

$env:TAURI_SIGNING_PRIVATE_KEY = (Get-Content $keyPath -Raw).Trim()

Push-Location $clientDir
try {
  # Remove any legacy public/downloads or dist/downloads so Tauri never recursively embeds old installers
  $legacyPublicDownloads = Join-Path $clientDir "public\downloads"
  $legacyDistDownloads = Join-Path $clientDir "dist\downloads"
  if (Test-Path $legacyPublicDownloads) { Remove-Item -Recurse -Force $legacyPublicDownloads }
  if (Test-Path $legacyDistDownloads) { Remove-Item -Recurse -Force $legacyDistDownloads }

  npx tauri build --bundles nsis
  if ($LASTEXITCODE -ne 0) {
    throw "tauri build failed with exit code $LASTEXITCODE"
  }

  $nsisDir = Join-Path $clientDir "src-tauri\target\release\bundle\nsis"
  $exeFile = Get-ChildItem -Path $nsisDir -Filter "*_x64-setup.exe" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $exeFile) {
    throw "NSIS installer not found in $nsisDir"
  }

  $sigFilePath = "$($exeFile.FullName).sig"
  if (-not (Test-Path $sigFilePath)) {
    throw "Signature file not found at $sigFilePath"
  }

  $downloadsDir = Join-Path $repoRoot "downloads"
  New-Item -ItemType Directory -Force -Path $downloadsDir | Out-Null

  Copy-Item -Path $exeFile.FullName -Destination (Join-Path $downloadsDir "Cakma-Setup.exe") -Force

  $signature = (Get-Content $sigFilePath -Raw).Trim()
  $pubDate = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")

  $latestObj = @{
    version = $version
    notes = "Çakma v$version güncellemesi"
    pub_date = $pubDate
    platforms = @{
      "windows-x86_64" = @{
        signature = $signature
        url = "https://ses.yahyakemalokutan.com/downloads/Cakma-Setup.exe"
      }
    }
  }

  $latestJson = $latestObj | ConvertTo-Json -Depth 5
  [System.IO.File]::WriteAllText((Join-Path $downloadsDir "latest.json"), $latestJson, [System.Text.UTF8Encoding]::new($false))

  Write-Host "Release v$version ready in downloads/ (Cakma-Setup.exe + latest.json)" -ForegroundColor Green
}
finally {
  Pop-Location
}
