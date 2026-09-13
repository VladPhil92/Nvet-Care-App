import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTROL_PATH = 'docs/production/PHASE_32_SOFTWARE_SUPPLY_CHAIN.json';
const args = process.argv.slice(2);
const contractOnly = args.includes('--contract-only');
const sbomIndex = args.indexOf('--sbom');
const sbomArg = sbomIndex >= 0
  ? args[sbomIndex + 1]
  : args.find((arg) => arg.startsWith('--sbom='))?.slice('--sbom='.length);

function fail(message) {
  throw new Error(`Phase 32 supply-chain mismatch: ${message}`);
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

async function sha256(relativePath) {
  const bytes = await fs.readFile(path.join(ROOT, relativePath));
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function requireIncludes(text, token, label) {
  if (!text.includes(token)) fail(label);
}

function validateLockfile(lock, control) {
  if (lock.lockfileVersion !== control.policy.requiredLockfileVersion) {
    fail(`package-lock.json must remain lockfileVersion ${control.policy.requiredLockfileVersion}`);
  }
  if (!lock.packages || typeof lock.packages !== 'object') fail('package-lock.json packages map is missing');

  let remotePackages = 0;
  let integrityProtected = 0;
  for (const [packagePath, entry] of Object.entries(lock.packages)) {
    if (!entry || typeof entry !== 'object') continue;
    const resolved = entry.resolved;
    if (typeof resolved !== 'string' || resolved.length === 0) continue;

    if (/^(?:http|git):\/\//i.test(resolved)) {
      fail(`insecure resolved URL at ${packagePath}: ${resolved}`);
    }

    if (/^https:\/\//i.test(resolved)) {
      remotePackages += 1;
      const integrity = entry.integrity;
      if (typeof integrity !== 'string' || !/^(?:sha256|sha384|sha512)-[A-Za-z0-9+/=]+/.test(integrity)) {
        fail(`registry dependency lacks supported integrity at ${packagePath}`);
      }
      integrityProtected += 1;
    }
  }

  if (remotePackages === 0) fail('no remote dependencies were found in the lockfile');
  if (remotePackages !== integrityProtected) fail('not every remote dependency is integrity protected');
  return { remotePackages, integrityProtected };
}

function validateSbom(sbom) {
  if (typeof sbom.spdxVersion !== 'string' || !sbom.spdxVersion.startsWith('SPDX-')) {
    fail('SBOM is not SPDX JSON');
  }
  if (!Array.isArray(sbom.packages) || sbom.packages.length === 0) fail('SBOM contains no packages');
  if (typeof sbom.SPDXID !== 'string') fail('SBOM root SPDXID is missing');
  return { spdxVersion: sbom.spdxVersion, packageCount: sbom.packages.length };
}

async function validateContract() {
  const control = await readJson(CONTROL_PATH);
  if (control.schemaVersion !== 1 || control.phase !== 32 || control.program !== 'software-supply-chain-artifact-provenance') {
    fail('schemaVersion/phase/program is invalid');
  }
  if (control.candidate !== '1.0.0-rc.2' || control.prerequisitePhase !== 31) fail('candidate or prerequisite phase drifted');
  const policy = control.policy ?? {};
  for (const key of [
    'failClosed', 'packageLockRequired', 'rejectInsecureResolvedUrls',
    'requireIntegrityForRegistryDependencies', 'sbomRequired', 'sha256ManifestRequired',
    'buildProvenanceRequired', 'sbomAttestationRequired', 'releaseArtifactAttestationRequired',
    'secretsNeverCommitted',
  ]) {
    if (policy[key] !== true) fail(`policy '${key}' must remain enabled`);
  }
  if (policy.runtimeCodeChangesAllowed !== false) fail('Phase 32 must not authorize runtime code changes');
  if (policy.requiredLockfileVersion !== 3 || policy.sbomFormat !== 'spdx' || policy.sbomType !== 'application') {
    fail('lockfile/SBOM policy drifted');
  }
  if (policy.publicStoreReleaseAuthorized !== false || policy.commercialLaunchAuthorized !== false) {
    fail('Phase 32 must not authorize public/commercial release');
  }

  for (const input of Object.values(control.authoritativeInputs ?? {})) {
    if (typeof input !== 'string' || !(await exists(input))) fail(`missing authoritative input '${input}'`);
  }
  for (const input of control.releaseCriticalInputs ?? []) {
    if (!(await exists(input))) fail(`missing release-critical input '${input}'`);
  }

  const [phase31, freeze, blockers, global, rootPackage, lock, releaseWorkflow, phase32Workflow] = await Promise.all([
    readJson(control.authoritativeInputs.phase31),
    readJson(control.authoritativeInputs.freeze),
    readJson(control.authoritativeInputs.blockers),
    readJson(control.authoritativeInputs.globalReadiness),
    readJson(control.authoritativeInputs.rootPackage),
    readJson(control.authoritativeInputs.rootLockfile),
    readText(control.authoritativeInputs.releaseWorkflow),
    readText(control.authoritativeInputs.phase32Workflow),
  ]);

  if (phase31.phase !== 31 || phase31.program !== 'android-play-internal-release' || phase31.candidate !== control.candidate) {
    fail('Phase 31 prerequisite contract is invalid');
  }
  if (freeze.phase !== 27 || freeze.state !== 'FROZEN' || freeze.candidate !== control.candidate) {
    fail('frozen release-candidate contract is not intact');
  }
  if ((blockers.blockers ?? []).some((entry) => entry.status === 'open')) fail('release blocker registry contains an open blocker');
  if (rootPackage.name !== 'nvet-care-platform' || rootPackage.private !== true) fail('root package identity drifted');

  const lockMetrics = validateLockfile(lock, control);
  const phase32Gate = (global.engineeringGates ?? []).find((gate) => gate.id === 'software-supply-chain-provenance');
  if (!phase32Gate || phase32Gate.status !== 'verified') fail('GLOBAL_READINESS must register Phase 32 as verified engineering');
  for (const evidencePath of [
    CONTROL_PATH,
    'docs/production/PHASE_32_SOFTWARE_SUPPLY_CHAIN.md',
    'scripts/verify-software-supply-chain-phase32.mjs',
    '.github/workflows/software-supply-chain-phase32.yml',
  ]) {
    if (!phase32Gate.evidencePaths?.includes(evidencePath)) fail(`GLOBAL_READINESS Phase 32 gate is missing ${evidencePath}`);
  }

  const pins = control.requiredWorkflowControls;
  for (const [label, sha] of [
    ['checkout', pins.checkoutPinnedSha],
    ['setup-node', pins.setupNodePinnedSha],
    ['upload-artifact', pins.uploadArtifactPinnedSha],
    ['attest', pins.attestPinnedSha],
  ]) {
    requireIncludes(phase32Workflow, `@${sha}`, `Phase 32 workflow must pin ${label} to ${sha}`);
  }
  for (const [label, sha] of [
    ['checkout', pins.checkoutPinnedSha],
    ['setup-node', pins.setupNodePinnedSha],
    ['setup-java', pins.setupJavaPinnedSha],
    ['upload-artifact', pins.uploadArtifactPinnedSha],
    ['attest', pins.attestPinnedSha],
  ]) {
    requireIncludes(releaseWorkflow, `@${sha}`, `Android release workflow must pin ${label} to ${sha}`);
  }
  requireIncludes(phase32Workflow, 'npm sbom --sbom-format=spdx --sbom-type=application', 'Phase 32 workflow must generate the canonical SPDX SBOM');
  requireIncludes(phase32Workflow, 'id-token: write', 'Phase 32 workflow must grant OIDC permission for attestations');
  requireIncludes(phase32Workflow, 'attestations: write', 'Phase 32 workflow must grant attestation permission');
  requireIncludes(releaseWorkflow, 'npm sbom --sbom-format=spdx --sbom-type=application', 'Android release must generate an SPDX SBOM');
  requireIncludes(releaseWorkflow, 'sbom-path:', 'Android release must generate an SBOM attestation');
  requireIncludes(releaseWorkflow, 'subject-path:', 'Android release must generate build provenance');

  return { control, lockMetrics };
}

async function writeEvidence(control, lockMetrics) {
  const outDir = path.join(ROOT, control.reporting.directory);
  await fs.mkdir(outDir, { recursive: true });

  const inputHashes = [];
  for (const relativePath of control.releaseCriticalInputs) {
    inputHashes.push({ path: relativePath, sha256: await sha256(relativePath) });
  }
  inputHashes.sort((a, b) => a.path.localeCompare(b.path));
  const checksumLines = inputHashes.map(({ path: relativePath, sha256: digest }) => `${digest}  ${relativePath}`).join('\n');
  await fs.writeFile(path.join(ROOT, control.reporting.checksums), `${checksumLines}\n`);

  let sbom = null;
  if (sbomArg) sbom = validateSbom(await readJson(sbomArg));
  else if (!contractOnly) fail('full Phase 32 verification requires --sbom <SPDX JSON path>');

  const report = {
    schemaVersion: 1,
    phase: 32,
    program: control.program,
    candidate: control.candidate,
    state: sbom ? control.classification.evidenceReady : control.classification.contractReady,
    observedAt: new Date().toISOString(),
    lockfile: {
      version: control.policy.requiredLockfileVersion,
      ...lockMetrics,
    },
    sbom,
    releaseCriticalInputs: inputHashes,
    attestationPolicy: {
      action: control.policy.attestAction,
      buildProvenanceRequired: true,
      sbomAttestationRequired: true,
      releaseArtifactAttestationRequired: true,
    },
    externalEvidenceSatisfied: false,
    publicStoreReleaseAuthorized: false,
    commercialLaunchAuthorized: false,
  };
  await fs.writeFile(path.join(ROOT, control.reporting.report), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

const { control, lockMetrics } = await validateContract();
const report = await writeEvidence(control, lockMetrics);
console.log('Nvet Care — Phase 32 Software Supply Chain & Artifact Provenance');
console.log(`State: ${report.state}`);
console.log(`Remote lockfile dependencies protected: ${lockMetrics.integrityProtected}/${lockMetrics.remotePackages}`);
if (report.sbom) console.log(`SPDX packages: ${report.sbom.packageCount}`);
