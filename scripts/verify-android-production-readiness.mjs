import fs from 'node:fs/promises';

const MANIFEST_PATH = new URL('../docs/production/ANDROID_PRODUCTION_READINESS.json', import.meta.url);
const ANDROID_BUILD_PATH = new URL('../mobile/android/build.gradle', import.meta.url);
const APP_BUILD_PATH = new URL('../mobile/android/app/build.gradle', import.meta.url);
const WRAPPER_PATH = new URL('../mobile/android/gradle/wrapper/gradle-wrapper.properties', import.meta.url);
const RELEASE_WORKFLOW_PATH = new URL('../.github/workflows/release-android.yml', import.meta.url);
const allowedEvidenceStates = new Set(['pending', 'verified']);
const REQUIRED_EVIDENCE_KEYS = [
  'rcPromoted',
  'playConsoleAppCreated',
  'playAppSigningEnabled',
  'uploadCertificatePinned',
  'privacyPolicyPublished',
  'dataSafetyReviewed',
  'signedAabVerified',
  'internalTrackUploaded',
  'physicalDeviceSmokeVerified',
  'android16BehaviorReviewCompleted',
];
const args = new Set(process.argv.slice(2));
const contractOnly = args.has('--contract-only');
const runtimeAudit = args.has('--runtime');
const enforce = process.env.ANDROID_ENFORCE === 'true';

function fail(message) {
  throw new Error(message);
}

function statusLine(ok, label, detail) {
  return `${ok ? 'PASS' : 'BLOCKED'} | ${label} | ${detail}`;
}

async function readText(url) {
  return fs.readFile(url, 'utf8');
}

function requireMatch(text, pattern, label) {
  if (!pattern.test(text)) fail(`Android production contract mismatch: ${label}`);
}

async function readManifest() {
  const manifest = JSON.parse(await readText(MANIFEST_PATH));

  if (manifest.schemaVersion !== 1) fail('Android manifest schemaVersion must be 1.');
  if (manifest.phase !== 13) fail('Android manifest phase must be 13.');
  if (manifest.program !== 'android-production') fail('Unexpected Android production program.');
  if (manifest.applicationId !== 'com.nvetcare') fail('Phase 13 applicationId must remain com.nvetcare.');
  if (manifest.requiredTargetApi !== 36) fail('Phase 13 target API must be 36.');
  if (typeof manifest.prerequisiteRcTag !== 'string' || !/^1\.0\.0-rc\.\d+$/.test(manifest.prerequisiteRcTag)) {
    fail('prerequisiteRcTag must use the 1.0.0-rc.N format.');
  }

  for (const key of ['minInternalTrackObservationHours', 'minPhysicalDevices', 'requiredAndroidMajor']) {
    if (!Number.isInteger(manifest.policy?.[key]) || manifest.policy[key] <= 0) {
      fail(`Invalid Android policy value: ${key}`);
    }
  }
  if (manifest.policy.releaseWorkflow !== 'release-android.yml') {
    fail('Unexpected Android release workflow contract.');
  }

  const evidence = manifest.requiredEvidence;
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
    fail('requiredEvidence is required.');
  }
  const actual = Object.keys(evidence).sort();
  const expected = [...REQUIRED_EVIDENCE_KEYS].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail(`requiredEvidence must contain exactly: ${REQUIRED_EVIDENCE_KEYS.join(', ')}`);
  }
  for (const key of REQUIRED_EVIDENCE_KEYS) {
    const entry = evidence[key];
    if (!allowedEvidenceStates.has(entry?.status)) fail(`Invalid evidence status for ${key}.`);
    if (entry.status === 'verified' && (typeof entry.evidence !== 'string' || entry.evidence.trim().length < 3)) {
      fail(`Verified Android evidence ${key} must include a concrete reference.`);
    }
  }

  return manifest;
}

