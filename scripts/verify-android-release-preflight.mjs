import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PREFLIGHT_PATH = path.join(ROOT, 'docs/production/ANDROID_RELEASE_PREFLIGHT.json');
const ANDROID_READINESS_PATH = path.join(ROOT, 'docs/production/ANDROID_PRODUCTION_READINESS.json');
const COMPLIANCE_PATH = path.join(ROOT, 'docs/production/ANDROID_PLAY_COMPLIANCE.json');
const PRIVACY_PATH = path.join(ROOT, 'docs/production/NVET_PRIVACY_POLICY_SOURCE.md');
const DATA_SAFETY_PATH = path.join(ROOT, 'docs/production/GOOGLE_PLAY_DATA_SAFETY.md');
const REVIEWER_PATH = path.join(ROOT, 'docs/production/ANDROID_PLAY_REVIEWER_ACCESS.md');
const INTERNAL_RUNBOOK_PATH = path.join(ROOT, 'docs/production/ANDROID_PLAY_INTERNAL_RUNBOOK.md');
const ANDROID_BUILD_PATH = path.join(ROOT, 'mobile/android/build.gradle');
const APP_BUILD_PATH = path.join(ROOT, 'mobile/android/app/build.gradle');
const MANIFEST_PATH = path.join(ROOT, 'mobile/android/app/src/main/AndroidManifest.xml');
const RELEASE_WORKFLOW_PATH = path.join(ROOT, '.github/workflows/release-android.yml');
const OUTPUT_PATH = path.join(ROOT, '.artifacts/android-release-preflight.json');

const args = new Set(process.argv.slice(2));
const writeEvidence = args.has('--write-evidence');

function fail(message) {
  throw new Error(`Android release preflight mismatch: ${message}`);
}

async function readText(file) {
  return fs.readFile(file, 'utf8');
}

async function readJson(file) {
  return JSON.parse(await readText(file));
}

function requireMatch(text, pattern, label) {
  if (!pattern.test(text)) fail(label);
}

function requireNoMatch(text, pattern, label) {
  if (pattern.test(text)) fail(label);
}

function assertExactSet(actual, expected, label) {
  const a = [...actual].sort();
  const e = [...expected].sort();
  if (a.length !== e.length || a.some((value, index) => value !== e[index])) {
    fail(`${label}; expected ${e.join(', ')}, got ${a.join(', ')}`);
  }
}

