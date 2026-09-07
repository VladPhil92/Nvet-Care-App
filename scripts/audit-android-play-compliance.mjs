import crypto from 'node:crypto';
import fs from 'node:fs/promises';

const COMPLIANCE_PATH = new URL('../docs/production/ANDROID_PLAY_COMPLIANCE.json', import.meta.url);
const DATA_SAFETY_PATH = new URL('../docs/production/GOOGLE_PLAY_DATA_SAFETY.md', import.meta.url);
const PRIVACY_PATH = new URL('../docs/production/NVET_PRIVACY_POLICY_SOURCE.md', import.meta.url);
const REVIEWER_PATH = new URL('../docs/production/ANDROID_PLAY_REVIEWER_ACCESS.md', import.meta.url);
const ANDROID_MANIFEST_PATH = new URL('../mobile/android/app/src/main/AndroidManifest.xml', import.meta.url);
const MOBILE_PACKAGE_PATH = new URL('../mobile/package.json', import.meta.url);
const AUTH_SERVICE_PATH = new URL('../mobile/src/services/auth.service.ts', import.meta.url);
const PET_SERVICE_PATH = new URL('../mobile/src/services/pet.service.ts', import.meta.url);
const APPOINTMENT_SERVICE_PATH = new URL('../mobile/src/services/appointment.service.ts', import.meta.url);
const LOCATION_SERVICE_PATH = new URL('../mobile/src/services/live-location.service.ts', import.meta.url);
const CHAT_SERVICE_PATH = new URL('../mobile/src/services/chat.service.ts', import.meta.url);
const PAYMENT_SERVICE_PATH = new URL('../mobile/src/services/payment.service.ts', import.meta.url);
const AI_SERVICE_PATH = new URL('../mobile/src/services/ai.service.ts', import.meta.url);
const NOTIFICATION_SERVICE_PATH = new URL('../mobile/src/services/notification.service.ts', import.meta.url);
const DELETE_ACCOUNT_SCREEN_PATH = new URL('../mobile/src/screens/shared/DeleteAccountScreen.tsx', import.meta.url);
const ACCOUNT_LIFECYCLE_CONTROLLER_PATH = new URL('../backend/src/auth/account-lifecycle.controller.ts', import.meta.url);
const ACCOUNT_LIFECYCLE_SERVICE_PATH = new URL('../backend/src/auth/account-lifecycle.service.ts', import.meta.url);
const DELETE_ACCOUNT_DTO_PATH = new URL('../backend/src/auth/dto/delete-account.dto.ts', import.meta.url);

const args = new Set(process.argv.slice(2));
const writeEvidence = args.has('--write-evidence');

function fail(message) {
  throw new Error(`Android Play compliance contract mismatch: ${message}`);
}

async function read(url) {
  return fs.readFile(url, 'utf8');
}

function requireMatch(text, pattern, label) {
  if (!pattern.test(text)) fail(label);
}

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function sortedUnique(values) {
  return [...new Set(values)].sort();
}

function assertSameSet(actual, expected, label) {
  const a = sortedUnique(actual);
  const e = sortedUnique(expected);
  if (a.length !== e.length || a.some((value, index) => value !== e[index])) {
    fail(`${label}; expected=${JSON.stringify(e)} actual=${JSON.stringify(a)}`);
  }
}

const [
  complianceRaw,
  dataSafety,
  privacy,
  reviewer,
  androidManifest,
  mobilePackageRaw,
  authService,
  petService,
  appointmentService,
  locationService,
  chatService,
  paymentService,
  aiService,
  notificationService,
  deleteAccountScreen,
  accountLifecycleController,
  accountLifecycleService,
  deleteAccountDto,
] = await Promise.all([
  read(COMPLIANCE_PATH),
  read(DATA_SAFETY_PATH),
  read(PRIVACY_PATH),
  read(REVIEWER_PATH),
  read(ANDROID_MANIFEST_PATH),
  read(MOBILE_PACKAGE_PATH),
  read(AUTH_SERVICE_PATH),
  read(PET_SERVICE_PATH),
  read(APPOINTMENT_SERVICE_PATH),
  read(LOCATION_SERVICE_PATH),
  read(CHAT_SERVICE_PATH),
  read(PAYMENT_SERVICE_PATH),
  read(AI_SERVICE_PATH),
  read(NOTIFICATION_SERVICE_PATH),
  read(DELETE_ACCOUNT_SCREEN_PATH),
  read(ACCOUNT_LIFECYCLE_CONTROLLER_PATH),
  read(ACCOUNT_LIFECYCLE_SERVICE_PATH),
  read(DELETE_ACCOUNT_DTO_PATH),
]);

