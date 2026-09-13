import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTROL_PATH = 'docs/production/PHASE_31_ANDROID_PLAY_INTERNAL_RELEASE.json';
const OUTPUT_PATH = '.artifacts/phase31-android-play-internal-release.json';

const args = process.argv.slice(2);
const contractOnly = args.includes('--contract-only');
const enforceOperatorReady = args.includes('--enforce-operator-ready');
const phase30Index = args.indexOf('--phase30-report');
const phase30ReportArg = phase30Index >= 0
  ? args[phase30Index + 1]
  : args.find((arg) => arg.startsWith('--phase30-report='))?.slice('--phase30-report='.length);

function fail(message) {
  throw new Error(`Phase 31 Android Play internal release mismatch: ${message}`);
}

async function readText(relativeOrAbsolutePath) {
  const resolved = path.isAbsolute(relativeOrAbsolutePath)
    ? relativeOrAbsolutePath
    : path.join(ROOT, relativeOrAbsolutePath);
  return fs.readFile(resolved, 'utf8');
}

async function readJson(relativeOrAbsolutePath) {
  return JSON.parse(await readText(relativeOrAbsolutePath));
}

async function exists(relativePath) {
  try {
    await fs.access(path.join(ROOT, relativePath));
    return true;
  } catch {
    return false;
  }
}

function requireMatch(text, pattern, label) {
  if (!pattern.test(text)) fail(label);
}

function requireNoMatch(text, pattern, label) {
  if (pattern.test(text)) fail(label);
}

function parseObservedAt(value, label) {
  if (typeof value !== 'string' || value.trim().length < 20) fail(`${label} must include an ISO-8601 observedAt timestamp`);
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) fail(`${label} observedAt is not a valid timestamp`);
  return timestamp;
}

