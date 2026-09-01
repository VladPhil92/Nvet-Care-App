import fs from 'node:fs/promises';

const MANIFEST_PATH = new URL('../docs/production/RC_READINESS.json', import.meta.url);
const allowedEvidenceStates = new Set(['pending', 'verified']);
const args = new Set(process.argv.slice(2));
const contractOnly = args.has('--contract-only');
const runtimeAudit = args.has('--runtime');
const machineOnly = args.has('--machine-only');
const enforce = process.env.RC_ENFORCE === 'true';

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

  if (manifest.schemaVersion !== 1) fail('RC manifest schemaVersion must be 1.');
  if (manifest.phase !== 11) fail('RC manifest phase must be 11.');
  if (typeof manifest.candidate !== 'string' || !/^1\.0\.0-rc\.\d+$/.test(manifest.candidate)) {
    fail('RC candidate must use the 1.0.0-rc.N format.');
  }

  for (const key of ['productionCanaryMaxAgeHours', 'stagingE2eMaxAgeHours', 'ctgOneAccessCanaryMaxAgeHours']) {
    const value = manifest.policy?.[key];
    if (!Number.isFinite(value) || value <= 0) fail(`Invalid RC policy value: ${key}`);
  }

  const evidence = manifest.requiredExternalEvidence;
  if (!evidence || typeof evidence !== 'object') fail('requiredExternalEvidence is required.');
  for (const [key, entry] of Object.entries(evidence)) {
    if (!allowedEvidenceStates.has(entry?.status)) fail(`Invalid evidence status for ${key}.`);
    if (entry.status === 'verified' && (typeof entry.evidence !== 'string' || entry.evidence.trim().length < 3)) {
      fail(`Verified evidence ${key} must include a concrete evidence reference.`);
    }
  }

  return manifest;
}

async function githubRuns(repo) {
  const token = process.env.GITHUB_TOKEN;
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const response = await fetch(`https://api.github.com/repos/${repo}/actions/runs?branch=main&per_page=100`, { headers });
  if (!response.ok) fail(`GitHub Actions API failed for ${repo}: HTTP ${response.status}`);
  const payload = await response.json();
  return Array.isArray(payload.workflow_runs) ? payload.workflow_runs : [];
}

function latestRun(runs, name, predicate = () => true) {
  return runs.find((run) => run?.name === name && predicate(run));
}

