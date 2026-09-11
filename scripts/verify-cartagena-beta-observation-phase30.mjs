import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTROL_PATH = 'docs/production/PHASE_30_CARTAGENA_BETA_OBSERVATION_CLOSURE.json';
const OUTPUT_PATH = '.artifacts/phase30-cartagena-beta-observation-closure.json';

const args = process.argv.slice(2);
const contractOnly = args.includes('--contract-only');
const enforceDecision = args.includes('--enforce-decision');
const snapshotIndex = args.indexOf('--snapshot');
const snapshotArg = snapshotIndex >= 0 ? args[snapshotIndex + 1] : args.find((arg) => arg.startsWith('--snapshot='))?.slice('--snapshot='.length);

function fail(message) {
  throw new Error(`Phase 30 Cartagena beta observation mismatch: ${message}`);
}

async function readJson(relativeOrAbsolutePath) {
  const resolved = path.isAbsolute(relativeOrAbsolutePath)
    ? relativeOrAbsolutePath
    : path.join(ROOT, relativeOrAbsolutePath);
  return JSON.parse(await fs.readFile(resolved, 'utf8'));
}

async function exists(relativePath) {
  try {
    await fs.access(path.join(ROOT, relativePath));
    return true;
  } catch {
    return false;
  }
}

function ensureNoSensitiveKeys(value, trail = []) {
  const forbidden = new Set([
    'userid', 'vetid', 'petid', 'clientid', 'address', 'email', 'phone',
    'latitude', 'longitude', 'lat', 'lng', 'coordinates', 'documentnumber',
  ]);
  if (Array.isArray(value)) {
    value.forEach((item, index) => ensureNoSensitiveKeys(item, [...trail, String(index)]));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (forbidden.has(key.toLowerCase())) fail(`runtime snapshot contains forbidden sensitive key '${[...trail, key].join('.')}'`);
    ensureNoSensitiveKeys(child, [...trail, key]);
  }
}

function get(object, dottedPath) {
  return dottedPath.split('.').reduce((current, part) => current?.[part], object);
}

async function validateContract() {
  const control = await readJson(CONTROL_PATH);
  if (control.schemaVersion !== 1 || control.phase !== 30 || control.program !== 'cartagena-beta-observation-closure') {
    fail('schemaVersion/phase/program is invalid');
  }
  if (control.targetMarket?.daneCode !== '13001') fail('target market must remain Cartagena DANE 13001');
  if (control.policy?.minimumObservationHours !== 168) fail('minimum observation must remain 168 hours');
  if (control.policy?.requireServiceQualityWindowHours !== 168) fail('service-quality window must remain 168 hours');
  if (control.policy?.minimumMetricObservations !== 10) fail('minimum metric observations must remain 10');
  if (!control.policy?.failClosed || !control.policy?.requireClosedObservationRecord) fail('fail-closed closed-observation policy is required');
  if (
    !control.policy?.observationClosureNeverAuthorizesCommercialLaunch ||
    !control.policy?.observationClosureNeverAuthorizesNationalExpansion ||
    !control.policy?.observationClosureNeverPublishesToStore ||
    !control.policy?.observationClosureNeverMutatesProviderConfiguration ||
    !control.policy?.observationClosureNeverSynthesizesRuntimeEvidence
  ) fail('Phase 30 safety boundaries must remain explicit');

  const inputs = control.authoritativeInputs ?? {};
  const requiredInputs = ['phase29', 'betaReadiness', 'phase25Contract', 'phase26Contract', 'freeze', 'blockers', 'globalReadiness'];
  for (const key of requiredInputs) {
    if (typeof inputs[key] !== 'string' || !(await exists(inputs[key]))) fail(`missing authoritative input '${key}'`);
  }

  const [phase29, beta, freeze, blockers, global] = await Promise.all([
    readJson(inputs.phase29),
    readJson(inputs.betaReadiness),
    readJson(inputs.freeze),
    readJson(inputs.blockers),
    readJson(inputs.globalReadiness),
  ]);

  const candidateClaims = [
    ['phase29', phase29.candidate],
    ['beta', beta.prerequisiteRcTag],
    ['freeze', freeze.candidate],
    ['blockers', blockers.candidate],
    ['global', global.candidate],
  ];
  for (const [label, value] of candidateClaims) {
    if (value !== control.candidate) fail(`${label} candidate '${value}' diverges from '${control.candidate}'`);
  }

  if (phase29.phase !== 29 || phase29.program !== 'cartagena-beta-activation') fail('Phase 29 prerequisite is invalid');
  if (phase29.nextStage?.phase !== 30 || phase29.nextStage?.program !== control.program) {
    fail('Phase 29 nextStage must point to Phase 30 cartagena-beta-observation-closure');
  }
  if (freeze.phase !== 27 || freeze.state !== 'FROZEN' || freeze.governance?.featureFreezeActive !== true) {
    fail('Phase 27 release candidate freeze must remain active');
  }
  if ((blockers.blockers ?? []).some((entry) => entry.status === 'open')) fail('release blocker registry contains an open blocker');

  const requiredMetrics = control.requiredServiceQualityMetrics ?? [];
  if (requiredMetrics.length !== 6 || new Set(requiredMetrics).size !== 6) fail('exactly six unique service-quality metrics are required');

  const staticBetaBlockers = Object.entries(beta.requiredEvidence ?? {})
    .filter(([, entry]) => entry?.status !== 'verified')
    .map(([key]) => key);

  return { control, phase29, beta, freeze, blockers, global, staticBetaBlockers };
}

