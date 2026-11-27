[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$rootDir = Split-Path -Parent $PSScriptRoot
$clientDir = Join-Path $rootDir 'client'
$androidDir = Join-Path $clientDir 'android'
$downloadsDir = Join-Path $rootDir 'downloads'

if (-not (Test-Path $androidDir)) {
  throw "Android projesi bulunamadı: $androidDir (önce npx cap add android çalıştırılmalı)"
}

# 1. Discover JDK 21
$javaExe = $null
$jdkCandidates = @()
if ($env:JAVA_HOME) { $jdkCandidates += (Join-Path $env:JAVA_HOME 'bin\java.exe') }
$localJdkBase = Join-Path $env:LOCALAPPDATA 'Programs\Jdk21'
if (Test-Path $localJdkBase) {
  $jdkCandidates += (Get-ChildItem -Path $localJdkBase -Filter 'java.exe' -Recurse -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName)
}
$jdkCandidates += (Get-ChildItem -Path 'C:\Program Files\Microsoft\jdk-21*' -Filter 'java.exe' -Recurse -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName)
$jdkCandidates += (Get-ChildItem -Path 'C:\Program Files\Eclipse Adoptium\jdk-21*' -Filter 'java.exe' -Recurse -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName)

foreach ($cand in $jdkCandidates) {
  if ($cand -and (Test-Path $cand)) {
    $javaExe = $cand
    break
  }
}
if (-not $javaExe) {
  throw 'JDK 21 bulunamadı. Lütfen JDK 21 kurun veya JAVA_HOME tanımlayın.'
}
$javaHome = Split-Path (Split-Path $javaExe -Parent) -Parent
$env:JAVA_HOME = $javaHome
$env:PATH = "$javaHome\bin;$env:PATH"

# 2. Discover Android SDK
$sdkDir = $null
foreach ($cand in @($env:ANDROID_HOME, $env:ANDROID_SDK_ROOT, (Join-Path $env:LOCALAPPDATA 'Android\Sdk'))) {
  if ($cand -and (Test-Path $cand)) {
    $sdkDir = $cand
    break
  }
}
if (-not $sdkDir) {
  throw 'Android SDK bulunamadı ($env:LOCALAPPDATA\Android\Sdk).'
}
$env:ANDROID_HOME = $sdkDir
$env:ANDROID_SDK_ROOT = $sdkDir

$sdkEscaped = $sdkDir -replace '\\', '/'
Set-Content -Path (Join-Path $androidDir 'local.properties') -Value "sdk.dir=$sdkEscaped" -Encoding ASCII

# Locate build-tools (zipalign + apksigner)
$buildToolsRoot = Join-Path $sdkDir 'build-tools'
$latestBuildTools = Get-ChildItem -Path $buildToolsRoot -Directory | Sort-Object Name -Descending | Select-Object -First 1
if (-not $latestBuildTools) {
  throw "Android build-tools bulunamadı: $buildToolsRoot"
}
$zipalign = Join-Path $latestBuildTools.FullName 'zipalign.exe'
$apksigner = Join-Path $latestBuildTools.FullName 'apksigner.bat'

# 3. Ensure signing keystore exists
$keyDir = Join-Path $env:USERPROFILE '.tauri'
if (-not (Test-Path $keyDir)) {
  New-Item -ItemType Directory -Force -Path $keyDir | Out-Null
}
$keystorePath = Join-Path $keyDir 'cakma-android.jks'
$keyAlias = 'cakma-release'
$keyPassFile = Join-Path $keyDir 'cakma-android.pass'
$storePass = $env:ANDROID_KEYSTORE_PASSWORD
if (-not $storePass) {
  if (Test-Path $keyPassFile) {
    $storePass = (Get-Content $keyPassFile -Raw).Trim()
  } else {
    $storePass = 'CakmaRelease2026!'
    Set-Content -Path $keyPassFile -Value $storePass -Encoding ASCII
  }
}

if (-not (Test-Path $keystorePath)) {
  Write-Host '🔐 Yeni Android release keystore oluşturuluyor...'
  $keytool = Join-Path $javaHome 'bin\keytool.exe'
  & $keytool -genkeypair -v -keystore $keystorePath -storetype PKCS12 -keyalg RSA -keysize 2048 -validity 10000 -alias $keyAlias -storepass $storePass -keypass $storePass -dname 'CN=Cakma, OU=App, O=YahyaKemalOkutan, L=Istanbul, C=TR'
  if ($LASTEXITCODE -ne 0) { throw 'keytool ile keystore oluşturulamadı.' }
}

# 4. Build client & sync Capacitor assets
Write-Host '📦 Client production build alınıyor...'
npm.cmd --prefix $clientDir run build
if ($LASTEXITCODE -ne 0) { throw 'Client build başarısız.' }

Push-Location $clientDir
try {
  Write-Host '🔄 Capacitor Android varlıkları senkronize ediliyor...'
  npx.cmd cap sync android
  if ($LASTEXITCODE -ne 0) { throw 'npx cap sync android başarısız.' }
} finally {
  Pop-Location
}

# 5. Assemble Android Release APK
Push-Location $androidDir
try {
  Write-Host '🤖 Gradle assembleRelease çalıştırılıyor...'
  .\gradlew.bat assembleRelease --no-daemon
  if ($LASTEXITCODE -ne 0) { throw 'Gradle assembleRelease başarısız.' }
} finally {
  Pop-Location
}

$apkOutDir = Join-Path $androidDir 'app\build\outputs\apk\release'
$unsignedApk = Join-Path $apkOutDir 'app-release-unsigned.apk'
$signedGradleApk = Join-Path $apkOutDir 'app-release.apk'
$sourceApk = if (Test-Path $unsignedApk) { $unsignedApk } elseif (Test-Path $signedGradleApk) { $signedGradleApk } else {
  $found = Get-ChildItem -Path $apkOutDir -Filter '*.apk' | Select-Object -First 1
  if (-not $found) { throw "Release APK çıktısı bulunamadı: $apkOutDir" }
  $found.FullName
}

if (-not (Test-Path $downloadsDir)) {
  New-Item -ItemType Directory -Force -Path $downloadsDir | Out-Null
}
$alignedApk = Join-Path $env:TEMP 'cakma-aligned.apk'
$finalApk = Join-Path $downloadsDir 'Cakma.apk'

if (Test-Path $alignedApk) { Remove-Item $alignedApk -Force }
& $zipalign -p -f 4 $sourceApk $alignedApk
if ($LASTEXITCODE -ne 0) { throw 'zipalign başarısız.' }

Write-Host '✍️ APK imzalanıyor...'
& $apksigner sign --ks $keystorePath --ks-key-alias $keyAlias --ks-pass "pass:$storePass" --key-pass "pass:$storePass" --out $finalApk $alignedApk
if ($LASTEXITCODE -ne 0) { throw 'apksigner sign başarısız.' }
Remove-Item $alignedApk -Force -ErrorAction SilentlyContinue
Remove-Item "$finalApk.idsig" -Force -ErrorAction SilentlyContinue

& $apksigner verify --print-certs $finalApk
if ($LASTEXITCODE -ne 0) { throw 'apksigner verify başarısız.' }

$hash = (Get-FileHash -Path $finalApk -Algorithm SHA256).Hash.ToLower()
Set-Content -Path "$finalApk.sha256" -Value "$hash  Cakma.apk" -Encoding ASCII

$sizeMb = [Math]::Round((Get-Item $finalApk).Length / 1MB, 2)
Write-Host "✅ İmzalı Android APK hazır: $finalApk ($sizeMb MB | sha256: $hash)"
