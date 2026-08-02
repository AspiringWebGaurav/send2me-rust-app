const fs = require('fs');
const path = require('path');

console.log('--- Applying Android 10+ (Galaxy S9+) Patches ---');

// 1. Patch AndroidManifest.xml
const manifestPath = path.resolve(__dirname, '../src-tauri/gen/android/app/src/main/AndroidManifest.xml');
if (fs.existsSync(manifestPath)) {
  let xml = fs.readFileSync(manifestPath, 'utf8');
  
  const permissions = [
    '    <uses-permission android:name="android.permission.INTERNET" />',
    '    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />',
    '    <uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />',
    '    <uses-permission android:name="android.permission.CHANGE_WIFI_MULTICAST_STATE" />',
    '    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />',
    '    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="29" />',
    '    <uses-permission android:name="android.permission.MANAGE_EXTERNAL_STORAGE" />'
  ].join('\n');

  if (!xml.includes('CHANGE_WIFI_MULTICAST_STATE')) {
    xml = xml.replace('<application', permissions + '\n    <application');
  }

  if (!xml.includes('requestLegacyExternalStorage')) {
    xml = xml.replace('<application', '<application android:requestLegacyExternalStorage="true" android:usesCleartextTraffic="true"');
  }

  fs.writeFileSync(manifestPath, xml, 'utf8');
  console.log('✓ Successfully patched AndroidManifest.xml for Android 10 (Scoped Storage + Cleartext + Multicast).');
} else {
  console.warn('ℹ AndroidManifest.xml not present yet at:', manifestPath);
}

// 2. Patch build.gradle.kts (minSdk = 24 for Android 7.0+)
const gradlePath = path.resolve(__dirname, '../src-tauri/gen/android/app/build.gradle.kts');
if (fs.existsSync(gradlePath)) {
  let gradle = fs.readFileSync(gradlePath, 'utf8');
  gradle = gradle.replace(/minSdk\s*=\s*[0-9]+/g, 'minSdk = 24');
  fs.writeFileSync(gradlePath, gradle, 'utf8');
  console.log('✓ Set minSdk = 24 in build.gradle.kts.');
} else {
  console.warn('ℹ build.gradle.kts not present yet at:', gradlePath);
}
