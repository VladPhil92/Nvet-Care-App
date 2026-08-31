import fs from 'node:fs/promises';

const MANIFEST_PATH = new URL('../docs/production/BETA_CARTAGENA_READINESS.json', import.meta.url);
const allowedEvidenceStates = new Set(['pending', 'verified']);
const args = new Set(process.argv.slice(2));
const contractOnly = args.has('--contract-only');
const runtimeAudit = args.has('--runtime');
const enforce = process.env.BETA_ENFORCE === 'true';

function fail(message) {
  throw new Error(message);
}

function hoursSince(iso) {
  const ms = Date.now() - Date.parse(iso);
  return Number.isFinite(ms) ? ms / 3_600_000 : Number.POSITIVE_INFINITY;
}

function statusLine(ok, label, detail) {
  return `${ok ? 'PASS' : 'BLOCKED'} | ${label} | ${detail}`;
}

async function readManifest() {
  const raw = await fs.readFile(MANIFEST_PATH, 'utf8');
  const manifest = JSON.parse(raw);

  if (manifest.schemaVersion !== 1) fail('Beta manifest schemaVersion must be 1.');
  if (manifest.phase !== 12) fail('Beta manifest phase must be 12.');
  if (manifest.program !== 'closed-beta-cartagena') fail('Unexpected beta program.');
  if (manifest.targetMarket !== 'Cartagena de Indias') fail('Phase 12 market must remain Cartagena de Indias.');
  if (typeof manifest.prerequisiteRcTag !== 'string' || !/^1\.0\.0-rc\.\d+$/.test(manifest.prerequisiteRcTag)) {
    fail('prerequisiteRcTag must use the 1.0.0-rc.N format.');
  }

  for (const key of ['maxInitialClients', 'minVerifiedVets', 'observationWindowDays', 'criticalIncidentTargetMinutes']) {
    const value = manifest.policy?.[key];
    if (!Number.isInteger(value) || value <= 0) fail(`Invalid beta policy value: ${key}`);
  }
  if (manifest.policy.maxInitialClients > 500) fail('Initial beta cohort is too large for a closed beta.');
  if (manifest.policy.bookingKillSwitch !== 'NVET_BOOKING_ENABLED=false') {
    fail('Unexpected booking kill-switch contract.');
  }
  if (manifest.policy.cohortGate !== 'NVET_CLOSED_BETA_ENABLED=true') {
    fail('Unexpected cohort-gate contract.');
  }

  const evidence = manifest.requiredEvidence;
  if (!evidence || typeof evidence !== 'object') fail('requiredEvidence is required.');
  for (const [key, entry] of Object.entries(evidence)) {
    if (!allowedEvidenceStates.has(entry?.status)) fail(`Invalid evidence status for ${key}.`);
    if (entry.status === 'verified' && (typeof entry.evidence !== 'string' || entry.evidence.trim().length < 3)) {
      fail(`Verified beta evidence ${key} must include a concrete reference.`);
    }
  }

  return manifest;
}

function githubHeaders() {
  const token = process.env.GITHUB_TOKEN;
  return {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function githubRuns(repo) {
  const response = await fetch(`https://api.github.com/repos/${repo}/actions/runs?branch=main&per_page=100`, {
    headers: githubHeaders(),
  });
  if (!response.ok) fail(`GitHub Actions API failed for ${repo}: HTTP ${response.status}`);
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

function latestRun(runs, name, predicate = () => true) {
  return runs.find((run) => run?.name === name && predicate(run));
}

async function auditRuntime(manifest) {
  const repo = process.env.GITHUB_REPOSITORY || 'VladPhil92/Nvet-Care-App';
  const sha = process.env.GITHUB_SHA;
  if (!sha || !/^[0-9a-f]{40}$/i.test(sha)) fail('GITHUB_SHA is required for beta runtime audit.');

  const [nvetRuns, ctgRuns, rcTagExists] = await Promise.all([
    githubRuns(repo),
    githubRuns('VladPhil92/ctg_one_website'),
    refExists(repo, manifest.prerequisiteRcTag),
  ]);

  const checks = [];

  checks.push({
    ok: rcTagExists,
    label: `RC promotion tag ${manifest.prerequisiteRcTag}`,
    detail: rcTagExists ? 'tag exists' : 'tag not present',
  });

  const ci = latestRun(nvetRuns, 'CI', (run) => run.head_sha === sha);
  checks.push({
    ok: ci?.status === 'completed' && ci?.conclusion === 'success',
    label: 'main CI on current Phase 12 SHA',
    detail: ci ? `${ci.status}/${ci.conclusion ?? 'none'} run=${ci.id}` : 'no CI run for current SHA',
  });

  const backendCanary = latestRun(
    nvetRuns,
    'Nvet Production Backend Health Canary',
    (run) => run.conclusion === 'success',
  );
  const backendAge = backendCanary
    ? hoursSince(backendCanary.updated_at || backendCanary.created_at)
    : Number.POSITIVE_INFINITY;
  checks.push({
    ok: Boolean(backendCanary) && backendAge <= 6,
    label: 'production backend canary freshness',
    detail: backendCanary ? `${backendAge.toFixed(1)}h old run=${backendCanary.id}` : 'no successful canary',
  });

  const ctgCanary = latestRun(
    ctgRuns,
    'Nvet Production Access Canary',
    (run) => run.conclusion === 'success',
  );
  const ctgAge = ctgCanary
    ? hoursSince(ctgCanary.updated_at || ctgCanary.created_at)
    : Number.POSITIVE_INFINITY;
  checks.push({
    ok: Boolean(ctgCanary) && ctgAge <= 6,
    label: 'ctgone.com -> Nvet access canary freshness',
    detail: ctgCanary ? `${ctgAge.toFixed(1)}h old run=${ctgCanary.id}` : 'no successful CTG One access canary',
  });

  for (const [key, entry] of Object.entries(manifest.requiredEvidence)) {
    checks.push({
      ok: entry.status === 'verified',
      label: `beta evidence: ${key}`,
      detail: entry.status === 'verified' ? entry.evidence : 'pending operator/provider evidence',
    });
  }

  const blocked = checks.filter((check) => !check.ok);
  const report = [
    `Nvet Care Phase 12 ${manifest.program} readiness`,
    `main SHA: ${sha}`,
    '',
    ...checks.map((check) => statusLine(check.ok, check.label, check.detail)),
    '',
    blocked.length === 0
      ? 'READY: all closed-beta activation gates are satisfied.'
      : `NOT READY: ${blocked.length} gate(s) remain blocked.`,
  ].join('\n');
  console.log(`${report}\n`);

  if (process.env.GITHUB_STEP_SUMMARY) {
    const markdown = [
      '# Nvet Care — Cartagena Closed Beta Readiness',
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
        ? '**READY to activate the Cartagena closed beta.**'
        : `**NOT READY:** ${blocked.length} gate(s) remain blocked.`,
      '',
    ].join('\n');
    await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, markdown);
  }

  if (enforce && blocked.length > 0) process.exitCode = 1;
}

const manifest = await readManifest();
console.log(`Phase 12 contract valid: ${manifest.program}`);

if (runtimeAudit) {
  await auditRuntime(manifest);
} else if (!contractOnly) {
  console.log('Use --runtime for live evidence audit or --contract-only for schema validation.');
}
