import fs from 'node:fs';

const readJson = (path) => JSON.parse(fs.readFileSync(path, 'utf8'));
const rc = readJson('docs/production/RC_READINESS.json');
const beta = readJson('docs/production/BETA_CARTAGENA_READINESS.json');
const closure = readJson('docs/production/BETA_OPERATOR_ACTIVATION_CLOSURE.json');

const fail = (message) => {
  throw new Error(`Beta operator activation closure invariant failed: ${message}`);
};

const requiredRcGates = [
  'productionBackupConfigured',
  'restoreDrillVerified',
  'productionAlertingVerified',
  'paymentRailVerified',
];
const requiredBetaGates = [
  'rcPromoted',
  'productionBackupConfigured',
  'restoreDrillVerified',
  'productionAlertingVerified',
  'paymentRailVerified',
  'cartagenaVetCoverageVerified',
  'clientCohortConfigured',
  'supportOwnerConfirmed',
  'privacyAndTermsReviewed',
  'rollbackDrillVerified',
];
const inheritedRcGates = [
  'productionBackupConfigured',
  'restoreDrillVerified',
  'productionAlertingVerified',
  'paymentRailVerified',
];

if (closure.phase !== '12H') fail('closure manifest phase must be 12H');
if (closure.candidate !== rc.candidate) fail('closure candidate must match RC candidate');
if (beta.prerequisiteRcTag !== rc.candidate) fail('beta prerequisite RC tag must match RC candidate');
if (closure.policy?.failClosed !== true) fail('closure policy must remain fail-closed');

const validateGate = (gate, name, source) => {
  if (!gate) fail(`${source}.${name} is missing`);
  if (!['pending', 'verified'].includes(gate.status)) {
    fail(`${source}.${name} has unsupported status ${gate.status}`);
  }
  if (gate.status === 'verified') {
    if (typeof gate.evidence !== 'string' || gate.evidence.trim().length < 12) {
      fail(`${source}.${name} is verified without a substantive evidence reference`);
    }
  }
  if (gate.status === 'pending' && gate.evidence != null) {
    fail(`${source}.${name} is pending but contains evidence; review and promote atomically`);
  }
};

for (const name of requiredRcGates) {
  validateGate(rc.requiredExternalEvidence?.[name], name, 'RC_READINESS');
}
for (const name of requiredBetaGates) {
  validateGate(beta.requiredEvidence?.[name], name, 'BETA_CARTAGENA_READINESS');
}

for (const name of inheritedRcGates) {
  const rcGate = rc.requiredExternalEvidence[name];
  const betaGate = beta.requiredEvidence[name];
  if (rcGate.status !== betaGate.status || rcGate.evidence !== betaGate.evidence) {
    fail(`${name} diverges between RC and beta manifests`);
  }
}

const rcBlockers = requiredRcGates.filter(
  (name) => rc.requiredExternalEvidence[name].status !== 'verified',
);
const betaBlockers = requiredBetaGates.filter(
  (name) => beta.requiredEvidence[name].status !== 'verified',
);
const declaredBlockers = closure.authorization?.declaredBlockers ?? [];

const normalized = (values) => [...values].sort().join('|');
if (normalized(declaredBlockers) !== normalized(betaBlockers)) {
  fail(`declared blockers do not match beta evidence blockers. expected=${betaBlockers.join(',')}`);
}

const rcPromotionEligible = rcBlockers.length === 0;
const betaEvidenceEligible = betaBlockers.length === 0;
const anyAuthorizationEnabled =
  closure.authorization?.rcPromotionAuthorized === true ||
  closure.authorization?.providerActivationAuthorized === true ||
  closure.authorization?.commercialLaunchAuthorized === true;

if (!rcPromotionEligible && closure.authorization?.rcPromotionAuthorized !== false) {
  fail('RC promotion must remain unauthorized while RC evidence is pending');
}
if (!betaEvidenceEligible && anyAuthorizationEnabled) {
  fail('provider/commercial authorization cannot be enabled while beta evidence is pending');
}
if (!betaEvidenceEligible && closure.authorization?.operatorStatus !== 'blocked') {
  fail('operator status must remain blocked while beta evidence is pending');
}

const isRcTagPush = /^refs\/tags\/1\.0\.0-rc\./.test(process.env.GITHUB_REF ?? '');
if (isRcTagPush && !rcPromotionEligible) {
  fail(`RC tag promotion attempted with pending gates: ${rcBlockers.join(', ')}`);
}

console.log(JSON.stringify({
  phase: closure.phase,
  candidate: closure.candidate,
  rcPromotionEligible,
  betaEvidenceEligible,
  rcBlockers,
  betaBlockers,
  commercialLaunchAuthorized: closure.authorization.commercialLaunchAuthorized,
  operatorStatus: closure.authorization.operatorStatus,
}, null, 2));

console.log('Beta operator activation closure is structurally certified and fail-closed.');
