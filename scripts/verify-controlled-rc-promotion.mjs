import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTROL_PATH = 'docs/production/PHASE_28_CONTROLLED_RC_PROMOTION.json';
const OUTPUT_PATH = '.artifacts/phase28-controlled-rc-promotion.json';

const args = new Set(process.argv.slice(2));
const contractOnly = args.has('--contract-only');
const enforceReady = args.has('--enforce-ready');

function fail(message) {
  throw new Error(`Phase 28 controlled promotion mismatch: ${message}`);
}

async function readJson(relativePath) {
  return JSON.parse(await fs.readFile(path.join(ROOT, relativePath), 'utf8'));
}

function hasEvidence(entry) {
  return typeof entry?.evidence === 'string' && entry.evidence.trim().length >= 3;
}

function requireGate(label, entry) {
  if (!entry || !['pending', 'verified'].includes(entry.status)) {
    fail(`${label} must exist with pending/verified status`);
  }
  if (entry.status === 'verified' && !hasEvidence(entry)) {
    fail(`${label} is verified without concrete evidence`);
  }
}

async function git(argsList, options = {}) {
  const { stdout = '' } = await execFileAsync('git', argsList, {
    cwd: ROOT,
    maxBuffer: 1024 * 1024 * 10,
    ...options,
  });
  return stdout.trim();
}

async function candidateRelationship(control, freeze) {
  const candidateSha = control.candidateCommitSha;
  if (!/^[0-9a-f]{40}$/i.test(candidateSha)) fail('candidateCommitSha must be a full git SHA');

  try {
    await git(['cat-file', '-e', `${candidateSha}^{commit}`]);
  } catch {
    fail(`candidate commit ${candidateSha} is not available in git history`);
  }

  try {
    await git(['merge-base', '--is-ancestor', candidateSha, 'HEAD']);
  } catch {
    fail(`candidate commit ${candidateSha} must be an ancestor of HEAD`);
  }

  const protectedPaths = freeze.governance?.protectedProductPaths ?? [];
  if (!Array.isArray(protectedPaths) || protectedPaths.length === 0) {
    fail('Phase 27 protectedProductPaths must remain non-empty');
  }

  const drift = await git(['diff', '--name-only', candidateSha, 'HEAD', '--', ...protectedPaths]);
  return {
    candidateSha,
    productDrift: drift ? drift.split('\n').filter(Boolean) : [],
  };
}

