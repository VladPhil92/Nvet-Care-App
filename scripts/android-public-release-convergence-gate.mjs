import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const fail = (message) => {
  throw new Error(`Android public release contract: ${message}`);
};

const rootGradle = read('mobile/android/build.gradle');
const appGradle = read('mobile/android/app/build.gradle');
const packageJson = JSON.parse(read('mobile/package.json'));
const manifest = read('mobile/android/app/src/main/AndroidManifest.xml');
const workflow = read('.github/workflows/android-public-release.yml');
const gitignore = read('.gitignore');

if (!/compileSdkVersion\s*=\s*36\b/.test(rootGradle)) {
  fail('compileSdkVersion must remain API 36 for the 2026 Google Play release boundary.');
}
if (!/targetSdkVersion\s*=\s*36\b/.test(rootGradle)) {
  fail('targetSdkVersion must remain API 36 for new app/update submissions.');
}
if (!/classpath\("com\.android\.tools\.build:gradle:8\.10\.1"\)/.test(rootGradle)) {
  fail('AGP 8.10.1 is the pinned Android 16 release baseline.');
}
if (!/applicationId\s+"com\.nvetcare"/.test(appGradle)) {
  fail('applicationId must remain com.nvetcare.');
}
if (!/namespace\s+"com\.nvetcare"/.test(appGradle)) {
  fail('Android namespace must remain com.nvetcare.');
}
if (!/def requireReleaseSigning = \(System\.getenv\("NVET_ANDROID_REQUIRE_SIGNING"\)/.test(appGradle)) {
  fail('release signing enforcement switch is missing.');
}
if (!/if \(requireReleaseSigning && !hasReleaseSigning\)/.test(appGradle)) {
  fail('publishable release builds must fail closed when signing credentials are incomplete.');
}
if (!/NVET_API_URL must be an absolute HTTPS non-local URL/.test(appGradle)) {
  fail('release builds must reject local or non-HTTPS API origins.');
}
if (!/android:allowBackup="false"/.test(manifest)) {
  fail('Android manifest must keep application backup disabled for the 1.0 security boundary.');
}

const versionFallback = appGradle.match(/NVET_ANDROID_VERSION_NAME"\) \?: "([^"]+)"/u)?.[1];
if (!versionFallback || versionFallback !== packageJson.version) {
  fail(`mobile package version (${packageJson.version}) must equal Android default versionName (${versionFallback ?? 'missing'}).`);
}

for (const token of [
  'workflow_dispatch:',
  "if: github.ref == 'refs/heads/main'",
  'NVET_ANDROID_REQUIRE_SIGNING: \'true\'',
  'NVET_ANDROID_KEYSTORE_BASE64',
  'NVET_ANDROID_KEYSTORE_PASSWORD',
  'NVET_ANDROID_KEY_ALIAS',
  'NVET_ANDROID_KEY_PASSWORD',
  'GOOGLE_MAPS_ANDROID_API_KEY',
  'bundleRelease',
  'jarsigner -verify -strict',
  'sha256sum',
  'android-release-signed-aab',
]) {
  if (!workflow.includes(token)) fail(`release workflow missing required boundary: ${token}`);
}

if (/playPublisher|com\.github\.triplet\.play|fastlane\s+supply|google-play|play-console/i.test(workflow)) {
  fail('Phase 13A packages and attests the AAB only; direct store publication must remain operator-controlled.');
}

for (const pattern of ['*.jks', '*.keystore']) {
  if (!gitignore.includes(pattern)) fail(`.gitignore must exclude ${pattern}.`);
}

console.log([
  'Android public release contract PASS',
  `version=${packageJson.version}`,
  'applicationId=com.nvetcare',
  'targetSdk=36',
  'release signing=fail-closed when publishing mode is enabled',
  'distribution=manual signed AAB artifact only (no store upload)',
].join('\n'));
