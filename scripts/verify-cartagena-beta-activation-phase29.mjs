import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTROL_PATH = 'docs/production/PHASE_29_CARTAGENA_BETA_ACTIVATION.json';
const OUTPUT_PATH = '.artifacts/phase29-cartagena-beta-activation.json';

const args = new Set(process.argv.slice(2));
const contractOnly = args.has('--contract-only');
const enforceReady = args.has('--enforce-ready');

function fail(message) {
  throw new Error(`Phase 29 Cartagena beta activation mismatch: ${message}`);
}

async function readJson(relativePath) {
  return JSON.parse(await fs.readFile(path.join(ROOT, relativePath), 'utf8'));
}

async function exists(relativePath) {
  try {
    await fs.access(path.join(ROOT, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function git(argsList) {
  const { stdout = '' } = await execFileAsync('git', argsList, {
    cwd: ROOT,
    maxBuffer: 1024 * 1024 * 10,
  });
  return stdout.trim();
}

function hasEvidence(entry) {
  return typeof entry?.evidence === 'string' && entry.evidence.trim().length >= 3;
}

function validateEvidenceGate(label, entry) {
  if (!entry || !['pending', 'verified'].includes(entry.status)) {
    fail(`${label} must exist with pending/verified status`);
  }
  if (entry.status === 'verified' && !hasEvidence(entry)) {
    fail(`${label} is verified without concrete evidence`);
  }
}

async function validateContract() {
  const control = await readJson(CONTROL_PATH);
  if (control.schemaVersion !== 1 || control.phase !== 29 || control.program !== 'cartagena-beta-activation') {
    fail('schemaVersion/phase/program is invalid');
  }
  if (control.targetMarket?.daneCode !== '13001') fail('target market must remain Cartagena DANE 13001');
  if (!control.policy?.failClosed || !control.policy?.requireAllBetaEvidence) {
    fail('fail-closed all-evidence policy is required');
  }
  if (
    !control.policy?.activationNeverAuthorizesCommercialLaunch ||
    !control.policy?.activationNeverMutatesProviderConfigurationAutomatically ||
    !control.policy?.activationNeverAutoApprovesEvidence ||
    !control.policy?.activationNeverCreatesSyntheticParticipants
  ) {
    fail('activation safety boundaries must remain explicit');
  }

  const inputs = control.authoritativeInputs ?? {};
  const requiredInputKeys = ['phase28', 'freeze', 'blockers', 'betaReadiness', 'operatorClosure', 'globalReadiness'];
  for (const key of requiredInputKeys) {
    if (typeof inputs[key] !== 'string' || !inputs[key]) fail(`missing authoritative input '${key}'`);
  }

  const [phase28, freeze, blockers, beta, operatorClosure, globalReadiness] = await Promise.all(
    requiredInputKeys.map((key) => readJson(inputs[key])),
  );

  const candidate = control.candidate;
  const candidateClaims = [
    ['phase28', phase28.candidate],
    ['freeze', freeze.candidate],
    ['blockers', blockers.candidate],
    ['beta', beta.prerequisiteRcTag],
    ['operatorClosure', operatorClosure.candidate],
    ['global', globalReadiness.candidate],
  ];
  for (const [label, value] of candidateClaims) {
    if (value !== candidate) fail(`${label} candidate '${value}' diverges from '${candidate}'`);
  }

  if (phase28.phase !== 28 || phase28.program !== 'controlled-rc-promotion') fail('Phase 28 prerequisite is invalid');
  if (phase28.nextStage?.phase !== 29 || phase28.nextStage?.program !== control.program) {
    fail('Phase 28 nextStage must point to Phase 29 cartagena-beta-activation');
  }
  if (freeze.phase !== 27 || freeze.state !== 'FROZEN' || freeze.governance?.featureFreezeActive !== true) {
    fail('Phase 27 release candidate freeze must remain active');
  }
  if (freeze.scope?.commercialLaunchAuthorized !== false || freeze.scope?.publicStoreReleaseAuthorized !== false) {
    fail('commercial/store launch must remain unauthorized');
  }

  if (control.operatorActivation?.commercialLaunchAuthorized !== false) fail('Phase 29 cannot authorize commercial launch');
  if (control.operatorActivation?.requiredPreEnablementDecision !== 'GO') fail('Phase 24 GO must be required before enablement');
  if (control.operatorActivation?.minimumSupportAndAuthorizationHoursBeforeObservation !== 169) {
    fail('observation floor must remain 169 hours');
  }
  if (control.operatorActivation?.maximumAuthorizationHours !== 192) fail('authorization ceiling must remain 192 hours');

  const requiredEvidence = control.requiredBetaEvidence ?? [];
  if (!Array.isArray(requiredEvidence) || requiredEvidence.length !== 10) fail('exactly ten beta evidence gates are required');
  for (const key of requiredEvidence) validateEvidenceGate(`beta.requiredEvidence.${key}`, beta.requiredEvidence?.[key]);

  const closureBlockers = new Set(operatorClosure.authorization?.declaredBlockers ?? []);
  for (const key of requiredEvidence) {
    const gate = beta.requiredEvidence[key];
    if (gate.status === 'pending' && !closureBlockers.has(key)) {
      fail(`operator closure omits pending gate '${key}'`);
    }
  }

  for (const file of control.machineContracts ?? []) {
    if (!(await exists(file))) fail(`missing machine contract '${file}'`);
  }

  const openReleaseBlockers = (blockers.blockers ?? []).filter((entry) => entry.status === 'open');
  if (openReleaseBlockers.length > 0) {
    fail(`release blocker registry contains ${openReleaseBlockers.length} open blocker(s)`);
  }

  const candidateSha = phase28.candidateCommitSha;
  if (!/^[0-9a-f]{40}$/i.test(candidateSha)) fail('Phase 28 candidate SHA must be a full git SHA');
  await git(['cat-file', '-e', `${candidateSha}^{commit}`]);
  await git(['merge-base', '--is-ancestor', candidateSha, 'HEAD']);

  const protectedPaths = freeze.governance?.protectedProductPaths ?? [];
  const drift = protectedPaths.length
    ? await git(['diff', '--name-only', candidateSha, 'HEAD', '--', ...protectedPaths])
    : '';
  const productDrift = drift ? drift.split('\n').filter(Boolean) : [];
  if (productDrift.length > 0) fail(`protected product drift detected: ${productDrift.join(', ')}`);

  let tagTarget = null;
  try {
    tagTarget = await git(['rev-list', '-n', '1', candidate]);
  } catch {
    tagTarget = null;
  }

  const rcPromoted = beta.requiredEvidence.rcPromoted;
  if (rcPromoted.status === 'verified') {
    if (!tagTarget) fail('rcPromoted is verified but the candidate tag does not exist');
    if (tagTarget !== candidateSha) fail(`candidate tag targets ${tagTarget}, expected ${candidateSha}`);
  }

  return { control, phase28, freeze, blockers, beta, operatorClosure, globalReadiness, candidateSha, tagTarget };
}

function buildReport(ctx) {
  const { control, beta, candidateSha, tagTarget } = ctx;
  const blockers = [];
  const evidence = {};

  for (const key of control.requiredBetaEvidence) {
    const entry = beta.requiredEvidence[key];
    evidence[key] = { status: entry.status, evidence: entry.evidence ?? null };
    if (entry.status !== 'verified') blockers.push(`beta.requiredEvidence.${key}`);
  }

  const allEvidenceVerified = blockers.length === 0;
  const rcPromoted = beta.requiredEvidence.rcPromoted.status === 'verified';

  return {
    schemaVersion: 1,
    phase: 29,
    program: control.program,
    candidate: control.candidate,
    candidateCommitSha: candidateSha,
    observedAt: new Date().toISOString(),
    state: allEvidenceVerified ? control.reporting.readyState : control.reporting.blockedState,
    activation: {
      eligibleForOperatorActivation: allEvidenceVerified,
      commercialLaunchAuthorized: false,
      providerMutationAutomatic: false,
      requiredPreEnablementDecision: control.operatorActivation.requiredPreEnablementDecision,
      providerGate: control.operatorActivation.providerGate,
      bookingGate: control.operatorActivation.bookingGate,
      blockers,
    },
    rcPromotion: {
      projectedVerified: rcPromoted,
      tagPresent: Boolean(tagTarget),
      tagTarget,
      expectedTarget: candidateSha,
    },
    evidence,
    manualEvidenceBoundaries: control.manualEvidenceBoundaries,
    nextStage: control.nextStage,
    safetyBoundary:
      'Phase 29 certifies eligibility only. It does not enable provider flags, create synthetic beta participants, approve evidence, authorize commercial launch, or publish to an app store.',
  };
}

async function writeReport(report) {
  await fs.mkdir(path.join(ROOT, '.artifacts'), { recursive: true });
  await fs.writeFile(path.join(ROOT, OUTPUT_PATH), `${JSON.stringify(report, null, 2)}\n`);

  console.log('Nvet Care — Phase 29 Cartagena Beta Activation');
  console.log(`Candidate: ${report.candidate}`);
  console.log(`State: ${report.state}`);
  for (const blocker of report.activation.blockers) console.log(`BLOCKED | ${blocker}`);

  if (process.env.GITHUB_STEP_SUMMARY) {
    const rows = Object.entries(report.evidence).map(
      ([id, entry]) => `| ${id} | ${entry.status} | ${entry.evidence ? 'present' : 'none'} |`,
    );
    const lines = [
      '# Nvet Care — Phase 29 Cartagena Beta Activation',
      '',
      `Candidate: \`${report.candidate}\``,
      `State: **${report.state}**`,
      `Operator activation eligible: **${report.activation.eligibleForOperatorActivation}**`,
      '',
      '| Evidence gate | Status | Evidence |',
      '|---|---|---|',
      ...rows,
      '',
      ...(report.activation.blockers.length
        ? ['## Activation blockers', '', ...report.activation.blockers.map((item) => `- \`${item}\``), '']
        : ['All versioned beta evidence gates are verified. Runtime Phase 24 GO and deliberate operator actions are still required.', '']),
      '> READY_FOR_OPERATOR_ACTIVATION is not commercial launch authorization and never mutates Railway/provider configuration automatically.',
    ];
    await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
  }
}

const contract = await validateContract();
if (!contractOnly) {
  const report = buildReport(contract);
  await writeReport(report);
  if (enforceReady && !report.activation.eligibleForOperatorActivation) {
    fail(`activation is blocked by ${report.activation.blockers.join(', ')}`);
  }
}