const compliance = JSON.parse(complianceRaw);
const mobilePackage = JSON.parse(mobilePackageRaw);

if (compliance.schemaVersion !== 1) fail('schemaVersion must be 1');
if (compliance.phase !== '13D') fail('phase must be 13D');
if (compliance.program !== 'google-play-compliance') fail('unexpected compliance program');
if (compliance.applicationId !== 'com.nvetcare') fail('applicationId must remain com.nvetcare');
if (compliance.scope !== 'android-mobile-client') fail('scope must remain android-mobile-client');

const actualPermissions = [...androidManifest.matchAll(/<uses-permission\s+android:name="([^"]+)"\s*\/>/g)].map(
  (match) => match[1],
);
assertSameSet(actualPermissions, compliance.permissions?.declared ?? [], 'Android permission inventory drifted');

const permittedBaseline = [
  'android.permission.INTERNET',
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.ACCESS_FINE_LOCATION',
];
assertSameSet(actualPermissions, permittedBaseline, 'Phase 13D permission baseline changed');

for (const deniedPermission of [
  'android.permission.ACCESS_BACKGROUND_LOCATION',
  'android.permission.CAMERA',
  'android.permission.RECORD_AUDIO',
  'android.permission.READ_CONTACTS',
  'android.permission.WRITE_CONTACTS',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
  'android.permission.MANAGE_EXTERNAL_STORAGE',
  'android.permission.READ_MEDIA_IMAGES',
  'android.permission.READ_MEDIA_VIDEO',
  'android.permission.POST_NOTIFICATIONS',
]) {
  if (actualPermissions.includes(deniedPermission)) {
    fail(`sensitive permission ${deniedPermission} requires an explicit Phase 13D compliance update`);
  }
}

const dependencies = mobilePackage.dependencies ?? {};
for (const dependency of [
  '@react-native-async-storage/async-storage',
  '@react-native-community/geolocation',
  'axios',
  'react-native-image-picker',
  'react-native-maps',
  'socket.io-client',
]) {
  if (!dependencies[dependency]) fail(`expected mobile dependency missing: ${dependency}`);
}

const dependencyNames = Object.keys(dependencies).join('\n');
const advertisingOrAnalyticsSdk = /(?:admob|google-mobile-ads|facebook.*ads|appsflyer|mixpanel|amplitude|segment|firebase[/-]analytics|@react-native-firebase\/analytics)/i.test(
  dependencyNames,
);
if (advertisingOrAnalyticsSdk && compliance.sdkInventory?.advertisingSdkObserved === false && compliance.sdkInventory?.mobileAnalyticsSdkObserved === false) {
  fail('an advertising/analytics SDK is present but the compliance inventory still declares none observed');
}