function validateSnapshot(snapshot, control) {
  ensureNoSensitiveKeys(snapshot);
  for (const field of control.runtimeSnapshotSchema?.requiredFields ?? []) {
    if (get(snapshot, field) === undefined || get(snapshot, field) === null) fail(`runtime snapshot missing '${field}'`);
  }
  if (snapshot.candidate !== control.candidate) fail('runtime snapshot candidate mismatch');
  if (snapshot.marketDaneCode !== control.targetMarket.daneCode) fail('runtime snapshot market must remain Cartagena DANE 13001');
  if (snapshot.phase29State !== 'ACTIVE_BETA_REQUIRES_OBSERVATION') fail('runtime snapshot must represent an actively enabled Phase 29 beta');
  if (snapshot.phase24Decision !== 'GO' || snapshot.phase25EffectiveDecision !== 'GO') fail('Phase 24 and Phase 25 decisions must both be GO');
  if (snapshot.betaEnabled !== true || snapshot.bookingEnabled !== true) fail('beta and booking gates must both be enabled during a successful observation');
  if (snapshot.authorizationId !== snapshot.observation.authorizationId) fail('observation authorization binding mismatch');
  if (!control.runtimeSnapshotSchema.allowedObservationStatuses.includes(snapshot.observation.status)) fail('unsupported observation status');
  if (snapshot.serviceQuality.windowHours !== 168) fail('service-quality snapshot must cover 168 hours');
  if (snapshot.serviceQuality.marketDaneCode !== '13001') fail('service-quality snapshot must be scoped to Cartagena DANE 13001');
  if (!control.runtimeSnapshotSchema.allowedSloStates.includes(snapshot.serviceQuality.overallSloState)) fail('unsupported overall SLO state');

  const startedAt = Date.parse(snapshot.observation.startedAt);
  const closedAt = Date.parse(snapshot.observation.closedAt);
  if (!Number.isFinite(startedAt) || !Number.isFinite(closedAt) || closedAt < startedAt) fail('observation timestamps are invalid');
  const computedElapsed = (closedAt - startedAt) / 3_600_000;
  if (Math.abs(computedElapsed - Number(snapshot.observation.elapsedHours)) > 0.05) fail('observation elapsedHours diverges from timestamps');

  const metrics = snapshot.serviceQuality.requiredMetrics;
  if (!metrics || typeof metrics !== 'object') fail('serviceQuality.requiredMetrics must be an object');
  for (const metricName of control.requiredServiceQualityMetrics) {
    const metric = metrics[metricName];
    if (!metric || !control.runtimeSnapshotSchema.allowedSloStates.includes(metric.status)) fail(`metric '${metricName}' has invalid status`);
    const observations = Number(metric.observations);
    if (!Number.isFinite(observations) || observations < 0) fail(`metric '${metricName}' has invalid observations`);
    if (metric.status !== 'INSUFFICIENT_DATA' && observations < control.policy.minimumMetricObservations) {
      fail(`metric '${metricName}' claims ${metric.status} with fewer than ${control.policy.minimumMetricObservations} observations`);
    }
  }
  return computedElapsed;
}