async function validateContract() {
  const control = await readJson(CONTROL_PATH);
  if (control.schemaVersion !== 1 || control.phase !== 31 || control.program !== 'android-play-internal-release') {
    fail('schemaVersion/phase/program is invalid');
  }
  if (control.candidate !== '1.0.0-rc.2') fail('candidate must remain 1.0.0-rc.2');
  if (control.applicationId !== 'com.nvetcare') fail('applicationId must remain com.nvetcare');
  if (control.targetSdk !== 36) fail('targetSdk must remain 36');
  if (control.prerequisitePhase !== 30) fail('Phase 30 must remain the operational prerequisite');
  if (!Array.isArray(control.acceptedPhase30Outcomes) || control.acceptedPhase30Outcomes.length !== 2) {
    fail('accepted Phase 30 outcomes must be explicit');
  }
  for (const outcome of ['PASSED_TECHNICAL_BETA', 'REVIEW_REQUIRED']) {
    if (!control.acceptedPhase30Outcomes.includes(outcome)) fail(`missing accepted Phase 30 outcome ${outcome}`);
  }

  const policy = control.policy ?? {};
  if (!policy.failClosed || !policy.engineeringPreparationMayProceedBeforeExternalClosure) {
    fail('fail-closed engineering-forward policy is required');
  }
  if (!policy.externalEvidenceNeverAutoVerified || !policy.secretsNeverCommitted) {
    fail('external evidence and secret boundaries must remain enabled');
  }
  if (policy.playTrack !== 'internal' || policy.playAutomationMaximumStatus !== 'draft') {
    fail('Play automation must remain internal/draft only');
  }
  if (policy.automaticProductionPromotion !== false || policy.publicStoreReleaseAuthorized !== false || policy.commercialLaunchAuthorized !== false) {
    fail('Phase 31 must never grant automatic production/public/commercial authority');
  }
  if (policy.minimumInternalTrackObservationHours !== 24 || policy.minimumPhysicalDevices !== 2) {
    fail('Internal observation/device minimums drifted');
  }
  if (control.classification?.internalDraftObserving !== 'INTERNAL_DRAFT_OBSERVING') {
    fail('internal observation classification is required');
  }

  const inputs = control.authoritativeInputs ?? {};
  const requiredInputs = [
    'phase30', 'androidReadiness', 'androidPreflight', 'playCompliance', 'freeze', 'blockers',
    'globalReadiness', 'releaseWorkflow', 'internalRunbook',
  ];
  for (const key of requiredInputs) {
    if (typeof inputs[key] !== 'string' || !(await exists(inputs[key]))) fail(`missing authoritative input '${key}'`);
  }

  const [phase30, android, preflight, compliance, freeze, blockers, global, releaseWorkflow, internalRunbook] = await Promise.all([
    readJson(inputs.phase30),
    readJson(inputs.androidReadiness),
    readJson(inputs.androidPreflight),
    readJson(inputs.playCompliance),
    readJson(inputs.freeze),
    readJson(inputs.blockers),
    readJson(inputs.globalReadiness),
    readText(inputs.releaseWorkflow),
    readText(inputs.internalRunbook),
  ]);

  if (phase30.phase !== 30 || phase30.program !== 'cartagena-beta-observation-closure') fail('Phase 30 prerequisite contract is invalid');
  if (phase30.candidate !== control.candidate) fail('Phase 30 candidate diverged');
  if (phase30.nextStage?.phase !== 31 || phase30.nextStage?.program !== control.program) {
    fail('Phase 30 nextStage must point to Phase 31 android-play-internal-release');
  }

  if (android.phase !== 13 || android.program !== 'android-production') fail('Android production readiness contract is invalid');
  if (android.applicationId !== control.applicationId || android.requiredTargetApi !== control.targetSdk) {
    fail('Android identity/target API drifted');
  }
  if (android.prerequisiteRcTag !== control.candidate) fail('Android prerequisite RC diverged');
  if (android.policy?.minInternalTrackObservationHours !== policy.minimumInternalTrackObservationHours) {
    fail('Android and Phase 31 internal observation policies diverged');
  }
  if (android.requiredEvidence?.internalTrackUploaded?.status === 'verified') {
    parseObservedAt(android.requiredEvidence.internalTrackUploaded.observedAt, 'internalTrackUploaded');
  }

  if (preflight.phase !== '13E' || preflight.program !== 'android-google-play-release-preflight') {
    fail('Android release preflight contract is invalid');
  }
  if (preflight.applicationId !== control.applicationId || preflight.targetSdk !== control.targetSdk) {
    fail('Android preflight identity/target SDK drifted');
  }
  for (const gate of control.engineeringRequirements ?? []) {
    if (preflight.technicalGates?.[gate] !== 'verified') fail(`technical preflight gate '${gate}' must remain verified`);
  }

  if (compliance.applicationId !== control.applicationId) fail('Play compliance package identity drifted');
  if (compliance.releasePolicy?.internalTrackAutomationMaximumStatus !== 'draft') fail('Play compliance must remain draft-only');
  if (compliance.releasePolicy?.automaticProductionPromotion !== false) fail('Play compliance must prohibit automatic production promotion');

  if (freeze.phase !== 27 || freeze.state !== 'FROZEN' || freeze.candidate !== control.candidate) {
    fail('Phase 27 frozen candidate contract is not intact');
  }
  if ((blockers.blockers ?? []).some((entry) => entry.status === 'open')) fail('release blocker registry contains an open blocker');

  const phase31Gate = (global.engineeringGates ?? []).find((gate) => gate.id === 'android-play-internal-release-contract');
  if (!phase31Gate || phase31Gate.status !== 'verified') fail('GLOBAL_READINESS must register Phase 31 as verified engineering');
  for (const evidencePath of [
    CONTROL_PATH,
    'docs/production/PHASE_31_ANDROID_PLAY_INTERNAL_RELEASE.md',
    'scripts/verify-android-play-internal-release-phase31.mjs',
    '.github/workflows/android-play-internal-release-phase31.yml',
  ]) {
    if (!phase31Gate.evidencePaths?.includes(evidencePath)) fail(`GLOBAL_READINESS Phase 31 gate is missing ${evidencePath}`);
  }

  requireMatch(releaseWorkflow, /environment:\s*production/, 'release workflow must use the protected production environment');
  requireMatch(releaseWorkflow, /release_ref:/, 'release workflow must require an immutable release ref');
  requireMatch(releaseWorkflow, /ANDROID_UPLOAD_CERT_SHA256/, 'release workflow must pin the upload certificate');
  requireMatch(releaseWorkflow, /bundleRelease/, 'release workflow must build a release AAB');
  requireMatch(releaseWorkflow, /jarsigner -verify/, 'release workflow must verify the signed AAB');
  requireMatch(releaseWorkflow, /track:\s*internal/, 'release workflow must target Play internal track');
  requireMatch(releaseWorkflow, /status:\s*draft/, 'release workflow must stop at Play draft');
  requireNoMatch(releaseWorkflow, /^\s*track:\s*production\s*$/m, 'release workflow must never target Play production');
  requireNoMatch(releaseWorkflow, /^\s*status:\s*(?:completed|inProgress|halted)\s*$/m, 'release workflow must never auto-promote beyond draft');
  requireMatch(internalRunbook, /Application ID \/ package: `com\.nvetcare`/, 'internal runbook package identity drifted');
  requireMatch(internalRunbook, /status `draft`/i, 'internal runbook must preserve draft-only automation');

  const groupedGateIds = Object.values(control.operatorGateGroups ?? {}).flat();
  if (groupedGateIds.length === 0 || new Set(groupedGateIds).size !== groupedGateIds.length) {
    fail('operator gate groups must be non-empty and unique');
  }
  for (const gateId of groupedGateIds) {
    const entry = android.requiredEvidence?.[gateId];
    if (!entry || !['pending', 'verified'].includes(entry.status)) fail(`unsupported or missing operator gate '${gateId}'`);
    if (entry.status === 'verified' && (typeof entry.evidence !== 'string' || entry.evidence.trim().length < 3)) {
      fail(`verified operator gate '${gateId}' requires concrete evidence`);
    }
  }

  for (const repositoryGate of ['playComplianceContractVerified', 'accountDeletionAvailable', 'android16BehaviorReviewCompleted']) {
    if (android.requiredEvidence?.[repositoryGate]?.status !== 'verified') {
      fail(`repository-only Android gate '${repositoryGate}' must remain verified`);
    }
  }

  return { control, android };
}