requireMatch(authService, /email:\s*string/, 'auth inventory must account for email');
requireMatch(authService, /firstName:\s*string/, 'auth inventory must account for first name');
requireMatch(authService, /lastName:\s*string/, 'auth inventory must account for last name');
requireMatch(authService, /phone\?:\s*string/, 'auth inventory must account for optional phone');
requireMatch(authService, /licenseNumber\?:\s*string/, 'vet professional data must remain inventoried');
requireMatch(petService, /weight\?:\s*number/, 'pet records inventory must account for weight');
requireMatch(petService, /photo\?:\s*string/, 'pet records inventory must account for photo');
requireMatch(appointmentService, /diagnosis\?:\s*string/, 'appointment inventory must account for diagnosis');
requireMatch(appointmentService, /treatment\?:\s*string/, 'appointment inventory must account for treatment');
requireMatch(appointmentService, /clinicalNotes\?:\s*string/, 'appointment inventory must account for clinical notes');
requireMatch(locationService, /ACCESS_FINE_LOCATION/, 'location service must remain tied to explicit runtime permission');
requireMatch(locationService, /veterinarios cercanos/i, 'location purpose must disclose nearby veterinarian discovery');
requireMatch(locationService, /tracking durante citas activas/i, 'location purpose must disclose active-appointment tracking');
requireMatch(chatService, /content:\s*string/, 'chat content must remain inventoried');
requireMatch(paymentService, /transferProof\?:\s*string/, 'payment inventory must account for transfer proof');
requireMatch(paymentService, /documentId:\s*string/, 'payment inventory must account for withdrawal document ID');
requireMatch(paymentService, /accountNumber\?:\s*string/, 'payment inventory must account for withdrawal account number');
requireMatch(aiService, /question:\s*string/, 'AI inventory must account for user prompts');
requireMatch(aiService, /providerStorageRequested:\s*boolean/, 'AI provider-storage state must remain visible to the client contract');
requireMatch(notificationService, /readAt\?:\s*string/, 'notification activity must remain inventoried');

const inventoryIds = new Set((compliance.dataInventory ?? []).map((entry) => entry.id));
for (const requiredId of [
  'account-profile',
  'security-session',
  'vet-professional-profile',
  'pet-records',
  'appointment-clinical',
  'precise-location',
  'chat-content',
  'payments',
  'ai-inputs',
  'notification-inbox',
]) {
  if (!inventoryIds.has(requiredId)) fail(`dataInventory is missing ${requiredId}`);
}