async function validateRepositoryContract() {
  const [androidBuild, appBuild, wrapper, releaseWorkflow] = await Promise.all([
    readText(ANDROID_BUILD_PATH),
    readText(APP_BUILD_PATH),
    readText(WRAPPER_PATH),
    readText(RELEASE_WORKFLOW_PATH),
  ]);

  requireMatch(androidBuild, /compileSdkVersion\s*=\s*36\b/, 'compileSdkVersion=36');
  requireMatch(androidBuild, /targetSdkVersion\s*=\s*36\b/, 'targetSdkVersion=36');
  requireMatch(androidBuild, /com\.android\.tools\.build:gradle:8\.10\.1/, 'AGP 8.10.1');
  requireMatch(wrapper, /gradle-8\.11\.1-all\.zip/, 'Gradle 8.11.1 wrapper');
  requireMatch(appBuild, /applicationId\s+["']com\.nvetcare["']/, 'applicationId com.nvetcare');

  for (const contract of [
    ['production environment', /environment:\s*production/],
    ['immutable release_ref input', /release_ref:/],
    ['release tag checkout', /ref:\s*\$\{\{\s*github\.event\.inputs\.release_ref\s*\}\}/],
    ['certificate fingerprint pin', /ANDROID_UPLOAD_CERT_SHA256/],
    ['AAB signature verification', /jarsigner -verify\s+["']?\$AAB/],
    ['AAB SHA-256 evidence', /app-release\.aab\.sha256/],
    ['release metadata evidence', /release-metadata\.json/],
    ['tagged artifact SHA traceability', /execFileSync\('git', \['rev-parse', 'HEAD'\]/],
    ['Node 24-compatible checkout action', /actions\/checkout@v7/],
    ['Node 24-compatible setup-node action', /actions\/setup-node@v7/],
    ['Node 24-compatible setup-java action', /actions\/setup-java@v5/],
    ['Node 24-compatible artifact action', /actions\/upload-artifact@v7/],
  ]) {
    requireMatch(releaseWorkflow, contract[1], contract[0]);
  }
}

function githubHeaders() {
  const token = process.env.GITHUB_TOKEN;
  return {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function githubWorkflowRuns(repo, workflow, paramsObject = {}) {
  const params = new URLSearchParams({ per_page: '20', ...paramsObject });
  const response = await fetch(
    `https://api.github.com/repos/${repo}/actions/workflows/${encodeURIComponent(workflow)}/runs?${params}`,
    { headers: githubHeaders() },
  );
  if (!response.ok) fail(`GitHub Actions API failed for ${repo}/${workflow}: HTTP ${response.status}`);
  const payload = await response.json();
  return Array.isArray(payload.workflow_runs) ? payload.workflow_runs : [];
}

async function refExists(repo, tag) {
  const response = await fetch(`https://api.github.com/repos/${repo}/git/ref/tags/${encodeURIComponent(tag)}`, {
    headers: githubHeaders(),
  });
  if (response.status === 404) return false;
  if (!response.ok) fail(`GitHub tag API failed for ${repo}: HTTP ${response.status}`);
  return true;
}

async function auditRuntime(manifest) {
  const repo = process.env.GITHUB_REPOSITORY || 'VladPhil92/Nvet-Care-App';
  const sha = process.env.GITHUB_SHA;
  if (!sha || !/^[0-9a-f]{40}$/i.test(sha)) fail('GITHUB_SHA is required for Android runtime audit.');

  const [ciRuns, releaseRuns, rcTagExists] = await Promise.all([
    githubWorkflowRuns(repo, 'ci.yml', { branch: 'main', head_sha: sha }),
    githubWorkflowRuns(repo, manifest.policy.releaseWorkflow, { event: 'workflow_dispatch' }),
    refExists(repo, manifest.prerequisiteRcTag),
  ]);

  const checks = [];
  checks.push({
    ok: rcTagExists,
    label: `RC promotion tag ${manifest.prerequisiteRcTag}`,
    detail: rcTagExists ? 'tag exists' : 'tag not present',
  });

  const ci = ciRuns.find((run) => run.head_sha === sha);
  checks.push({
    ok: ci?.status === 'completed' && ci?.conclusion === 'success',
    label: 'main CI on current Phase 13 SHA',
    detail: ci ? `${ci.status}/${ci.conclusion ?? 'none'} run=${ci.id}` : 'no successful CI run for current SHA',
  });

  const releaseRun = releaseRuns.find((run) => run.conclusion === 'success');
  checks.push({
    ok: Boolean(releaseRun),
    label: 'signed Android release workflow',
    detail: releaseRun ? `successful run=${releaseRun.id}` : 'no successful signed Release Android run',
  });

  for (const key of REQUIRED_EVIDENCE_KEYS) {
    const entry = manifest.requiredEvidence[key];
    checks.push({
      ok: entry.status === 'verified',
      label: `android evidence: ${key}`,
      detail: entry.status === 'verified' ? entry.evidence : 'pending operator/provider evidence',
    });
  }

  const blocked = checks.filter((check) => !check.ok);
  const report = [
    `Nvet Care Phase 13 ${manifest.program} readiness`,
    `main SHA: ${sha}`,
    '',
    ...checks.map((check) => statusLine(check.ok, check.label, check.detail)),
    '',
    blocked.length === 0
      ? 'READY: all Android production rollout gates are satisfied.'
      : `NOT READY: ${blocked.length} gate(s) remain blocked.`,
  ].join('\n');
  console.log(`${report}\n`);

  if (process.env.GITHUB_STEP_SUMMARY) {
    const markdown = [
      '# Nvet Care — Android Production Readiness',
      '',
      `Main SHA: \`${sha}\``,
      '',
      '| Gate | Result | Evidence |',
      '|---|---|---|',
      ...checks.map(
        (check) =>
          `| ${check.label} | ${check.ok ? 'PASS' : 'BLOCKED'} | ${String(check.detail).replaceAll('|', '\\|')} |`,
      ),
      '',
      blocked.length === 0
        ? '**READY for controlled Google Play production rollout.**'
        : `**NOT READY:** ${blocked.length} gate(s) remain blocked.`,
      '',
    ].join('\n');
    await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, markdown);
  }

  if (enforce && blocked.length > 0) process.exitCode = 1;
}

const manifest = await readManifest();
await validateRepositoryContract();
console.log(`Phase 13 contract valid: ${manifest.program} targetApi=${manifest.requiredTargetApi}`);

if (runtimeAudit) {
  await auditRuntime(manifest);
} else if (!contractOnly) {
  console.log('Use --runtime for live evidence audit or --contract-only for schema validation.');
}