async function phase30Outcome(control) {
  if (!phase30ReportArg) return { provided: false, accepted: false, state: null };
  const report = await readJson(phase30ReportArg);
  if (report.phase !== 30 || report.program !== 'cartagena-beta-observation-closure') fail('provided Phase 30 report is invalid');
  if (report.candidate !== control.candidate) fail('provided Phase 30 report candidate diverged');
  const accepted = control.acceptedPhase30Outcomes.includes(report.state);
  return { provided: true, accepted, state: report.state, observedAt: report.observedAt ?? null };
}

function pendingFrom(android, gateIds) {
  return gateIds.filter((gateId) => android.requiredEvidence?.[gateId]?.status !== 'verified');
}

function internalObservation(control, android, observedNow) {
  const entry = android.requiredEvidence?.internalTrackUploaded;
  const requiredHours = control.policy.minimumInternalTrackObservationHours;
  if (entry?.status !== 'verified') {
    return { startedAt: null, requiredHours, elapsedHours: 0, satisfied: false };
  }
  const startedMs = parseObservedAt(entry.observedAt, 'internalTrackUploaded');
  const nowMs = Date.parse(observedNow);
  if (startedMs > nowMs + 5 * 60 * 1000) fail('internalTrackUploaded observedAt cannot be in the future');
  const elapsedHours = Math.max(0, (nowMs - startedMs) / 3_600_000);
  return {
    startedAt: new Date(startedMs).toISOString(),
    requiredHours,
    elapsedHours: Number(elapsedHours.toFixed(2)),
    satisfied: elapsedHours >= requiredHours,
  };
}