function classify(snapshot, control, elapsedHours) {
  if (snapshot.observation.status === 'ABORTED') return control.classification.failed;
  if (snapshot.observation.status !== 'CLOSED' || elapsedHours < control.policy.minimumObservationHours) return control.classification.observing;

  const statuses = control.requiredServiceQualityMetrics.map((name) => snapshot.serviceQuality.requiredMetrics[name].status);
  if (snapshot.serviceQuality.overallSloState === 'BREACHED' || statuses.includes('BREACHED')) return control.classification.failed;
  if (
    snapshot.serviceQuality.overallSloState === 'INSUFFICIENT_DATA' ||
    snapshot.serviceQuality.overallSloState === 'WATCH' ||
    statuses.includes('INSUFFICIENT_DATA') ||
    statuses.includes('WATCH')
  ) return control.classification.review;
  if (snapshot.serviceQuality.overallSloState === 'PASS' && statuses.every((status) => status === 'PASS')) return control.classification.passed;
  return control.classification.review;
}

async function buildReport(ctx) {
  const { control, staticBetaBlockers } = ctx;
  if (!snapshotArg) {
    return {
      schemaVersion: 1,
      phase: 30,
      program: control.program,
      candidate: control.candidate,
      observedAt: new Date().toISOString(),
      state: control.classification.blocked,
      staticPrerequisites: {
        phase29EvidenceClosed: staticBetaBlockers.length === 0,
        betaEvidenceBlockers: staticBetaBlockers,
      },
      runtimeEvidencePresent: false,
      operatorActionRequired: staticBetaBlockers.length > 0,
      nextStage: control.nextStage,
      safetyBoundary: 'Phase 30 contract is installed, but no real observation or runtime evidence is fabricated by CI.',
    };
  }

  const snapshot = await readJson(snapshotArg);
  const elapsedHours = validateSnapshot(snapshot, control);
  const state = classify(snapshot, control, elapsedHours);
  return {
    schemaVersion: 1,
    phase: 30,
    program: control.program,
    candidate: control.candidate,
    observedAt: new Date().toISOString(),
    state,
    runtimeEvidencePresent: true,
    observation: {
      status: snapshot.observation.status,
      authorizationBound: snapshot.authorizationId === snapshot.observation.authorizationId,
      elapsedHours,
      minimumHours: control.policy.minimumObservationHours,
    },
    serviceQuality: {
      overallSloState: snapshot.serviceQuality.overallSloState,
      requiredMetrics: snapshot.serviceQuality.requiredMetrics,
    },
    commercialLaunchAuthorized: false,
    nationalExpansionAuthorized: false,
    publicStoreReleaseAuthorized: false,
    nextStage: control.nextStage,
  };
}

async function writeReport(report) {
  await fs.mkdir(path.join(ROOT, '.artifacts'), { recursive: true });
  await fs.writeFile(path.join(ROOT, OUTPUT_PATH), `${JSON.stringify(report, null, 2)}\n`);
  console.log('Nvet Care — Phase 30 Cartagena Beta Observation Closure');
  console.log(`Candidate: ${report.candidate}`);
  console.log(`State: ${report.state}`);
  if (report.staticPrerequisites?.betaEvidenceBlockers?.length) {
    for (const blocker of report.staticPrerequisites.betaEvidenceBlockers) console.log(`BLOCKED | beta.requiredEvidence.${blocker}`);
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    const lines = [
      '# Nvet Care — Phase 30 Cartagena Beta Observation Closure',
      '',
      `Candidate: \`${report.candidate}\``,
      `State: **${report.state}**`,
      `Runtime evidence present: **${report.runtimeEvidencePresent}**`,
      '',
      '> Phase 30 never fabricates elapsed time, beta participants, service-quality evidence, commercial launch authority, national expansion authority or store publication.',
    ];
    await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
  }
}

const contract = await validateContract();
if (!contractOnly) {
  const report = await buildReport(contract);
  await writeReport(report);
  if (enforceDecision && [contract.control.classification.blocked, contract.control.classification.observing].includes(report.state)) {
    fail(`Phase 30 does not yet have a closeable technical-beta decision; state=${report.state}`);
  }
}