async function validateContract() {
  const control = await readJson(CONTROL_PATH);
  if (control.schemaVersion !== 1 || control.phase !== 28 || control.program !== 'controlled-rc-promotion') {
    fail('schemaVersion/phase/program is invalid');
  }
  if (!/^1\.0\.0-rc\.\d+$/.test(control.candidate)) fail('candidate must use 1.0.0-rc.N format');
  if (!control.policy?.failClosed || !control.policy?.promotionIsManualDispatchOnly) {
    fail('fail-closed manual-dispatch promotion policy is required');
  }
  if (!control.policy?.promotionNeverAuthorizesCommercialLaunch || !control.policy?.promotionNeverPublishesToPlayStore) {
    fail('commercial/store launch boundaries must remain explicit');
  }
  if (!control.policy?.promotionNeverApprovesOperatorEvidence || !control.policy?.postPromotionProjectionRequiresOperatorEvidenceControl) {
    fail('Operator Evidence Control must remain authoritative after promotion');
  }

  const inputs = control.authoritativeInputs ?? {};
  const requiredInputKeys = [
    'freeze',
    'blockers',
    'rcReadiness',
    'globalReadiness',
    'releaseClosure',
    'rcEvidenceClosure',
    'operatorEvidence',
    'androidReadiness',
    'betaReadiness',
  ];
  for (const key of requiredInputKeys) {
    if (typeof inputs[key] !== 'string' || !inputs[key]) fail(`missing authoritative input '${key}'`);
  }

  const [freeze, blockers, rc, globalManifest, releaseClosure, rcEvidenceClosure, operatorEvidence, android, beta] =
    await Promise.all(requiredInputKeys.map((key) => readJson(inputs[key])));

  const candidate = control.candidate;
  const candidateClaims = [
    ['freeze', freeze.candidate],
    ['blockers', blockers.candidate],
    ['rc', rc.candidate],
    ['global', globalManifest.candidate],
    ['releaseClosure', releaseClosure.candidate],
    ['rcEvidenceClosure', rcEvidenceClosure.candidate],
    ['operatorEvidence', operatorEvidence.candidate],
    ['androidPrerequisite', android.prerequisiteRcTag],
    ['betaPrerequisite', beta.prerequisiteRcTag],
  ];
  for (const [label, value] of candidateClaims) {
    if (value !== candidate) fail(`${label} candidate '${value}' diverges from '${candidate}'`);
  }

  if (freeze.phase !== 27 || freeze.state !== 'FROZEN') fail('Phase 27 must remain FROZEN');
  if (freeze.governance?.featureFreezeActive !== true) fail('Phase 27 feature freeze must remain active');
  if (freeze.scope?.commercialLaunchAuthorized !== false || freeze.scope?.publicStoreReleaseAuthorized !== false) {
    fail('Phase 27 commercial/store launch must remain unauthorized');
  }
  if (freeze.packageIdentity?.androidVersionName !== candidate) fail('Android frozen versionName must match candidate');

  if (control.promotion?.tag !== candidate) fail('promotion tag must equal candidate');
  if (control.promotion?.targetSha !== control.candidateCommitSha) fail('promotion targetSha must equal candidateCommitSha');
  if (control.promotion?.postPromotionEvidenceGate !== 'rc-promoted') fail('post-promotion evidence gate must be rc-promoted');
  if (control.promotion?.postPromotionEvidenceKind !== 'git-tag') fail('post-promotion evidence kind must be git-tag');

  const operatorGate = (operatorEvidence.gates ?? []).find((gate) => gate.id === 'rc-promoted');
  if (!operatorGate) fail('Operator Evidence Control must register rc-promoted');
  if (!operatorGate.evidenceKinds?.includes('git-tag')) fail('rc-promoted must accept git-tag evidence');
  if (operatorGate.sourceManifest !== 'android' || operatorGate.sourceKey !== 'requiredEvidence.rcPromoted') {
    fail('rc-promoted must project to Android readiness');
  }
  const betaMirror = (operatorGate.mirrors ?? []).some(
    (mirror) => mirror.sourceManifest === 'beta' && mirror.sourceKey === 'requiredEvidence.rcPromoted',
  );
  if (!betaMirror) fail('rc-promoted must mirror to beta readiness');

  const requiredRcEvidence = control.prePromotionRequirements?.requiredRcEvidence ?? [];
  for (const key of requiredRcEvidence) {
    requireGate(`rc.requiredExternalEvidence.${key}`, rc.requiredExternalEvidence?.[key]);
  }

  for (const id of control.prePromotionRequirements?.requiredOperatorGates ?? []) {
    const gate = (globalManifest.operatorGates ?? []).find((entry) => entry.id === id);
    requireGate(`global.operatorGates.${id}`, gate);
  }

  requireGate('android.requiredEvidence.rcPromoted', android.requiredEvidence?.rcPromoted);
  requireGate('beta.requiredEvidence.rcPromoted', beta.requiredEvidence?.rcPromoted);
  if (android.requiredEvidence.rcPromoted.status !== beta.requiredEvidence.rcPromoted.status) {
    fail('Android and beta rcPromoted status must remain converged');
  }
  if ((android.requiredEvidence.rcPromoted.evidence ?? null) !== (beta.requiredEvidence.rcPromoted.evidence ?? null)) {
    fail('Android and beta rcPromoted evidence must remain converged');
  }

  if (releaseClosure.stages?.rc?.source !== inputs.rcReadiness) fail('release closure RC stage must source RC_READINESS');
  const promotionRequired = new Set(rcEvidenceClosure.promotion?.requiredGateIds ?? []);
  for (const id of ['production-backup-configured', 'provider-restore-drill', 'real-transfer-rail', 'main-branch-protection']) {
    if (!promotionRequired.has(id)) fail(`RC evidence closure must require '${id}'`);
  }

  const relation = await candidateRelationship(control, freeze);
  if (control.prePromotionRequirements?.requiredProductDriftFromCandidate === false && relation.productDrift.length > 0) {
    fail(`protected product drift detected after candidate freeze: ${relation.productDrift.join(', ')}`);
  }

  return {
    control,
    freeze,
    blockers,
    rc,
    globalManifest,
    releaseClosure,
    rcEvidenceClosure,
    operatorEvidence,
    android,
    beta,
    relation,
  };
}

