<#
  Builds the CRW+ Android app (APK) on this Windows PC, without EAS.

    powershell -ExecutionPolicy Bypass -File scripts\build-android.ps1            # arm64 release APK
    powershell -ExecutionPolicy Bypass -File scripts\build-android.ps1 -Clean     # regenerate android/ first
    powershell -ExecutionPolicy Bypass -File scripts\build-android.ps1 -AllArchs  # also 32-bit / emulators

  Needs JDK 17 and an Android SDK (platform 36, build-tools 36.0.0, CMake 3.22.1,
  NDK 27.2). By default it uses the JDK from Unity and the SDK in
  %LOCALAPPDATA%\Android\Sdk. The app talks to the production API; the addresses come
  from the "preview" profile in eas.json, the single place they are kept.
#>
param(
  [switch]$Clean,
  [switch]$AllArchs,
  [string]$Variant = 'Release'
)
$ErrorActionPreference = 'Stop'
$app = Split-Path -Parent $PSScriptRoot
Set-Location $app

# --- toolchain ---
$unityJdk = 'C:\Program Files\Unity\Hub\Editor\6000.6.0f1\Editor\Data\PlaybackEngines\AndroidPlayer\OpenJDK'
if (-not $env:JAVA_HOME -and (Test-Path "$unityJdk\bin\java.exe")) { $env:JAVA_HOME = $unityJdk }
if (-not $env:JAVA_HOME) { throw 'Set JAVA_HOME to a JDK 17.' }
if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk" }
if (-not (Test-Path "$env:ANDROID_HOME\platforms\android-36")) { throw "Android SDK platform 36 not found in $env:ANDROID_HOME" }
$ndkVersion = (Get-ChildItem "$env:ANDROID_HOME\ndk" -Directory | Sort-Object Name -Descending | Select-Object -First 1).Name
$env:Path = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:Path"
Write-Host "JDK $env:JAVA_HOME | SDK $env:ANDROID_HOME | NDK $ndkVersion"

# --- app configuration baked into the JavaScript bundle ---
$eas = Get-Content eas.json -Raw | ConvertFrom-Json
foreach ($p in $eas.build.preview.env.PSObject.Properties) {
  Set-Item -Path "env:$($p.Name)" -Value $p.Value
  Write-Host "$($p.Name)=$($p.Value.Substring(0, [Math]::Min(40, $p.Value.Length)))"
}
$env:NODE_ENV = 'production'

# --- native project ---
if ($Clean -or -not (Test-Path android)) {
  $env:CI = '1'
  npx expo prebuild --platform android --clean --no-install
  if ($LASTEXITCODE) { throw 'expo prebuild failed' }
  Remove-Item env:CI
}

# PowerShell 5's Set-Content -Encoding utf8 writes a byte order mark, which Gradle rejects.
$utf8 = New-Object Text.UTF8Encoding $false
function Read-Text($path) { [IO.File]::ReadAllText((Join-Path $app $path)).TrimStart([char]0xFEFF) }
function Write-Text($path, $text) { [IO.File]::WriteAllText((Join-Path $app $path), $text, $utf8) }

# Use the installed NDK and build-tools (React Native asks for NDK 27.1, and libraries
# that name no build-tools fall back to 35.0.0, which would need another download).
$buildTools = (Get-ChildItem "$env:ANDROID_HOME\build-tools" -Directory | Sort-Object Name -Descending | Select-Object -First 1).Name
$root = Read-Text 'android\build.gradle'
if ($root -notmatch 'crw-local-toolchain') {
  $block = @"
// crw-local-toolchain: added by scripts/build-android.ps1
ext {
  ndkVersion = "$ndkVersion"
  buildToolsVersion = "$buildTools"
}
subprojects {
  plugins.withId("com.android.library") { android { buildToolsVersion = "$buildTools" } }
  plugins.withId("com.android.application") { android { buildToolsVersion = "$buildTools" } }
}

apply plugin: "expo-root-project"
"@
  $root = $root -replace 'apply plugin: "expo-root-project"', $block.Replace("`r`n", "`n")
}
Write-Text 'android\build.gradle' $root
# Release signing with the private key kept outside the repository
# (%USERPROFILE%\.crw\android-signing.properties). Without it the build falls back to
# Expo's public debug key, which is only fit for local testing.
$signing = Join-Path $env:USERPROFILE '.crw\android-signing.properties'
$appGradle = Read-Text 'android\app\build.gradle'
if ((Test-Path $signing) -and $appGradle -notmatch 'crw-release-signing') {
  $signingPath = $signing -replace '\\', '/'
  $release = @"
        release {
            // crw-release-signing: added by scripts/build-android.ps1
            def crwSigning = new Properties()
            file('$signingPath').withInputStream { crwSigning.load(it) }
            storeFile file(crwSigning['storeFile'])
            storePassword crwSigning['storePassword']
            keyAlias crwSigning['keyAlias']
            keyPassword crwSigning['keyPassword']
        }
        debug {
"@
  $appGradle = ([regex]'(?m)^        debug \{').Replace($appGradle, $release.Replace("`r`n", "`n"), 1)
  $appGradle = ([regex]'(?s)(release \{\s*// Caution![^\n]*\n[^\n]*\n\s*)signingConfig signingConfigs\.debug').Replace($appGradle, '$1signingConfig signingConfigs.release', 1)
  if ($appGradle -notmatch 'signingConfig signingConfigs\.release') { throw 'Could not switch release signing' }
  Write-Host 'Release signing: private key'
} elseif (-not (Test-Path $signing)) {
  Write-Warning "No $signing - the APK is signed with the public debug key."
}
Write-Text 'android\app\build.gradle' $appGradle

$props = Read-Text 'android\gradle.properties'
$archs = if ($AllArchs) { 'armeabi-v7a,arm64-v8a,x86,x86_64' } else { 'arm64-v8a' }
$props = $props -replace '(?m)^reactNativeArchitectures=.*$', "reactNativeArchitectures=$archs"
if ($props -notmatch 'org.gradle.jvmargs=-Xmx4') {
  $props = $props -replace '(?m)^org.gradle.jvmargs=.*$', 'org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m'
}
Write-Text 'android\gradle.properties' $props
Write-Text 'android\local.properties' ("sdk.dir=" + ($env:ANDROID_HOME -replace '\\', '\\'))

# --- build ---
Push-Location android
try {
  .\gradlew.bat "assemble$Variant" --console=plain
  if ($LASTEXITCODE) { throw "gradle assemble$Variant failed" }
} finally { Pop-Location }

$variantDir = $Variant.ToLower()
$apk = Get-ChildItem "android\app\build\outputs\apk\$variantDir\*.apk" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
New-Item -ItemType Directory -Force dist-android | Out-Null
$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
$target = "dist-android\crw-plus-$version-$variantDir.apk"
Copy-Item $apk.FullName $target -Force
Write-Host "APK: $(Resolve-Path $target) ($([Math]::Round((Get-Item $target).Length / 1MB, 1)) MB)"
