import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const paths = {
  contract: 'docs/production/PHASE_36_PRODUCTION_OBSERVABILITY_REAL_BETA.json',
  compliance: 'docs/production/ANDROID_PLAY_COMPLIANCE.json',
  dataSafety: 'docs/production/GOOGLE_PLAY_DATA_SAFETY.md',
  privacy: 'docs/production/NVET_PRIVACY_POLICY_SOURCE.md',
  betaManifest: 'docs/production/BETA_CARTAGENA_READINESS.json',
  operatorEvidence: 'docs/production/OPERATOR_EVIDENCE_CONTROL.json',
  betaConstants: 'backend/src/beta/beta-evidence.constants.ts',
  betaDto: 'backend/src/beta/dto/beta-evidence.dto.ts',
  betaEvidence: 'backend/src/beta/beta-evidence.service.ts',
  prisma: 'backend/prisma/schema.prisma',
  runtimeDto: 'backend/src/operations/dto/runtime-telemetry-event.dto.ts',
  runtimeService: 'backend/src/operations/runtime-telemetry.service.ts',
  runtimeController: 'backend/src/operations/runtime-telemetry.controller.ts',
  releaseHealth: 'backend/src/operations/release-health.service.ts',
  module: 'backend/src/operations/service-quality-telemetry.module.ts',
  mobileRuntime: 'mobile/src/services/runtime-telemetry.service.ts',
  mobileApi: 'mobile/src/services/api.ts',
  mobileAuth: 'mobile/src/services/auth.service.ts',
  mobileCtg: 'mobile/src/services/ctg-federation.service.ts',
  mobileApp: 'mobile/App.tsx',
};

function fail(message) {
  throw new Error(`Phase 36 observability mismatch: ${message}`);
}

async function read(relativePath) {
  return fs.readFile(path.join(ROOT, relativePath), 'utf8');
}

function requireMatch(text, pattern, label) {
  if (!pattern.test(text)) fail(label);
}

function requireNoMatch(text, pattern, label) {
  if (pattern.test(text)) fail(label);
}

const entries = await Promise.all(Object.values(paths).map(read));
const source = Object.fromEntries(Object.keys(paths).map((key, index) => [key, entries[index]]));
const contract = JSON.parse(source.contract);
const compliance = JSON.parse(source.compliance);
const betaManifest = JSON.parse(source.betaManifest);
const operatorEvidence = JSON.parse(source.operatorEvidence);

if (contract.schemaVersion !== 1 || contract.phase !== 36) fail('contract must remain Phase 36 schema v1');
if (contract.program !== 'production-observability-real-beta-validation') fail('unexpected Phase 36 program');
if (contract.scope?.productionDatabaseSchemaMutationAuthorized !== false) fail('production schema mutation must remain unauthorized');
if (contract.scope?.commercialLaunchAuthorized !== false) fail('commercial launch must remain unauthorized');
if (contract.policy?.failClosed !== true || contract.policy?.releaseHealthCanBlockPromotion !== true) fail('release health must remain fail-closed');
if (contract.policy?.releaseHealthPromotionScope !== 'post-beta-public-or-commercial') fail('release health promotion scope must remain post-beta/public-commercial');
if (contract.policy?.phase28RcPromotionPrecedesPhase36Observation !== true) fail('Phase 36 observation must remain downstream of RC promotion');
if (contract.policy?.automaticPublicRollout !== false) fail('automatic public rollout must remain disabled');
if (contract.policy?.externalEvidenceNeverAutoVerified !== true) fail('external evidence must never auto-verify');
if (contract.betaEvidence?.ledger !== 'audit_logs' || contract.betaEvidence?.appendOnly !== true) fail('beta evidence must remain append-only audit_logs');
if (contract.betaEvidence?.activationGateCount !== 10 || contract.betaEvidence?.observationGateCount !== 4) fail('Phase 36 must preserve 10 activation gates and four observation gates');
if (contract.betaEvidence?.observationEvidenceRequiredForInitialActivation !== false) fail('Phase 36 observation evidence must not block initial beta activation');
if (contract.betaEvidence?.automaticTelemetryDoesNotEqualHumanEvidence !== true) fail('automatic telemetry must not equal human beta evidence');

for (const key of [
  'piiInTelemetryForbidden',
  'tokensInTelemetryForbidden',
  'passwordsInTelemetryForbidden',
  'twoFactorCodesInTelemetryForbidden',
  'clinicalFreeTextInTelemetryForbidden',
  'paymentCredentialsInTelemetryForbidden',
  'rawStackTracesFromClientsForbidden',
  'telemetryEventNamesAllowListed',
]) {
  if (contract.privacy?.[key] !== true) fail(`privacy invariant ${key} must remain true`);
}