async function buildReport({ control, android }) {
  const observedAt = new Date().toISOString();
  const observedPhase30 = await phase30Outcome(control);
  const preBuildPending = pendingFrom(android, control.operatorGateGroups.preBuildAndUpload);
  const artifactPending = pendingFrom(android, control.operatorGateGroups.artifactAndTrack);
  const smokePending = pendingFrom(android, control.operatorGateGroups.postInstallValidation);
  const observation = internalObservation(control, android, observedAt);

  let state = control.classification.engineeringReadyExternalBlocked;
  if (observedPhase30.accepted && preBuildPending.length === 0) {
    if (artifactPending.length > 0) state = control.classification.readyForOperatorBuildAndUpload;
    else if (!observation.satisfied) state = control.classification.internalDraftObserving;
    else if (smokePending.length > 0) state = control.classification.internalDraftUploadedAwaitingDeviceSmoke;
    else state = control.classification.internalReleaseValidated;
  }

  return {
    schemaVersion: 1,
    phase: 31,
    program: control.program,
    candidate: control.candidate,
    applicationId: control.applicationId,
    observedAt,
    state,
    engineeringContract: 'READY',
    phase30Outcome: observedPhase30,
    internalTrackObservation: observation,
    pendingExternalEvidence: {
      preBuildAndUpload: preBuildPending,
      artifactAndTrack: artifactPending,
      postInstallValidation: smokePending,
    },
    playTrack: control.policy.playTrack,
    playAutomationMaximumStatus: control.policy.playAutomationMaximumStatus,
    publicStoreReleaseAuthorized: false,
    commercialLaunchAuthorized: false,
    safetyBoundary: 'Engineering readiness is complete independently; real payment, RC promotion, Play provider setup, signing evidence, upload evidence, elapsed observation time and physical-device evidence are never fabricated by CI.',
  };
}

async function writeReport(report) {
  await fs.mkdir(path.join(ROOT, '.artifacts'), { recursive: true });
  await fs.writeFile(path.join(ROOT, OUTPUT_PATH), `${JSON.stringify(report, null, 2)}\n`);
  console.log('Nvet Care — Phase 31 Android Play Internal Release');
  console.log(`Candidate: ${report.candidate}`);
  console.log(`Engineering contract: ${report.engineeringContract}`);
  console.log(`State: ${report.state}`);
  console.log(`Internal observation: ${report.internalTrackObservation.elapsedHours}/${report.internalTrackObservation.requiredHours}h`);
  for (const [group, gates] of Object.entries(report.pendingExternalEvidence)) {
    for (const gate of gates) console.log(`BLOCKED_EXTERNAL | ${group}.${gate}`);
  }
  if (!report.phase30Outcome.provided) console.log('BLOCKED_EXTERNAL | Phase 30 real observation outcome not provided');
  if (report.pendingExternalEvidence.artifactAndTrack.length === 0 && !report.internalTrackObservation.satisfied) {
    console.log('BLOCKED_TIME | minimum Internal Testing observation window has not elapsed');
  }

  if (process.env.GITHUB_STEP_SUMMARY) {
    const pending = Object.entries(report.pendingExternalEvidence)
      .flatMap(([group, gates]) => gates.map((gate) => `- ${group}: \`${gate}\``));
    const lines = [
      '# Nvet Care — Phase 31 Android Play Internal Release',
      '',
      `Candidate: \`${report.candidate}\``,
      `State: **${report.state}**`,
      `Engineering contract: **${report.engineeringContract}**`,
      `Phase 30 runtime outcome supplied: **${report.phase30Outcome.provided}**`,
      `Internal observation: **${report.internalTrackObservation.elapsedHours}/${report.internalTrackObservation.requiredHours}h**`,
      '',
      ...(pending.length ? ['## Pending external/operator evidence', '', ...pending, ''] : []),
      '> Phase 31 stops at Google Play Internal Testing draft automation and never authorizes production-track or commercial release.',
    ];
    await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
  }
}

const contract = await validateContract();
if (!contractOnly) {
  const report = await buildReport(contract);
  await writeReport(report);
  if (enforceOperatorReady && report.state === contract.control.classification.engineeringReadyExternalBlocked) {
    fail(`operator-ready enforcement requested but state=${report.state}`);
  }
}
