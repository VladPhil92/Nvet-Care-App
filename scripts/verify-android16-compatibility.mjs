import fs from 'node:fs/promises';

const ANDROID_BUILD_PATH = new URL('../mobile/android/build.gradle', import.meta.url);
const MANIFEST_PATH = new URL('../mobile/android/app/src/main/AndroidManifest.xml', import.meta.url);
const STYLES_PATH = new URL('../mobile/android/app/src/main/res/values/styles.xml', import.meta.url);
const APP_PATH = new URL('../mobile/App.tsx', import.meta.url);
const REVIEW_PATH = new URL('../docs/production/ANDROID_16_BEHAVIOR_REVIEW.md', import.meta.url);

async function readText(url) {
  return fs.readFile(url, 'utf8');
}

function requireMatch(text, pattern, label) {
  if (!pattern.test(text)) {
    throw new Error(`Android 16 compatibility contract mismatch: ${label}`);
  }
}

function forbidMatch(text, pattern, label) {
  if (pattern.test(text)) {
    throw new Error(`Android 16 compatibility contract violation: ${label}`);
  }
}

const [androidBuild, manifest, styles, app, review] = await Promise.all([
  readText(ANDROID_BUILD_PATH),
  readText(MANIFEST_PATH),
  readText(STYLES_PATH),
  readText(APP_PATH),
  readText(REVIEW_PATH),
]);

requireMatch(androidBuild, /compileSdkVersion\s*=\s*36\b/, 'compileSdkVersion must remain 36');
requireMatch(androidBuild, /targetSdkVersion\s*=\s*36\b/, 'targetSdkVersion must remain 36');

const edgeToEdgeOptOut = /windowOptOutEdgeToEdgeEnforcement/;
forbidMatch(manifest, edgeToEdgeOptOut, 'edge-to-edge opt-out is not valid for Android 16 target 36');
forbidMatch(styles, edgeToEdgeOptOut, 'styles must not attempt to opt out of edge-to-edge');
requireMatch(app, /SafeAreaProvider/, 'root SafeAreaProvider is required for edge-to-edge-safe layout handling');

requireMatch(
  manifest,
  /android:enableOnBackInvokedCallback\s*=\s*["']false["']/,
  'predictive-back stabilization decision must remain explicit',
);
requireMatch(
  manifest,
  /android:name\s*=\s*["']android\.window\.PROPERTY_COMPAT_ALLOW_RESTRICTED_RESIZABILITY["'][\s\S]*?android:value\s*=\s*["']true["']/,
  'phone-first large-screen compatibility property must remain explicit',
);
requireMatch(manifest, /android:screenOrientation\s*=\s*["']portrait["']/, 'phone-first portrait contract changed without review');

requireMatch(manifest, /<action\s+android:name=["']android\.intent\.action\.VIEW["']\s*\/>/, 'deep-link VIEW action');
requireMatch(manifest, /<category\s+android:name=["']android\.intent\.category\.BROWSABLE["']\s*\/>/, 'deep-link BROWSABLE category');
requireMatch(manifest, /<data\s+android:scheme=["']nvetcare["']\s*\/>/, 'deep-link scheme must remain constrained to nvetcare');

for (const section of [
  'Edge-to-edge enforcement',
  'Predictive back',
  'Large-screen orientation/resizability',
  'Safer intent resolution',
  'What remains external',
]) {
  requireMatch(review, new RegExp(section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `review section missing: ${section}`);
}

console.log('Android 16 compatibility contract valid: targetApi=36, stabilization decisions explicit.');