async function main() {
  const [
    preflight,
    androidReadiness,
    compliance,
    privacy,
    dataSafety,
    reviewer,
    internalRunbook,
    androidBuild,
    appBuild,
    androidManifest,
    releaseWorkflow,
  ] = await Promise.all([
    readJson(PREFLIGHT_PATH),
    readJson(ANDROID_READINESS_PATH),
    readJson(COMPLIANCE_PATH),
    readText(PRIVACY_PATH),
    readText(DATA_SAFETY_PATH),
    readText(REVIEWER_PATH),
    readText(INTERNAL_RUNBOOK_PATH),
    readText(ANDROID_BUILD_PATH),
    readText(APP_BUILD_PATH),
    readText(MANIFEST_PATH),
    readText(RELEASE_WORKFLOW_PATH),
  ]);

  if (preflight.schemaVersion !== 1 || preflight.phase !== '13E') fail('preflight schema/phase must remain 13E v1');
  if (preflight.program !== 'android-google-play-release-preflight') fail('unexpected preflight program');
  if (preflight.applicationId !== 'com.nvetcare') fail('applicationId must remain com.nvetcare');
  if (preflight.targetSdk !== 36 || preflight.compileSdk !== 36) fail('compile/target SDK must remain API 36');
  if (preflight.releaseArtifact !== 'aab') fail('release artifact must remain AAB');
  if (preflight.releaseWorkflow !== '.github/workflows/release-android.yml') fail('release workflow path drifted');

  const technicalEntries = Object.entries(preflight.technicalGates ?? {});
  if (technicalEntries.length < 10 || technicalEntries.some(([, status]) => status !== 'verified')) {
    fail('all repository-only technical preflight gates must remain verified');
  }

  if (!Array.isArray(preflight.operatorHandoff) || preflight.operatorHandoff.length < 8) {
    fail('operator handoff must enumerate the external release boundary');
  }
  for (const gate of preflight.operatorHandoff) {
    if (gate.status !== 'operator-required') fail(`external handoff gate ${gate.id} must remain classified as operator-required`);
    if (!gate.id || !gate.owner || !gate.reason) fail('operator handoff entries require id, owner and reason');
  }
  if (preflight.policy?.externalEvidenceNeverAutoVerified !== true) fail('external evidence must never auto-verify');
  if (preflight.policy?.secretsNeverCommitted !== true) fail('secrets-never-committed policy must remain enabled');
  if (preflight.policy?.playAutomationMaximumStatus !== 'draft') fail('Play automation must stop at draft');
  if (preflight.policy?.productionPromotionManual !== true) fail('production promotion must remain manual');

  if (androidReadiness.applicationId !== 'com.nvetcare' || androidReadiness.requiredTargetApi !== 36) {
    fail('Android production readiness identity/API drift');
  }
  const externalEvidenceKeys = [
    'playConsoleAppCreated',
    'playAppSigningEnabled',
    'uploadCertificatePinned',
    'privacyPolicyPublished',
    'dataSafetyReviewed',
    'playReviewerAccessConfigured',
    'signedAabVerified',
    'internalTrackUploaded',
    'physicalDeviceSmokeVerified',
  ];
  for (const key of externalEvidenceKeys) {
    const entry = androidReadiness.requiredEvidence?.[key];
    if (!entry || !['pending', 'verified'].includes(entry.status)) {
      fail(`${key} must use a supported external evidence state`);
    }
    if (entry.status === 'verified' && (typeof entry.evidence !== 'string' || entry.evidence.trim().length < 3)) {
      fail(`${key} verified state requires concrete external evidence`);
    }
  }
  for (const key of ['playComplianceContractVerified', 'accountDeletionAvailable', 'android16BehaviorReviewCompleted']) {
    if (androidReadiness.requiredEvidence?.[key]?.status !== 'verified') fail(`${key} repository contract must remain verified`);
  }

  if (compliance.applicationId !== 'com.nvetcare') fail('Play compliance package identity drift');
  assertExactSet(
    compliance.permissions?.declared ?? [],
    [
      'android.permission.INTERNET',
      'android.permission.ACCESS_COARSE_LOCATION',
      'android.permission.ACCESS_FINE_LOCATION',
    ],
    'Play compliance declared permission set drifted',
  );
  if (compliance.permissions?.backgroundLocation !== false) fail('background location must remain disabled');
  if (compliance.sdkInventory?.advertisingSdkObserved !== false) fail('unexpected advertising SDK in preflight inventory');
  if (compliance.sdkInventory?.mobileAnalyticsSdkObserved !== false) fail('unexpected mobile analytics SDK in preflight inventory');
  if (compliance.accountLifecycle?.accountDeletion?.status !== 'implemented') fail('self-service account deletion must remain implemented');
  if (compliance.releasePolicy?.automaticProductionPromotion !== false) fail('automatic Play production promotion must remain disabled');
  if (compliance.releasePolicy?.internalTrackAutomationMaximumStatus !== 'draft') fail('automated Play upload must remain draft-only');

  requireMatch(androidBuild, /compileSdkVersion\s*=\s*36\b/, 'compileSdkVersion must remain 36');
  requireMatch(androidBuild, /targetSdkVersion\s*=\s*36\b/, 'targetSdkVersion must remain 36');
  requireMatch(appBuild, /namespace\s+["']com\.nvetcare["']/, 'namespace must remain com.nvetcare');
  requireMatch(appBuild, /applicationId\s+["']com\.nvetcare["']/, 'applicationId must remain com.nvetcare');
  requireMatch(appBuild, /NVET_ANDROID_REQUIRE_SIGNING/, 'release signing enforcement switch missing');
  requireMatch(appBuild, /requireReleaseSigning\s*&&\s*!hasReleaseSigning/, 'release signing must fail closed');
  requireMatch(appBuild, /GOOGLE_MAPS_ANDROID_API_KEY/, 'Maps release key boundary missing');
  requireMatch(appBuild, /NVET_API_URL must be an absolute HTTPS non-local URL/, 'release API URL guard missing');

  const manifestPermissions = [...androidManifest.matchAll(/<uses-permission\s+android:name="([^"]+)"\s*\/>/g)].map((match) => match[1]);
  assertExactSet(
    manifestPermissions,
    [
      'android.permission.INTERNET',
      'android.permission.ACCESS_COARSE_LOCATION',
      'android.permission.ACCESS_FINE_LOCATION',
    ],
    'Android manifest permission set drifted',
  );
  requireNoMatch(androidManifest, /ACCESS_BACKGROUND_LOCATION/, 'background location permission must not be declared');
  requireMatch(androidManifest, /android:allowBackup="false"/, 'Android backups must remain disabled for the app sandbox');
  requireMatch(androidManifest, /android:networkSecurityConfig="@xml\/network_security_config"/, 'network security config must remain explicit');
  requireMatch(androidManifest, /com\.google\.android\.geo\.API_KEY/, 'Maps API key manifest placeholder missing');

  for (const [label, pattern] of [
    ['immutable release ref input', /release_ref:/],
    ['tag checkout', /ref:\s*\$\{\{\s*github\.event\.inputs\.release_ref\s*\}\}/],
    ['production environment', /environment:\s*production/],
    ['release signing required', /NVET_ANDROID_REQUIRE_SIGNING:\s*['"]true['"]/],
    ['keystore secret', /ANDROID_KEYSTORE_BASE64/],
    ['upload certificate pin', /ANDROID_UPLOAD_CERT_SHA256/],
    ['Maps secret', /GOOGLE_MAPS_ANDROID_API_KEY/],
    ['Play service account secret', /GOOGLE_PLAY_SERVICE_ACCOUNT_JSON/],
    ['signed AAB build', /bundleRelease/],
    ['signature verification', /jarsigner -verify/],
    ['AAB checksum', /app-release\.aab\.sha256/],
    ['release metadata', /release-metadata\.json/],
    ['internal track', /track:\s*internal/],
    ['draft-only Play upload', /status:\s*draft/],
  ]) {
    requireMatch(releaseWorkflow, pattern, label);
  }
  requireNoMatch(releaseWorkflow, /^\s*track:\s*production\s*$/m, 'release automation must not target Play production');
  requireNoMatch(releaseWorkflow, /^\s*status:\s*(?:completed|inProgress|halted)\s*$/m, 'automated Play upload must not auto-promote beyond draft');

  requireMatch(privacy, /Publication status:\*\* `PENDING`/i, 'privacy source must remain explicitly unpublished');
  requireMatch(privacy, /legal controller\/operator identity/i, 'privacy source must require final legal controller identity');
  requireMatch(privacy, /monitored privacy-contact channel/i, 'privacy source must require monitored privacy contact');
  requireMatch(dataSafety, /Play Console declaration remains external evidence.*pending/is, 'Data Safety declaration must remain external and pending');
  requireMatch(dataSafety, /active production processors/i, 'Data Safety must require production processor reconciliation');
  requireMatch(reviewer, /actual reviewer credentials remain external/i, 'reviewer credentials must remain external');
  requireMatch(reviewer, /One CLIENT reviewer account/i, 'CLIENT reviewer path missing');
  requireMatch(reviewer, /One VET reviewer account/i, 'VET reviewer path missing');
  requireMatch(internalRunbook, /Application ID \/ package: `com\.nvetcare`/, 'internal testing runbook package identity drift');
  requireMatch(internalRunbook, /status `draft`/i, 'internal testing runbook must preserve draft-only automation');

  const report = {
    schemaVersion: 1,
    program: preflight.program,
    applicationId: preflight.applicationId,
    targetSdk: preflight.targetSdk,
    technicalPreflight: 'READY',
    externalReleaseEvidence: 'OPERATOR_REQUIRED',
    checkedAt: new Date().toISOString(),
    technicalGates: preflight.technicalGates,
    operatorHandoff: preflight.operatorHandoff,
    policy: preflight.policy,
  };

  if (writeEvidence) {
    await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
    await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  }

  console.log('Android/Google Play release preflight: READY');
  console.log(`Package: ${report.applicationId}`);
  console.log(`Target SDK: ${report.targetSdk}`);
  console.log(`Technical gates: ${Object.keys(report.technicalGates).length}/${Object.keys(report.technicalGates).length} verified`);
  console.log(`External/operator handoff: ${report.operatorHandoff.length} item(s) classified as operator-required`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