// Phase 13D requires the complete self-service account-deletion chain, not a
// documentation-only flag. Any missing edge returns the contract to fail-closed.
requireMatch(authService, /async\s+deleteAccount\s*\(/, 'mobile auth service must expose deleteAccount');
requireMatch(authService, /['"]\/auth\/account['"]/, 'mobile deletion must call the canonical backend endpoint');
requireMatch(deleteAccountScreen, /ELIMINAR MI CUENTA/, 'mobile deletion UI must require the explicit confirmation phrase');
requireMatch(deleteAccountScreen, /getAccountDeletionReadiness|useAccountDeletionReadinessQuery/, 'mobile deletion UI must fetch server-side blockers');
requireMatch(accountLifecycleController, /@Delete\(["']auth\/account["']\)/, 'backend must expose authenticated DELETE /auth/account');
requireMatch(accountLifecycleController, /@Get\(["']privacy\/account-deletion["']\)/, 'backend must expose a public deletion-information route');
requireMatch(accountLifecycleService, /self_service_account_deletion/, 'backend deletion must produce an auditable lifecycle event');
requireMatch(accountLifecycleService, /isActive:\s*false/, 'account deletion must deactivate the authentication anchor');
requireMatch(accountLifecycleService, /passwordHash:\s*null/, 'account deletion must erase the local credential hash');
requireMatch(accountLifecycleService, /ctgUserId:\s*null/, 'account deletion must unlink the federated identity');
requireMatch(accountLifecycleService, /userSession\.deleteMany/, 'account deletion must revoke and erase sessions');
requireMatch(accountLifecycleService, /ACCOUNT_DELETION_BLOCKED/, 'account deletion must fail closed on operational or financial blockers');
requireMatch(deleteAccountDto, /@Equals\(["']ELIMINAR MI CUENTA["']/, 'backend DTO must enforce the exact destructive confirmation phrase');

const deletionStatus = compliance.accountLifecycle?.accountDeletion?.status;
if (deletionStatus !== 'implemented') {
  fail('Phase 13D repository implementation is present; account deletion status must be implemented');
}
if (compliance.accountLifecycle?.accountDeletion?.requiredBeforePublicProduction !== true) {
  fail('account deletion must remain a public-production gate while account creation is available');
}
if (compliance.accountLifecycle?.accountDeletion?.publicRoute !== '/api/privacy/account-deletion') {
  fail('public deletion route contract must remain /api/privacy/account-deletion');
}

requireMatch(dataSafety, /Play Console declaration remains external evidence.*pending/is, 'Data Safety document must remain explicit that console evidence is pending');
requireMatch(dataSafety, /Account deletion lifecycle/i, 'Data Safety document must document the Phase 13D account deletion lifecycle');
requireMatch(dataSafety, /pseudonimiz/i, 'Data Safety document must disclose pseudonymized retention');
requireMatch(privacy, /Publication status:\*\* `PENDING`/i, 'privacy source must not be represented as already published');
requireMatch(privacy, /eliminación de cuenta de autoservicio está implementada/i, 'privacy source must truthfully describe the implemented deletion mechanism');
requireMatch(privacy, /registros clínicos, financieros, profesionales o de auditoría/i, 'privacy source must disclose retained record categories');
requireMatch(reviewer, /actual reviewer credentials remain external/i, 'reviewer runbook must keep credentials external');
requireMatch(reviewer, /Never use ADMIN, SUPERADMIN/i, 'reviewer runbook must prohibit privileged reviewer identities');

for (const [label, text] of [
  ['privacy source', privacy],
  ['reviewer runbook', reviewer],
  ['Data Safety matrix', dataSafety],
]) {
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)) fail(`${label} contains private-key material`);
  if (/ANDROID_KEYSTORE_PASSWORD\s*=\s*[^<\s]/.test(text)) fail(`${label} appears to contain an Android keystore password`);
  if (/recoveryCode\s*[:=]\s*[A-Za-z0-9-]{8,}/i.test(text)) fail(`${label} appears to contain a recovery code`);
}

if (compliance.releasePolicy?.automaticProductionPromotion !== false) {
  fail('automaticProductionPromotion must remain false');
}
if (compliance.releasePolicy?.internalTrackAutomationMaximumStatus !== 'draft') {
  fail('Internal Testing automation maximum status must remain draft');
}

const externalBlockers = Object.entries(compliance.externalEvidence ?? {})
  .filter(([, value]) => value !== 'verified')
  .map(([key]) => key)
  .sort();

const evidence = {
  schemaVersion: 1,
  program: 'android-play-compliance',
  phase: '13D',
  applicationId: compliance.applicationId,
  contractStatus: 'verified',
  permissionInventory: sortedUnique(actualPermissions),
  advertisingOrAnalyticsSdkObserved: advertisingOrAnalyticsSdk,
  accountDeletionStatus: deletionStatus,
  externalBlockers,
  hashes: {
    complianceManifestSha256: sha256(complianceRaw),
    androidManifestSha256: sha256(androidManifest),
    mobilePackageSha256: sha256(mobilePackageRaw),
    dataSafetySourceSha256: sha256(dataSafety),
    privacyPolicySourceSha256: sha256(privacy),
    reviewerRunbookSha256: sha256(reviewer),
    accountLifecycleControllerSha256: sha256(accountLifecycleController),
    accountLifecycleServiceSha256: sha256(accountLifecycleService),
    deleteAccountScreenSha256: sha256(deleteAccountScreen),
  },
  generatedAt: new Date().toISOString(),
};

console.log('PASS | Android Play compliance contract | Phase 13D repository inventory is internally consistent');
console.log(`PASS | Permissions | ${evidence.permissionInventory.join(', ')}`);
console.log(`PASS | SDK boundary | advertising/analytics observed=${advertisingOrAnalyticsSdk}`);
console.log(`PASS | Account deletion lifecycle | status=${deletionStatus}`);
console.log(`INFO | External evidence still required | ${externalBlockers.join(', ') || 'none'}`);

if (writeEvidence) {
  const outDir = new URL('../.artifacts/', import.meta.url);
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(new URL('android-play-compliance.json', outDir), `${JSON.stringify(evidence, null, 2)}\n`);
  console.log('PASS | Evidence | .artifacts/android-play-compliance.json');
}
