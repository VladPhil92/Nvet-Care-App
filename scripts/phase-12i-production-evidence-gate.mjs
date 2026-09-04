import fs from 'node:fs';

const readJson = (path) => JSON.parse(fs.readFileSync(path, 'utf8'));
const phase = readJson('docs/production/PHASE_12I_PRODUCTION_EVIDENCE_EXECUTION.json');
const rc = readJson('docs/production/RC_READINESS.json');
const beta = readJson('docs/production/BETA_CARTAGENA_READINESS.json');
const closure = readJson('docs/production/BETA_OPERATOR_ACTIVATION_CLOSURE.json');

const assert = (condition, message) => {
  if (!condition) throw new Error(`Phase 12I invariant failed: ${message}`);
  console.log(`✓ ${message}`);
};

assert(phase.phase === '12I', 'phase identifier is pinned to 12I');
assert(phase.candidate === rc.candidate, 'candidate matches RC readiness manifest');
assert(beta.prerequisiteRcTag === rc.candidate, 'beta prerequisite matches RC candidate');
assert(closure.candidate === rc.candidate, 'operator closure targets the same RC candidate');

const provider = phase.observedProviderEvidence;
assert(Number.isInteger(provider.workflowRunId) && provider.workflowRunId > 0, 'provider workflow run is traceable');
assert(Number.isInteger(provider.artifactId) && provider.artifactId > 0, 'provider evidence artifact is traceable');
assert(/^[a-f0-9]{64}$/.test(provider.artifactSha256), 'provider artifact SHA-256 is pinned');
assert(Number.isInteger(provider.scheduleCount) && provider.scheduleCount >= 0, 'backup schedule count is explicit');
assert(Number.isInteger(provider.backupCount) && provider.backupCount >= 0, 'visible backup count is explicit');

const rcEvidence = rc.requiredExternalEvidence;
const betaEvidence = beta.requiredEvidence;
const inherited = [
  'productionBackupConfigured',
  'restoreDrillVerified',
  'productionAlertingVerified',
  'paymentRailVerified',
];

for (const gate of inherited) {
  assert(rcEvidence[gate]?.status === betaEvidence[gate]?.status, `${gate} status is atomic across RC and beta manifests`);
  assert((rcEvidence[gate]?.evidence ?? null) === (betaEvidence[gate]?.evidence ?? null), `${gate} evidence reference is atomic across RC and beta manifests`);
}

const providerReady =
  provider.scheduleCount >= 1 &&
  provider.backupCount >= 1 &&
  provider.latestBackupAgeHours !== null &&
  provider.latestBackupAgeHours <= provider.policy.maxBackupAgeHours &&
  provider.verdict === 'PASS';

if (!providerReady) {
  assert(rcEvidence.productionBackupConfigured.status === 'pending', 'backup gate remains pending while provider evidence is incomplete');
  assert(betaEvidence.productionBackupConfigured.status === 'pending', 'beta backup gate remains pending while provider evidence is incomplete');
  assert(rcEvidence.restoreDrillVerified.status === 'pending', 'restore drill cannot be promoted before usable provider backup evidence exists');
  assert(phase.promotion.rcPromotionAuthorized === false, 'RC promotion remains blocked while provider backup evidence is incomplete');
  assert(closure.authorization.rcPromotionAuthorized === false, 'operator closure remains fail-closed for RC promotion');
}

const rcPending = Object.entries(rcEvidence)
  .filter(([, value]) => value.status !== 'verified')
  .map(([gate]) => gate);

if (rcPending.length > 0) {
  assert(phase.promotion.rcPromotionAuthorized === false, 'Phase 12I cannot authorize RC promotion with pending external gates');
  assert(closure.authorization.rcPromotionAuthorized === false, 'Phase 12H closure cannot authorize RC promotion with pending external gates');
}

const sequence = phase.executionSequence;
assert(Array.isArray(sequence) && sequence.length === 4, 'execution sequence contains the four required closure stages');
assert(sequence.map((item) => item.order).join(',') === '1,2,3,4', 'execution sequence order is deterministic');
assert(sequence[0].gate === 'productionBackupConfigured', 'provider backup is the first closure stage');
assert(sequence[1].gate === 'restoreDrillVerified', 'provider restore drill follows backup configuration');
assert(sequence[2].gate === 'paymentRailVerified', 'real payment evidence precedes RC promotion');
assert(sequence[3].gate === 'rcPromoted', 'RC promotion is the final Phase 12I stage');

if (process.env.PHASE12I_REQUIRE_RC_PROMOTION === '1' && rcPending.length > 0) {
  throw new Error(`RC promotion requested but external evidence remains pending: ${rcPending.join(', ')}`);
}

console.log('');
console.log('Phase 12I evidence execution boundary is consistent.');
console.log(`Provider backup schedules: ${provider.scheduleCount}`);
console.log(`Visible provider backups: ${provider.backupCount}`);
console.log(`RC external blockers: ${rcPending.join(', ') || 'none'}`);
console.log(`RC promotion authorized: ${phase.promotion.rcPromotionAuthorized}`);
