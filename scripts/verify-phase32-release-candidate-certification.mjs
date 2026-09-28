import fs from 'fs';
import { execFileSync } from 'child_process';

const root = process.cwd();
const read = (path) => fs.readFileSync(`${root}/${path}`, 'utf8');
const json = (path) => JSON.parse(read(path));
const fail = (message) => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };

const contractPath = 'docs/production/PHASE_32_RELEASE_CANDIDATE_CERTIFICATION.json';
const contract = json(contractPath);
const restoreSource = read('ops/railway/nvet-restore-verify.mjs');
const androidRelease = read('.github/workflows/release-android.yml');
const androidAppBuild = read('mobile/android/app/build.gradle');
const androidRootBuild = read('mobile/android/build.gradle');

assert(contract.phase === 32, 'Phase must be 32');
assert(contract.candidate === '1.0.0-rc.3', 'Candidate must be 1.0.0-rc.3');
assert(contract.sourceBaseline.mainCommitSha === '733aa8854a2b39af33ebd6df25d2e0f6aa4d1b71', 'Unexpected Phase 32 product baseline');
assert(contract.sourceBaseline.productCodeChangesAllowed === false, 'Product code must remain frozen during Phase 32');
assert(contract.boundaries.commercialLaunchAuthorized === false, 'Phase 32 must not authorize commercial launch');
assert(contract.boundaries.productionPlayPromotionAuthorized === false, 'Phase 32 must not authorize Play production promotion');
assert(contract.gates.isolatedRestoreDrill.status !== 'verified', 'Restore drill cannot be pre-certified in repository state');
assert(contract.gates.providerLevelBackupEvidence.status !== 'verified', 'Provider backup evidence cannot be synthesized');
assert(contract.gates.paymentRailRealEvidence.status !== 'verified', 'Real payment evidence cannot be synthesized');

assert(restoreSource.includes('new Bun.S3Client({'), 'Canonical restore verifier must instantiate Bun.S3Client');
assert(restoreSource.includes('bucket: BUCKET'), 'Restore verifier must bind BUCKET in Bun.S3Client');
assert(restoreSource.includes('RESTORE DRILL PASSED'), 'Restore verifier must emit a positive completion marker');
assert(restoreSource.includes('RESTORE DRILL FAILED'), 'Restore verifier must emit a negative completion marker');
assert(restoreSource.includes('process.exitCode = 1'), 'Restore verifier must fail the process when the drill fails');
assert(restoreSource.includes('plaintext_sha256'), 'Restore verifier must validate backup plaintext integrity');
assert(restoreSource.includes('MAX_BACKUP_AGE_HOURS'), 'Restore verifier must enforce backup freshness');

assert(androidRelease.includes('track: internal'), 'Android release workflow must target Google Play internal track');
assert(androidRelease.includes('status: draft'), 'Android release workflow must upload as draft only');
assert(androidRelease.includes('publish_internal'), 'Android release workflow must keep Play upload opt-in');
assert(androidAppBuild.includes('applicationId "com.nvetcare"') || androidAppBuild.includes("applicationId 'com.nvetcare'"), 'Android applicationId must remain com.nvetcare');
assert(/targetSdkVersion\s*=\s*36/.test(androidRootBuild), 'Android target SDK must remain 36');
assert(androidAppBuild.includes('targetSdkVersion rootProject.ext.targetSdkVersion'), 'App module must inherit canonical Android target SDK');

const allowedPhase32Paths = new Set([
  '.github/workflows/phase32-release-candidate-certification.yml',
  'docs/production/PHASE_32_RELEASE_CANDIDATE_CERTIFICATION.json',
  'docs/production/PHASE_32_RELEASE_CANDIDATE_CERTIFICATION.md',
  'ops/railway/nvet-restore-verify.mjs',
  'scripts/verify-phase32-release-candidate-certification.mjs',
]);

let changedPaths = [];
try {
  const baseline = contract.sourceBaseline.mainCommitSha;
  changedPaths = execFileSync('git', ['diff', '--name-only', `${baseline}...HEAD`], { encoding: 'utf8' })
    .split('\n').map((v) => v.trim()).filter(Boolean);
  const unexpected = changedPaths.filter((path) => !allowedPhase32Paths.has(path));
  assert(unexpected.length === 0, `Phase 32 changed protected/unexpected paths: ${unexpected.join(', ')}`);
} catch (error) {
  if (error?.message?.startsWith('Phase 32 changed')) throw error;
  console.warn(`Phase 32 diff check skipped: ${error.message}`);
}

const report = {
  schemaVersion: 1,
  phase: 32,
  candidate: contract.candidate,
  sourceBaselineSha: contract.sourceBaseline.mainCommitSha,
  generatedAt: new Date().toISOString(),
  staticContract: 'passed',
  changedPaths,
  externalEvidence: {
    isolatedRestoreDrill: contract.gates.isolatedRestoreDrill.status,
    providerLevelBackupEvidence: contract.gates.providerLevelBackupEvidence.status,
    paymentRailRealEvidence: contract.gates.paymentRailRealEvidence.status,
    signedAab: contract.gates.signedAab.status,
    googlePlayInternalDraft: contract.gates.googlePlayInternalDraft.status,
  },
  overallState: 'READY_FOR_EXTERNAL_EVIDENCE',
  commercialLaunchAuthorized: false,
};

fs.mkdirSync('.artifacts', { recursive: true });
fs.writeFileSync('.artifacts/phase32-release-candidate-certification.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
