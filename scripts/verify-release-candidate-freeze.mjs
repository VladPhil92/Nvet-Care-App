import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FREEZE_PATH = 'docs/production/RELEASE_CANDIDATE_FREEZE.json';
const BLOCKERS_PATH = 'docs/production/RELEASE_BLOCKERS.json';
const RC_PATH = 'docs/production/RC_READINESS.json';
const GLOBAL_PATH = 'docs/production/GLOBAL_READINESS.json';

function fail(message) {
  throw new Error(`Phase 27 release freeze violation: ${message}`);
}

async function readText(relativePath) {
  return fs.readFile(path.join(ROOT, relativePath), 'utf8');
}

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

async function exists(relativePath) {
  try {
    await fs.access(path.join(ROOT, relativePath));
    return true;
  } catch {
    return false;
  }
}

function fullSha(value) {
  return typeof value === 'string' && /^[0-9a-f]{40}$/i.test(value);
}

function protectedPath(file, patterns) {
  return patterns.some((pattern) =>
    pattern.endsWith('/') ? file.startsWith(pattern) : file === pattern,
  );
}

async function gitDiff(baseSha, headSha) {
  for (const sha of [baseSha, headSha]) {
    try {
      await execFileAsync('git', ['cat-file', '-e', `${sha}^{commit}`], { cwd: ROOT });
    } catch {
      fail(`cannot establish trusted diff because commit ${sha} is unavailable`);
    }
  }
  const { stdout } = await execFileAsync(
    'git',
    ['diff', '--name-only', baseSha, headSha],
    { cwd: ROOT },
  );
  return stdout
    .split('\n')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function validateBlockerRegistry(blockers, candidate) {
  if (blockers.schemaVersion !== 1) fail('release blocker registry schemaVersion must be 1');
  if (blockers.candidate !== candidate) fail('release blocker registry candidate must match freeze candidate');
  if (!Array.isArray(blockers.blockers)) fail('release blocker registry must contain a blockers array');

  const seenPrs = new Set();
  for (const blocker of blockers.blockers) {
    if (!Number.isInteger(blocker?.prNumber) || blocker.prNumber <= 0) {
      fail('each release blocker must declare a positive integer prNumber');
    }
    if (seenPrs.has(blocker.prNumber)) fail(`duplicate release blocker PR #${blocker.prNumber}`);
    seenPrs.add(blocker.prNumber);
    if (blocker.candidate !== candidate) fail(`release blocker PR #${blocker.prNumber} targets another candidate`);
    if (blocker.severity !== 'release-blocking') fail(`release blocker PR #${blocker.prNumber} must use release-blocking severity`);
    if (!['open', 'resolved'].includes(blocker.status)) fail(`release blocker PR #${blocker.prNumber} has invalid status`);
    if (typeof blocker.owner !== 'string' || blocker.owner.trim().length < 2) fail(`release blocker PR #${blocker.prNumber} needs an owner`);
    if (typeof blocker.justification !== 'string' || blocker.justification.trim().length < 10) fail(`release blocker PR #${blocker.prNumber} needs a justification`);
  }
}

const freeze = await readJson(FREEZE_PATH);
const blockers = await readJson(BLOCKERS_PATH);
const rc = await readJson(RC_PATH);
const globalReadiness = await readJson(GLOBAL_PATH);

if (freeze.schemaVersion !== 1) fail('schemaVersion must be 1');
if (freeze.phase !== 27) fail('phase must be 27');
if (freeze.program !== 'release-candidate-freeze-and-production-closure') fail('unexpected program');
if (freeze.state !== 'FROZEN') fail('candidate state must be FROZEN');
if (!/^1\.0\.0-rc\.\d+$/.test(freeze.candidate)) fail('candidate must use 1.0.0-rc.N format');
if (!fullSha(freeze.baseline?.mainCommitSha)) fail('baseline.mainCommitSha must be a full SHA');
if (!fullSha(freeze.baseline?.phase26CertifiedHeadSha)) fail('baseline.phase26CertifiedHeadSha must be a full SHA');
if (freeze.baseline.productCodeMustMatchBaselineUntilReleaseBlockerApproved !== true) fail('product baseline must be immutable outside approved release blockers');
if (freeze.scope?.marketDaneCode !== '13001') fail('Phase 27 release scope must remain Cartagena DANE 13001');
if (freeze.scope?.channel !== 'closed-beta') fail('Phase 27 channel must remain closed-beta');
if (freeze.scope?.commercialLaunchAuthorized !== false) fail('freeze cannot authorize commercial launch');
if (freeze.scope?.publicStoreReleaseAuthorized !== false) fail('freeze cannot authorize public store release');
if (freeze.governance?.featureFreezeActive !== true) fail('feature freeze must be active');
if (freeze.governance?.releaseBlockerLabel !== 'release-blocker') fail('release blocker label must be release-blocker');
if (freeze.governance?.releaseBlockerRegistry !== BLOCKERS_PATH) fail('release blocker registry path is not canonical');
if (!Array.isArray(freeze.governance?.protectedProductPaths) || freeze.governance.protectedProductPaths.length < 8) fail('protected product path policy is incomplete');

validateBlockerRegistry(blockers, freeze.candidate);

if (rc.candidate !== freeze.candidate) fail(`RC_READINESS candidate ${rc.candidate} diverges from ${freeze.candidate}`);
if (globalReadiness.candidate !== freeze.candidate) fail(`GLOBAL_READINESS candidate ${globalReadiness.candidate} diverges from ${freeze.candidate}`);
if (globalReadiness.auditBaselineSha !== freeze.baseline.mainCommitSha) fail('GLOBAL_READINESS auditBaselineSha must equal the Phase 27 frozen baseline');
if (rc.phase27Freeze?.state !== 'FROZEN') fail('RC_READINESS must expose the active Phase 27 freeze');
if (rc.phase27Freeze?.baselineMainCommitSha !== freeze.baseline.mainCommitSha) fail('RC_READINESS Phase 27 baseline diverges from freeze manifest');

for (const relativePath of freeze.certification?.requiredWorkflowFiles ?? []) {
  if (!(await exists(relativePath))) fail(`required release workflow missing: ${relativePath}`);
}
for (const relativePath of freeze.certification?.requiredContractPaths ?? []) {
  if (!(await exists(relativePath))) fail(`required release contract missing: ${relativePath}`);
}
if ((freeze.certification?.requiredWorkflowFiles ?? []).length < 10) fail('release workflow coverage is incomplete');
if ((freeze.certification?.requiredReleaseDomains ?? []).length < 10) fail('release domain coverage is incomplete');

for (const [key, value] of Object.entries(freeze.buildPerformanceBudgets ?? {})) {
  if (key.endsWith('Bytes') && (!Number.isInteger(value) || value <= 0)) fail(`invalid build performance budget ${key}`);
}
if (freeze.boundaries?.automaticProductionPromotion !== false) fail('automatic production promotion must remain disabled');
if (freeze.boundaries?.automaticCommercialLaunchAuthorization !== false) fail('automatic commercial launch authorization must remain disabled');
if (freeze.boundaries?.automaticPlayStorePublication !== false) fail('automatic Play Store publication must remain disabled');
if (freeze.boundaries?.automaticProviderConfigurationMutation !== false) fail('provider mutation must remain disabled');
if (freeze.boundaries?.manualExternalEvidenceStillRequired !== true) fail('manual external evidence boundary must remain explicit');
if (freeze.boundaries?.releaseCandidateStatusIsNotCommercialLaunch !== true) fail('RC status must remain distinct from commercial launch');

const eventName = process.env.RELEASE_FREEZE_EVENT?.trim();
const baseSha = process.env.RELEASE_FREEZE_BASE_SHA?.trim();
const headSha = process.env.RELEASE_FREEZE_HEAD_SHA?.trim();

if (eventName && baseSha && headSha && !/^0+$/.test(baseSha)) {
  const changedFiles = await gitDiff(baseSha, headSha);
  const protectedChanges = changedFiles.filter((file) =>
    protectedPath(file, freeze.governance.protectedProductPaths),
  );

  console.log(`Phase 27 diff: ${changedFiles.length} changed files; ${protectedChanges.length} protected product changes.`);
  if (protectedChanges.length > 0) {
    console.log(`Protected product changes: ${protectedChanges.join(', ')}`);
    if (eventName !== 'pull_request') {
      fail('protected product code changed outside a pull request while the release candidate is frozen');
    }

    const labels = new Set(
      (process.env.RELEASE_FREEZE_PR_LABELS ?? '')
        .split(',')
        .map((label) => label.trim())
        .filter(Boolean),
    );
    if (!labels.has(freeze.governance.releaseBlockerLabel)) {
      fail(`protected product changes require the '${freeze.governance.releaseBlockerLabel}' PR label`);
    }
    if (!changedFiles.includes(BLOCKERS_PATH)) {
      fail(`protected product changes must update ${BLOCKERS_PATH}`);
    }

    const prNumber = Number(process.env.RELEASE_FREEZE_PR_NUMBER);
    if (!Number.isInteger(prNumber) || prNumber <= 0) fail('release-blocker product change requires RELEASE_FREEZE_PR_NUMBER');
    const blocker = blockers.blockers.find((entry) => entry.prNumber === prNumber);
    if (!blocker) fail(`release blocker registry has no entry for PR #${prNumber}`);
    if (blocker.candidate !== freeze.candidate) fail(`release blocker PR #${prNumber} targets another candidate`);
    if (blocker.status !== 'open') fail(`release blocker PR #${prNumber} must remain open while product changes are under review`);
    if (blocker.severity !== 'release-blocking') fail(`release blocker PR #${prNumber} must use release-blocking severity`);
  }
}

console.log('Nvet Care — Phase 27 Release Candidate Freeze');
console.log(`Candidate: ${freeze.candidate}`);
console.log(`Baseline main: ${freeze.baseline.mainCommitSha}`);
console.log('Feature freeze: ACTIVE');
console.log('Commercial launch authorization: FALSE');
console.log('Phase 27 release freeze contract: PASS');
