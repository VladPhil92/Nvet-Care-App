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

function requireGate(label, entry) {
  if (!entry || !['pending', 'verified'].includes(entry.status)) {
    fail(`${label} must exist with pending/verified status`);
  }
  if (entry.status === 'verified' && !hasEvidence(entry)) {
    fail(`${label} is verified without concrete evidence`);
  }
}

async function readGithubEvent() {
  const eventName = process.env.GITHUB_EVENT_NAME?.trim() ?? '';
  const eventPath = process.env.GITHUB_EVENT_PATH?.trim();
  if (!eventPath) return { eventName, payload: null };
  try {
    return {
      eventName,
      payload: JSON.parse(await fs.readFile(eventPath, 'utf8')),
    };
  } catch {
    return { eventName, payload: null };
  }
}

function prNumberFromMergeMessage(message) {
  if (typeof message !== 'string') return null;
  const match = message.match(/Merge pull request #(\d+)\b|\(#(\d+)\)\s*$/m);
  const value = Number(match?.[1] ?? match?.[2]);
  return Number.isInteger(value) && value > 0 ? value : null;
}

async function diffProtected(fromSha, toSha, protectedPaths) {
  if (!fromSha || !toSha || fromSha === '0000000000000000000000000000000000000000') return [];
  const raw = await git(['diff', '--name-only', fromSha, toSha, '--', ...protectedPaths]);
  return raw ? raw.split('\n').filter(Boolean) : [];
}

async function currentChangeContext(protectedPaths) {
  const { eventName, payload } = await readGithubEvent();
  if (!payload) {
    return { eventName, prNumber: null, labels: [], protectedProductDrift: [] };
  }

  if (eventName === 'pull_request') {
    const pr = payload.pull_request ?? {};
    const labels = (pr.labels ?? []).map((label) => label?.name).filter(Boolean);
    return {
      eventName,
      prNumber: Number(pr.number ?? payload.number) || null,
      labels,
      protectedProductDrift: await diffProtected(pr.base?.sha, pr.head?.sha, protectedPaths),
    };
  }

  if (eventName === 'push') {
    return {
      eventName,
      prNumber: prNumberFromMergeMessage(payload.head_commit?.message ?? ''),
      labels: [],
      protectedProductDrift: await diffProtected(payload.before, payload.after ?? 'HEAD', protectedPaths),
    };
  }

  return { eventName, prNumber: null, labels: [], protectedProductDrift: [] };
}

function authorizedCurrentReleaseBlocker(blockers, candidate, change) {
  if (!Number.isInteger(change.prNumber) || change.prNumber <= 0) return null;
  if (change.eventName === 'pull_request' && !change.labels.includes('release-blocker')) return null;
  return (
    (blockers.blockers ?? []).find(
      (entry) =>
        entry.prNumber === change.prNumber &&
        entry.candidate === candidate &&
        entry.status === 'open' &&
        entry.severity === 'release-blocking',
    ) ?? null
  );
}

async function candidateRelationship(control, freeze, blockers) {
  const candidateSha = control.candidateCommitSha;
  if (!/^[0-9a-f]{40}$/i.test(candidateSha)) fail('candidateCommitSha must be a full git SHA');
  try {
    await git(['cat-file', '-e', `${candidateSha}^{commit}`]);
    await git(['merge-base', '--is-ancestor', candidateSha, 'HEAD']);
  } catch {
    fail(`candidate commit ${candidateSha} must exist and be an ancestor of HEAD`);
  }

  const protectedPaths = freeze.governance?.protectedProductPaths ?? [];
  if (!Array.isArray(protectedPaths) || protectedPaths.length === 0) {
    fail('Phase 27 protectedProductPaths must remain non-empty');
  }

  const cumulativeRaw = await git(['diff', '--name-only', candidateSha, 'HEAD', '--', ...protectedPaths]);
  const productDrift = cumulativeRaw ? cumulativeRaw.split('\n').filter(Boolean) : [];
  const currentChange = await currentChangeContext(protectedPaths);
  const authorized = currentChange.protectedProductDrift.length > 0
    ? authorizedCurrentReleaseBlocker(blockers, control.candidate, currentChange)
    : null;

  if (
    control.prePromotionRequirements?.requiredProductDriftFromCandidate === false &&
    currentChange.protectedProductDrift.length > 0 &&
    !authorized
  ) {
    fail(
      `current change introduces protected product drift without an authorized release-blocker: ${currentChange.protectedProductDrift.join(', ')}`,
    );
  }

  return {
    candidateSha,
    productDrift,
    currentProtectedProductDrift: currentChange.protectedProductDrift,
    currentChangePrNumber: currentChange.prNumber,
    authorizedReleaseBlockerPr: authorized?.prNumber ?? null,
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
    'freeze', 'blockers', 'rcReadiness', 'globalReadiness', 'releaseClosure',
    'rcEvidenceClosure', 'operatorEvidence', 'androidReadiness', 'betaReadiness',
  ];
  for (const key of requiredInputKeys) {
    if (typeof inputs[key] !== 'string' || !inputs[key]) fail(`missing authoritative input '${key}'`);
  }

  const values = await Promise.all(requiredInputKeys.map((key) => readJson(inputs[key])));
  const [freeze, blockers, rc, globalManifest, releaseClosure, rcEvidenceClosure, operatorEvidence, android, beta] = values;
  const candidate = control.candidate;
  for (const [label, value] of [
    ['freeze', freeze.candidate], ['blockers', blockers.candidate], ['rc', rc.candidate],
    ['global', globalManifest.candidate], ['releaseClosure', releaseClosure.candidate],
    ['rcEvidenceClosure', rcEvidenceClosure.candidate], ['operatorEvidence', operatorEvidence.candidate],
    ['androidPrerequisite', android.prerequisiteRcTag], ['betaPrerequisite', beta.prerequisiteRcTag],
  ]) {
    if (value !== candidate) fail(`${label} candidate '${value}' diverges from '${candidate}'`);
  }

  if (freeze.phase !== 27 || freeze.state !== 'FROZEN' || freeze.governance?.featureFreezeActive !== true) {
    fail('Phase 27 must remain FROZEN with feature freeze active');
  }
  if (freeze.scope?.commercialLaunchAuthorized !== false || freeze.scope?.publicStoreReleaseAuthorized !== false) {
    fail('Phase 27 commercial/store launch must remain unauthorized');
  }
  if (freeze.packageIdentity?.androidVersionName !== candidate) fail('Android frozen versionName must match candidate');
  if (control.promotion?.tag !== candidate || control.promotion?.targetSha !== control.candidateCommitSha) {
    fail('promotion tag/target must remain bound to candidate');
  }
  if (control.promotion?.postPromotionEvidenceGate !== 'rc-promoted' || control.promotion?.postPromotionEvidenceKind !== 'git-tag') {
    fail('post-promotion evidence contract drifted');
  }

  const operatorGate = (operatorEvidence.gates ?? []).find((gate) => gate.id === 'rc-promoted');
  if (!operatorGate || !operatorGate.evidenceKinds?.includes('git-tag')) fail('Operator Evidence Control must register rc-promoted/git-tag');
  if (operatorGate.sourceManifest !== 'android' || operatorGate.sourceKey !== 'requiredEvidence.rcPromoted') {
    fail('rc-promoted must project to Android readiness');
  }
  if (!(operatorGate.mirrors ?? []).some((mirror) => mirror.sourceManifest === 'beta' && mirror.sourceKey === 'requiredEvidence.rcPromoted')) {
    fail('rc-promoted must mirror to beta readiness');
  }

  for (const key of control.prePromotionRequirements?.requiredRcEvidence ?? []) {
    requireGate(`rc.requiredExternalEvidence.${key}`, rc.requiredExternalEvidence?.[key]);
  }
  for (const id of control.prePromotionRequirements?.requiredOperatorGates ?? []) {
    requireGate(`global.operatorGates.${id}`, (globalManifest.operatorGates ?? []).find((entry) => entry.id === id));
  }
  requireGate('android.requiredEvidence.rcPromoted', android.requiredEvidence?.rcPromoted);
  requireGate('beta.requiredEvidence.rcPromoted', beta.requiredEvidence?.rcPromoted);
  if (android.requiredEvidence.rcPromoted.status !== beta.requiredEvidence.rcPromoted.status ||
      (android.requiredEvidence.rcPromoted.evidence ?? null) !== (beta.requiredEvidence.rcPromoted.evidence ?? null)) {
    fail('Android and beta rcPromoted projection must remain converged');
  }

  if (releaseClosure.stages?.rc?.source !== inputs.rcReadiness) fail('release closure RC stage must source RC_READINESS');
  const promotionRequired = new Set(rcEvidenceClosure.promotion?.requiredGateIds ?? []);
  for (const id of ['production-backup-configured', 'provider-restore-drill', 'real-transfer-rail', 'main-branch-protection']) {
    if (!promotionRequired.has(id)) fail(`RC evidence closure must require '${id}'`);
  }

  const relation = await candidateRelationship(control, freeze, blockers);
  return { control, blockers, rc, globalManifest, android, beta, relation };
}

function buildReport({ control, blockers, rc, globalManifest, android, beta, relation }) {
  const reasons = [];
  const openBlockers = (blockers.blockers ?? []).filter((entry) => entry.status === 'open');
  if (control.prePromotionRequirements?.requiredEmptyBlockerRegistry && openBlockers.length > 0) {
    reasons.push(...openBlockers.map((entry) => `release-blocker:${entry.id ?? entry.prNumber ?? 'unknown'}`));
  }
  for (const key of control.prePromotionRequirements.requiredRcEvidence) {
    if (rc.requiredExternalEvidence[key].status !== 'verified') reasons.push(`rc.requiredExternalEvidence.${key}`);
  }
  for (const id of control.prePromotionRequirements.requiredOperatorGates) {
    const entry = globalManifest.operatorGates.find((gate) => gate.id === id);
    if (entry.status !== 'verified') reasons.push(`global.operatorGates.${id}`);
  }
  if (relation.productDrift.length > 0) reasons.push('protected-product-drift');

  const alreadyPromoted = android.requiredEvidence.rcPromoted.status === 'verified' && beta.requiredEvidence.rcPromoted.status === 'verified';
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
      currentProtectedProductDrift: relation.currentProtectedProductDrift,
      currentChangePrNumber: relation.currentChangePrNumber,
      authorizedReleaseBlockerPr: relation.authorizedReleaseBlockerPr,
      openReleaseBlockers: openBlockers.length,
    },
    rcEvidence: Object.fromEntries(control.prePromotionRequirements.requiredRcEvidence.map((key) => [key, {
      status: rc.requiredExternalEvidence[key].status,
      evidence: rc.requiredExternalEvidence[key].evidence ?? null,
    }])),
    repositoryGovernance: Object.fromEntries(control.prePromotionRequirements.requiredOperatorGates.map((id) => {
      const gate = globalManifest.operatorGates.find((entry) => entry.id === id);
      return [id, { status: gate.status, evidence: gate.evidence ?? null }];
    })),
    postPromotionProjection: {
      gate: control.promotion.postPromotionEvidenceGate,
      androidStatus: android.requiredEvidence.rcPromoted.status,
      betaStatus: beta.requiredEvidence.rcPromoted.status,
      authority: 'Operator Evidence Control',
      automaticApproval: false,
    },
    manualBoundary: reasons.length === 1 && reasons[0] === 'rc.requiredExternalEvidence.paymentRailVerified'
      ? control.manualBoundary
      : null,
    safetyBoundary: 'Cumulative protected drift and open release blockers remain promotion blockers. Only current-change drift is used to decide whether the present PR itself violates the freeze.',
  };
}

