import fs from 'node:fs/promises';

const SERVICE_PATH = new URL(
  '../backend/src/beta/beta-readiness.service.ts',
  import.meta.url,
);
const MANIFEST_PATH = new URL(
  '../docs/production/BETA_CARTAGENA_READINESS.json',
  import.meta.url,
);
const RUNBOOK_PATH = new URL(
  '../docs/production/CARTAGENA_BETA_OPERATIONS_RUNBOOK.md',
  import.meta.url,
);

const EXPECTED_STATES = [
  'blocked',
  'ready-to-enable',
  'active',
  'paused',
  'misconfigured',
];

const MUST_REMAIN_PENDING = [
  'rcPromoted',
  'productionBackupConfigured',
  'restoreDrillVerified',
  'paymentRailVerified',
  'cartagenaVetCoverageVerified',
  'clientCohortConfigured',
  'supportOwnerConfirmed',
  'privacyAndTermsReviewed',
  'rollbackDrillVerified',
];

function fail(message) {
  throw new Error(message);
}

function requireText(source, token, label) {
  if (!source.includes(token)) {
    fail(`${label} is missing required token: ${token}`);
  }
}

const [service, manifestRaw, runbook] = await Promise.all([
  fs.readFile(SERVICE_PATH, 'utf8'),
  fs.readFile(MANIFEST_PATH, 'utf8'),
  fs.readFile(RUNBOOK_PATH, 'utf8'),
]);

const manifest = JSON.parse(manifestRaw);
const policyStates = manifest.policy?.activationStates;
if (!Array.isArray(policyStates)) {
  fail('Beta readiness policy must define activationStates.');
}
if (
  policyStates.length !== EXPECTED_STATES.length ||
  policyStates.some((state, index) => state !== EXPECTED_STATES[index])
) {
  fail(`activationStates must be exactly: ${EXPECTED_STATES.join(', ')}`);
}
if (manifest.policy?.activationDecisionEndpoint !== 'GET /api/beta/readiness') {
  fail('Unexpected beta activation decision endpoint.');
}
if (manifest.policy?.machineActivationIncludesSupportReadiness !== true) {
  fail('Support readiness must participate in machine activation readiness.');
}
if (manifest.policy?.machineReadinessNeverAuthorizesCommercialLaunch !== true) {
  fail('Machine readiness must never authorize commercial launch.');
}

for (const key of MUST_REMAIN_PENDING) {
  if (manifest.requiredEvidence?.[key]?.status !== 'pending') {
    fail(`${key} must remain pending until external/operator evidence exists.`);
  }
}
if (manifest.requiredEvidence?.productionAlertingVerified?.status !== 'verified') {
  fail('Existing verified production alerting evidence must remain inherited.');
}

for (const state of EXPECTED_STATES) {
  requireText(service, `"${state}"`, 'BetaReadinessService');
  requireText(runbook, `\`${state}\``, 'Operations runbook');
}

for (const blocker of [
  'CLIENT_COHORT_NOT_CONFIGURED',
  'CLIENT_COHORT_LIMIT_EXCEEDED',
  'CARTAGENA_VET_COVERAGE_INSUFFICIENT',
  'SUPPORT_OWNER_NOT_CONFIGURED',
  'SUPPORT_CHANNEL_NOT_CONFIGURED',
]) {
  requireText(service, `"${blocker}"`, 'BetaReadinessService');
}

requireText(service, 'machineActivationReady', 'BetaReadinessService');
requireText(service, 'blockingReasons', 'BetaReadinessService');
requireText(service, 'externalEvidenceRequired: true', 'BetaReadinessService');
requireText(service, 'commercialLaunchAuthorized: false', 'BetaReadinessService');
requireText(
  service,
  'machineReadinessIsNotLaunchApproval: true',
  'BetaReadinessService',
);
requireText(runbook, 'NO LANZADA', 'Operations runbook');
requireText(runbook, 'ready-to-enable', 'Operations runbook');
requireText(runbook, 'misconfigured', 'Operations runbook');

if (service.includes('NVET_CLOSED_BETA_CLIENT_HASHES')) {
  fail('Readiness response implementation must not depend on or expose raw cohort hash material.');
}

console.log('Beta Operational Activation Readiness contract verified.');
console.log(`Activation states: ${EXPECTED_STATES.join(', ')}`);
console.log('External/operator evidence remains fail-closed.');