const requiredEvents = [
  'APP_STARTED',
  'AUTH_LOGIN_SUCCESS',
  'AUTH_LOGIN_FAILURE',
  'SESSION_REFRESH_SUCCESS',
  'SESSION_REFRESH_FAILURE',
  'CTG_FEDERATION_STARTED',
  'CTG_FEDERATION_CALLBACK_RECEIVED',
  'CTG_FEDERATION_EXCHANGE_SUCCESS',
  'CTG_FEDERATION_EXCHANGE_FAILURE',
  'API_REQUEST_SUCCESS',
  'API_REQUEST_FAILURE',
];
for (const event of requiredEvents) {
  if (!contract.runtimeEvents?.includes(event)) fail(`runtime event missing from contract: ${event}`);
  requireMatch(source.runtimeDto, new RegExp(`["']${event}["']`), `backend DTO missing ${event}`);
  requireMatch(source.mobileRuntime, new RegExp(`["']${event}["']`), `mobile allow-list missing ${event}`);
}

const observationGateIds = [
  'play-vitals-crash-free',
  'physical-device-matrix',
  'real-beta-cohort',
  'observation-window',
];
for (const item of contract.externalEvidence ?? []) {
  if (item.status !== 'operator-required') fail(`external evidence ${item.id} must remain operator-required`);
  if (item.ledgerGate !== item.id) fail(`external evidence ${item.id} must map to its append-only ledger gate`);
}
if (JSON.stringify((contract.externalEvidence ?? []).map((item) => item.id)) !== JSON.stringify(observationGateIds)) {
  fail('Phase 36 external evidence IDs drifted from the canonical observation gates');
}

requireMatch(source.betaConstants, /PHASE_36_OBSERVATION_EVIDENCE_GATES/, 'Phase 36 observation gate registry missing');
requireMatch(source.betaConstants, /ALL_BETA_EVIDENCE_GATES/, 'combined evidence gate registry missing');
requireMatch(source.betaDto, /@IsIn\(ALL_BETA_EVIDENCE_GATES\)/, 'evidence DTO must accept activation and observation gates');
requireMatch(source.betaEvidence, /getObservationSummary\(\)/, 'Phase 36 observation evidence summary missing');
requireMatch(source.betaEvidence, /observationEvidenceExcludedFromActivation: true/, 'activation summary must exclude observation evidence');
requireMatch(source.betaEvidence, /requiredForInitialBetaActivation: false/, 'observation summary must remain downstream of activation');
requireMatch(source.betaEvidence, /ALL_BETA_EVIDENCE_GATES\.includes/, 'evidence parser must accept Phase 36 observation gates');

if (betaManifest.policy?.phase36ObservationEvidenceRequiredForInitialActivation !== false) {
  fail('beta manifest must keep Phase 36 observation evidence outside initial activation');
}
const expectedObservationSources = {
  'play-vitals-crash-free': 'observationEvidence.playVitalsCrashFree',
  'physical-device-matrix': 'observationEvidence.physicalDeviceMatrix',
  'real-beta-cohort': 'observationEvidence.realBetaCohort',
  'observation-window': 'observationEvidence.observationWindow',
};
for (const [gateId, sourceKey] of Object.entries(expectedObservationSources)) {
  const gate = operatorEvidence.gates?.find((item) => item.id === gateId);
  if (!gate) fail(`operator evidence control missing ${gateId}`);
  if (gate.sourceManifest !== 'beta' || gate.sourceKey !== sourceKey) {
    fail(`operator evidence control source mismatch for ${gateId}`);
  }
  const manifestKey = sourceKey.split('.')[1];
  const entry = betaManifest.observationEvidence?.[manifestKey];
  if (!entry || entry.status !== 'pending' || entry.evidence !== null || entry.blocksInitialActivation !== false) {
    fail(`beta observation manifest entry invalid for ${gateId}`);
  }
}

if (compliance.observabilityPhase !== 36) fail('Play compliance must declare observabilityPhase 36');
if (compliance.sdkInventory?.firstPartyRuntimeTelemetry !== true) fail('first-party telemetry inventory missing');
const runtimeInventory = (compliance.dataInventory ?? []).find((entry) => entry.id === 'runtime-diagnostics');
if (!runtimeInventory) fail('runtime-diagnostics data inventory missing');
for (const [key, value] of Object.entries(runtimeInventory.privacyBoundary ?? {})) {
  if (value !== false) fail(`runtime diagnostics privacy boundary ${key} must remain false`);
}
if (compliance.externalEvidence?.playRuntimeDiagnosticsDeclarationReview !== 'pending') fail('Play runtime diagnostics declaration must remain external/pending');

requireMatch(source.dataSafety, /Phase 36 first-party runtime diagnostics boundary/i, 'Data Safety runtime diagnostics section missing');
requireMatch(source.dataSafety, /memory-only/i, 'Data Safety must disclose memory-only client queue');
requireMatch(source.privacy, /eventos técnicos limitados/i, 'privacy source must disclose first-party diagnostics');
requireMatch(source.privacy, /telemetría automática no constituye por sí misma aprobación/i, 'privacy source must separate telemetry from beta approval');