async function writeReport(report) {
  await fs.mkdir(path.join(ROOT, '.artifacts'), { recursive: true });
  await fs.writeFile(path.join(ROOT, OUTPUT_PATH), `${JSON.stringify(report, null, 2)}\n`);
  console.log('Nvet Care — Phase 28 Controlled RC Promotion');
  console.log(`Candidate: ${report.candidate}`);
  console.log(`State: ${report.state}`);
  console.log(`Cumulative protected drift: ${report.productFreeze.protectedProductDrift.length}`);
  console.log(`Current-change protected drift: ${report.productFreeze.currentProtectedProductDrift.length}`);
  for (const blocker of report.promotion.blockers) console.log(`BLOCKED | ${blocker}`);

  if (process.env.GITHUB_STEP_SUMMARY) {
    const lines = [
      '# Nvet Care — Phase 28 Controlled RC Promotion',
      '',
      `Candidate: \`${report.candidate}\``,
      `State: **${report.state}**`,
      `Open release blockers: **${report.productFreeze.openReleaseBlockers}**`,
      `Cumulative protected drift: **${report.productFreeze.protectedProductDrift.length}**`,
      `Current-change protected drift: **${report.productFreeze.currentProtectedProductDrift.length}**`,
      `Authorized current release-blocker PR: **${report.productFreeze.authorizedReleaseBlockerPr ?? 'none'}**`,
      '',
      ...(report.promotion.blockers.length
        ? ['## Promotion blockers', '', ...report.promotion.blockers.map((item) => `- \`${item}\``)]
        : ['No pre-promotion blockers remain.']),
      '',
      '> Promotion is not commercial launch; external/operator evidence remains authoritative.',
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
