import fs from 'node:fs/promises';

const BETA_PATH = new URL('../docs/production/BETA_CARTAGENA_READINESS.json', import.meta.url);
const CLOSURE_PATH = new URL('../docs/production/BETA_OPERATOR_ACTIVATION_CLOSURE.json', import.meta.url);

const [betaRaw, closureRaw] = await Promise.all([
  fs.readFile(BETA_PATH, 'utf8'),
  fs.readFile(CLOSURE_PATH, 'utf8'),
]);

const beta = JSON.parse(betaRaw);
const closure = JSON.parse(closureRaw);

if (closure.policy?.failClosed !== true) {
  throw new Error('Beta closure must remain fail-closed.');
}
if (!closure.authorization || closure.authorization.providerActivationAuthorized !== false || closure.authorization.commercialLaunchAuthorized !== false) {
  throw new Error('Operator evidence sync must not authorize provider or commercial activation.');
}

const requiredEvidence = beta.requiredEvidence ?? {};
const blockers = Object.entries(requiredEvidence)
  .filter(([, gate]) => gate?.status !== 'verified')
  .map(([gateId]) => gateId);

closure.authorization.declaredBlockers = blockers;
if (blockers.length > 0) {
  closure.authorization.rcPromotionAuthorized = false;
  closure.authorization.providerActivationAuthorized = false;
  closure.authorization.commercialLaunchAuthorized = false;
  closure.authorization.operatorStatus = 'blocked';
}

await fs.writeFile(CLOSURE_PATH, `${JSON.stringify(closure, null, 2)}\n`);
console.log(`Beta closure blockers synchronized: ${blockers.join(', ') || 'none'}`);
console.log('No provider or commercial activation was authorized.');