requireMatch(source.runtimeService, /const MAX_EVENTS = 5000/, 'bounded backend telemetry buffer missing');
requireMatch(source.runtimeService, /aggregateBuffer: "instance-memory"/, 'backend telemetry must remain in-memory aggregate');
requireMatch(source.runtimeService, /providerStructuredLogs: true/, 'structured provider logging boundary missing');
requireMatch(source.runtimeService, /containsUserIdentifiers: false/, 'backend telemetry identity boundary missing');
requireMatch(source.runtimeController, /@Post\("events"\)/, 'runtime telemetry ingestion endpoint missing');
requireMatch(source.runtimeController, /@Get\("snapshot"\)/, 'runtime telemetry admin snapshot missing');

requireMatch(source.releaseHealth, /auditLog\.findMany/, 'release health must derive durable auth outcomes from AuditLog');
requireMatch(source.releaseHealth, /AuditAction\.LOGIN_SUCCESS/, 'release health login-success source missing');
requireMatch(source.releaseHealth, /AuditAction\.NVET_IDENTITY_EXCHANGE_FAILURE/, 'release health CTG failure source missing');
requireMatch(source.releaseHealth, /"BLOCKED"/, 'release health BLOCKED state missing');
requireMatch(source.releaseHealth, /"OBSERVING"/, 'release health OBSERVING state missing');
requireMatch(source.releaseHealth, /"READY_FOR_OPERATOR_BETA_REVIEW"/, 'operator beta review state missing');
requireMatch(source.releaseHealth, /commercialLaunchAuthorized: false/, 'release health must not authorize commercial launch');
requireNoMatch(source.releaseHealth, /auditLog\.(?:create|update|delete|upsert)/, 'release-health snapshot must remain read-only');

requireMatch(source.betaEvidence, /ledger: "audit_logs"/, 'existing beta evidence ledger contract missing');
requireMatch(source.betaEvidence, /appendOnly: true/, 'existing beta evidence must remain append-only');
requireNoMatch(source.prisma, /model\s+RuntimeTelemetry\b/, 'Phase 36 must not add a runtime telemetry database model');

requireMatch(source.mobileRuntime, /const MAX_QUEUE_SIZE = 100/, 'mobile telemetry queue must remain bounded');
requireMatch(source.mobileRuntime, /secureStorage\.getAccessToken/, 'telemetry upload must use the authenticated Nvet session');
requireMatch(source.mobileRuntime, /body: JSON\.stringify\(event\)/, 'telemetry transport must send only the sanitized event object');
requireNoMatch(source.mobileRuntime, /AsyncStorage/, 'runtime telemetry queue must not persist to AsyncStorage');
requireMatch(source.mobileApi, /API_REQUEST_SUCCESS/, 'API success telemetry missing');
requireMatch(source.mobileApi, /API_REQUEST_FAILURE/, 'API failure telemetry missing');
requireMatch(source.mobileAuth, /AUTH_LOGIN_SUCCESS/, 'auth success telemetry missing');
requireMatch(source.mobileAuth, /AUTH_LOGIN_FAILURE/, 'auth failure telemetry missing');
requireMatch(source.mobileAuth, /SESSION_REFRESH_SUCCESS/, 'refresh success telemetry missing');
requireMatch(source.mobileAuth, /SESSION_REFRESH_FAILURE/, 'refresh failure telemetry missing');
requireMatch(source.mobileCtg, /CTG_FEDERATION_STARTED/, 'CTG start telemetry missing');
requireMatch(source.mobileCtg, /CTG_FEDERATION_CALLBACK_RECEIVED/, 'CTG callback telemetry missing');
requireMatch(source.mobileCtg, /CTG_FEDERATION_EXCHANGE_SUCCESS/, 'CTG success telemetry missing');
requireMatch(source.mobileCtg, /CTG_FEDERATION_EXCHANGE_FAILURE/, 'CTG failure telemetry missing');
requireMatch(source.mobileApp, /runtimeTelemetry\.emit\(['"]APP_STARTED['"]\)/, 'app-start telemetry missing');
requireMatch(source.module, /RuntimeTelemetryService/, 'runtime telemetry service not wired into operations module');
requireMatch(source.module, /ReleaseHealthService/, 'release health service not wired into operations module');

console.log('PASS | Phase 36 production observability contract');
console.log('PASS | Privacy-minimized allow-listed mobile telemetry');
console.log('PASS | AuditLog + runtime + service-quality release health convergence');
console.log('PASS | Activation evidence remains separate from four post-beta observation gates');
console.log('PASS | Phase 36 external evidence is registered in API and operator control planes');
console.log('INFO | Real devices, Play Vitals, real cohort and elapsed observation remain operator-required');
