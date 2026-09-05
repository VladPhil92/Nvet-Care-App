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
  'awaiting-authorization',
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
if (manifest.policy?.activationAuthorizationEndpoint !== 'POST /api/beta/activation/authorize') {
  fail('Unexpected beta activation authorization endpoint.');
}
if (manifest.policy?.activationRevocationEndpoint !== 'POST /api/beta/activation/revoke') {
  fail('Unexpected beta activation revocation endpoint.');
}
if (manifest.policy?.machineActivationIncludesSupportReadiness !== true) {
  fail('Support readiness must participate in machine activation readiness.');
}
if (manifest.policy?.machineReadinessNeverAuthorizesCommercialLaunch !== true) {
  fail('Machine readiness must never authorize commercial launch.');
}
if (manifest.policy?.bookingRequiresActiveAuthorization !== true) {
  fail('Booking must require a live activation authorization.');
}
if (manifest.policy?.productionEvidenceRequiredForActivation !== true) {
  fail('Production-scoped evidence must be required for activation.');
}

if (manifest.policy?.supportLedger !== 'audit_logs') {
  fail('Support readiness must use the audit_logs ledger.');
}
if (manifest.policy?.supportLedgerAppendOnly !== true) {
  fail('Support readiness ledger must remain append-only.');
}
if (manifest.policy?.supportConfigurationSource !== 'admin-control-plane') {
  fail('Support configuration source must be the admin control plane.');
}
if (manifest.policy?.legacyEnvSupportConfigurationAccepted !== false) {
  fail('Legacy support environment configuration must remain disabled.');
}
if (manifest.policy?.supportLeaseMaxHours !== 168) {
  fail('Support coverage lease must remain capped at 168 hours.');
}
if (manifest.policy?.supportMonitoringConfirmationRequired !== true) {
  fail('Support coverage must require explicit monitoring confirmation.');
}
if (manifest.policy?.supportAdminEndpoint !== 'GET /api/beta/support') {
  fail('Unexpected beta support status endpoint.');
}
if (manifest.policy?.supportConfigureEndpoint !== 'POST /api/beta/support/configure') {
  fail('Unexpected beta support configure endpoint.');
}
if (manifest.policy?.supportRevokeEndpoint !== 'POST /api/beta/support/revoke') {
  fail('Unexpected beta support revoke endpoint.');
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
}

for (const blocker of [
  'CLIENT_COHORT_NOT_CONFIGURED',
  'CLIENT_COHORT_LIMIT_EXCEEDED',
  'COHORT_MEMBER_INELIGIBLE',
  'CARTAGENA_VET_COVERAGE_INSUFFICIENT',
  'SUPPORT_CONFIGURATION_NOT_ACTIVE',
]) {
  requireText(service, `"${blocker}"`, 'BetaReadinessService');
}

requireText(service, 'this.support.getOperationalSnapshot()', 'BetaReadinessService');
requireText(service, 'supportLedger: "audit_logs"', 'BetaReadinessService');
requireText(service, 'supportConfigurationAdminOnly: true', 'BetaReadinessService');
requireText(service, 'machineActivationReady', 'BetaReadinessService');
requireText(service, 'authorizationRequired: true', 'BetaReadinessService');
requireText(service, 'authorizationActive', 'BetaReadinessService');
requireText(service, 'blockingReasons', 'BetaReadinessService');
requireText(service, 'externalEvidenceRequired: true', 'BetaReadinessService');
requireText(service, 'commercialLaunchAuthorized: false', 'BetaReadinessService');
requireText(
  service,
  'machineReadinessIsNotLaunchApproval: true',
  'BetaReadinessService',
);
requireText(
  service,
  'operatorAuthorizationDoesNotToggleProviderConfiguration: true',
  'BetaReadinessService',
);
requireText(runbook, 'NO LANZADA', 'Operations runbook');
requireText(runbook, 'ready-to-enable', 'Operations runbook');
requireText(runbook, 'misconfigured', 'Operations runbook');
requireText(runbook, 'An ACTIVE lease satisfies only the **technical runtime prerequisite**.', 'Operations runbook');

if (service.includes('NVET_CLOSED_BETA_CLIENT_HASHES')) {
  fail('Readiness response implementation must not depend on or expose raw cohort hash material.');
}
if (
  service.includes('NVET_BETA_SUPPORT_OWNER') ||
  service.includes('NVET_BETA_SUPPORT_CHANNEL')
) {
  fail('Readiness must not depend on legacy support environment variables.');
}

console.log('Beta Operational Activation Readiness contract verified.');
console.log(`Activation states: ${EXPECTED_STATES.join(', ')}`);
console.log('Support readiness is append-only, time-bounded and admin-controlled.');
console.log('External/operator evidence remains fail-closed and activation requires a lease.');