async function auditRuntime(manifest) {
  const repo = process.env.GITHUB_REPOSITORY || 'VladPhil92/Nvet-Care-App';
  const sha = process.env.GITHUB_SHA;
  if (!sha || !/^[0-9a-f]{40}$/i.test(sha)) fail('GITHUB_SHA is required for runtime RC audit.');

  const [nvetRuns, ctgRuns] = await Promise.all([
    githubRuns(repo),
    githubRuns('VladPhil92/ctg_one_website'),
  ]);

  const checks = [];

  const ci = latestRun(nvetRuns, 'CI', (run) => run.head_sha === sha);
  checks.push({
    ok: ci?.status === 'completed' && ci?.conclusion === 'success',
    label: 'main CI on candidate SHA',
    detail: ci ? `${ci.status}/${ci.conclusion ?? 'none'} run=${ci.id}` : 'no run for current SHA',
  });

  const railway = latestRun(nvetRuns, 'Railway Contract', (run) => run.head_sha === sha);
  checks.push({
    ok: railway?.status === 'completed' && railway?.conclusion === 'success',
    label: 'Railway contract on candidate SHA',
    detail: railway ? `${railway.status}/${railway.conclusion ?? 'none'} run=${railway.id}` : 'no run for current SHA',
  });

  const backendCanary = latestRun(nvetRuns, 'Nvet Production Backend Health Canary', (run) => run.conclusion === 'success');
  const backendCanaryAge = backendCanary ? hoursSince(backendCanary.updated_at || backendCanary.created_at) : Number.POSITIVE_INFINITY;
  checks.push({
    ok: Boolean(backendCanary) && backendCanaryAge <= manifest.policy.productionCanaryMaxAgeHours,
    label: 'production backend canary freshness',
    detail: backendCanary
      ? `${backendCanaryAge.toFixed(1)}h old run=${backendCanary.id}`
      : 'no successful production backend canary',
  });

  const staging = latestRun(nvetRuns, 'Staging E2E Seed & Preflight', (run) => run.conclusion === 'success');
  const stagingAge = staging ? hoursSince(staging.updated_at || staging.created_at) : Number.POSITIVE_INFINITY;
  checks.push({
    ok: Boolean(staging) && stagingAge <= manifest.policy.stagingE2eMaxAgeHours,
    label: 'isolated staging E2E freshness',
    detail: staging ? `${stagingAge.toFixed(1)}h old run=${staging.id}` : 'no successful staging E2E run',
  });

  const ctgCanary = latestRun(ctgRuns, 'Nvet Production Access Canary', (run) => run.conclusion === 'success');
  const ctgCanaryAge = ctgCanary ? hoursSince(ctgCanary.updated_at || ctgCanary.created_at) : Number.POSITIVE_INFINITY;
  checks.push({
    ok: Boolean(ctgCanary) && ctgCanaryAge <= manifest.policy.ctgOneAccessCanaryMaxAgeHours,
    label: 'ctgone.com -> Nvet access canary freshness',
    detail: ctgCanary ? `${ctgCanaryAge.toFixed(1)}h old run=${ctgCanary.id}` : 'no successful CTG One access canary',
  });

  if (!machineOnly) {
    for (const [key, entry] of Object.entries(manifest.requiredExternalEvidence)) {
      checks.push({
        ok: entry.status === 'verified',
        label: `external evidence: ${key}`,
        detail: entry.status === 'verified' ? entry.evidence : 'pending provider/operator evidence',
      });
    }
  }

  const blocked = checks.filter((check) => !check.ok);
  const scope = machineOnly ? 'machine-gate' : 'full';
  const lines = [
    `Nvet Care ${manifest.candidate} readiness audit (${scope})`,
    `candidate SHA: ${sha}`,
    '',
    ...checks.map((check) => statusLine(check.ok, check.label, check.detail)),
    '',
    blocked.length === 0
      ? machineOnly
        ? 'READY: all machine RC gates are satisfied; operator/provider evidence remains a separate promotion gate.'
        : 'READY: all machine and external RC gates are satisfied.'
      : `NOT READY: ${blocked.length} ${scope} gate(s) remain blocked.`,
  ];
  const report = `${lines.join('\n')}\n`;
  console.log(report);

  if (process.env.GITHUB_STEP_SUMMARY) {
    const markdown = [
      `# Nvet Care ${manifest.candidate} readiness (${scope})`,
      '',
      `Candidate SHA: \`${sha}\``,
      '',
      '| Gate | Result | Evidence |',
      '|---|---|---|',
      ...checks.map((check) => `| ${check.label} | ${check.ok ? 'PASS' : 'BLOCKED'} | ${String(check.detail).replaceAll('|', '\\|')} |`),
      '',
      blocked.length === 0
        ? machineOnly
          ? '**Machine gates READY. External provider/operator evidence is still required for RC promotion.**'
          : '**READY for RC promotion.**'
        : `**NOT READY:** ${blocked.length} ${scope} gate(s) remain blocked.`,
      '',
    ].join('\n');
    await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, markdown);
  }

  if (enforce && blocked.length > 0) process.exitCode = 1;
}

const manifest = await readManifest();
console.log(`RC contract valid: ${manifest.candidate}`);

if (machineOnly && !runtimeAudit) {
  fail('--machine-only requires --runtime.');
}

if (runtimeAudit) {
  await auditRuntime(manifest);
} else if (!contractOnly) {
  console.log('Use --runtime for live evidence audit, --runtime --machine-only for technical gates, or --contract-only for schema validation.');
}