function buildReport(contract) {
  const { control, blockers, rc, globalManifest, android, beta, relation } = contract;
  const reasons = [];

  const openBlockers = (blockers.blockers ?? []).filter((entry) => entry.status === 'open');
  if (control.prePromotionRequirements?.requiredEmptyBlockerRegistry && openBlockers.length > 0) {
    reasons.push(...openBlockers.map((entry) => `release-blocker:${entry.id ?? entry.prNumber ?? 'unknown'}`));
  }

  for (const key of control.prePromotionRequirements.requiredRcEvidence) {
    const entry = rc.requiredExternalEvidence[key];
    if (entry.status !== 'verified') reasons.push(`rc.requiredExternalEvidence.${key}`);
  }

  for (const id of control.prePromotionRequirements.requiredOperatorGates) {
    const entry = globalManifest.operatorGates.find((gate) => gate.id === id);
    if (entry.status !== 'verified') reasons.push(`global.operatorGates.${id}`);
  }

  if (relation.productDrift.length > 0) reasons.push('protected-product-drift');

  const projectedStatus = android.requiredEvidence.rcPromoted.status;
  const alreadyPromoted = projectedStatus === 'verified' && beta.requiredEvidence.rcPromoted.status === 'verified';
  const promotionEligible = reasons.length === 0 && !alreadyPromoted;

  return {
    schemaVersion: 1,
    phase: 28,
    program: control.program,
    candidate: control.candidate,
    candidateCommitSha: control.candidateCommitSha,
    observedAt: new Date().toISOString(),
    state: alreadyPromoted ? 'PROMOTED' : promotionEligible ? 'READY_FOR_CONTROLLED_PROMOTION' : 'BLOCKED',
    promotion: {
      eligible: promotionEligible,
      alreadyPromoted,
      tag: control.promotion.tag,
      targetSha: control.promotion.targetSha,
      blockers: reasons,
    },
    productFreeze: {
      active: true,
      protectedProductDrift: relation.productDrift,
      openReleaseBlockers: openBlockers.length,
    },
    rcEvidence: Object.fromEntries(
      control.prePromotionRequirements.requiredRcEvidence.map((key) => [
        key,
        {
          status: rc.requiredExternalEvidence[key].status,
          evidence: rc.requiredExternalEvidence[key].evidence ?? null,
        },
      ]),
    ),
    repositoryGovernance: Object.fromEntries(
      control.prePromotionRequirements.requiredOperatorGates.map((id) => {
        const gate = globalManifest.operatorGates.find((entry) => entry.id === id);
        return [id, { status: gate.status, evidence: gate.evidence ?? null }];
      }),
    ),
    postPromotionProjection: {
      gate: control.promotion.postPromotionEvidenceGate,
      androidStatus: android.requiredEvidence.rcPromoted.status,
      betaStatus: beta.requiredEvidence.rcPromoted.status,
      authority: 'Operator Evidence Control',
      automaticApproval: false,
    },
    manualBoundary:
      reasons.length === 1 && reasons[0] === 'rc.requiredExternalEvidence.paymentRailVerified'
        ? control.manualBoundary
        : null,
    safetyBoundary:
      'Phase 28 may create the immutable RC tag only after all pre-promotion evidence is verified. It never authorizes commercial launch, publishes to a store, mutates provider configuration, or auto-approves operator evidence.',
  };
}

async function writeReport(report) {
  await fs.mkdir(path.join(ROOT, '.artifacts'), { recursive: true });
  await fs.writeFile(path.join(ROOT, OUTPUT_PATH), `${JSON.stringify(report, null, 2)}\n`);

  console.log('Nvet Care — Phase 28 Controlled RC Promotion');
  console.log(`Candidate: ${report.candidate}`);
  console.log(`State: ${report.state}`);
  console.log(`Target: ${report.promotion.targetSha}`);
  for (const blocker of report.promotion.blockers) console.log(`BLOCKED | ${blocker}`);

  if (process.env.GITHUB_STEP_SUMMARY) {
    const evidenceRows = Object.entries(report.rcEvidence).map(
      ([id, entry]) => `| ${id} | ${entry.status} | ${entry.evidence ? 'present' : 'none'} |`,
    );
    const lines = [
      '# Nvet Care — Phase 28 Controlled RC Promotion',
      '',
      `Candidate: \`${report.candidate}\``,
      `Target SHA: \`${report.candidateCommitSha}\``,
      `State: **${report.state}**`,
      '',
      '## RC external evidence',
      '',
      '| Gate | Status | Evidence |',
      '|---|---|---|',
      ...evidenceRows,
      '',
      `Open release blockers: **${report.productFreeze.openReleaseBlockers}**`,
      `Protected product drift: **${report.productFreeze.protectedProductDrift.length}**`,
      '',
      ...(report.promotion.blockers.length
        ? ['## Promotion blockers', '', ...report.promotion.blockers.map((item) => `- \`${item}\``), '']
        : ['No pre-promotion blockers remain.', '']),
      '> Promotion is not commercial launch. Post-promotion readiness is still projected only through approved Operator Evidence Control records.',
    ];
    await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
  }
}

const contract = await validateContract();
if (!contractOnly) {
  const report = buildReport(contract);
  await writeReport(report);
  if (enforceReady && !report.promotion.eligible && !report.promotion.alreadyPromoted) {
    fail(`promotion is blocked by ${report.promotion.blockers.join(', ')}`);
  }
}
