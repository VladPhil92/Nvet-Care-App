import fs from 'node:fs/promises';

const MANIFEST_PATH = new URL('../docs/production/RC_READINESS.json', import.meta.url);
const allowedEvidenceStates = new Set(['pending', 'verified']);
const args = new Set(process.argv.slice(2));
const contractOnly = args.has('--contract-only');
const runtimeAudit = args.has('--runtime');
const machineOnly = args.has('--machine-only');
const enforce = process.env.RC_ENFORCE === 'true';

const railwayImpactingPaths = [
  /^backend\//,
  /^scripts\/railway-staging-bootstrap\.mjs$/,
  /^Dockerfile\.railway$/,
  /^railway\.json$/,
  /^package\.json$/,
  /^package-lock\.json$/,
  /^\.github\/workflows\/railway-contract\.yml$/,
  /^\.github\/workflows\/deploy-backend\.yml$/,
  /^\.github\/workflows\/provision-staging\.yml$/,
];

// A TRANSFER certification may only be reused across changes that cannot alter
// the payment lifecycle or the staging target/credential contract. Any such
// change invalidates the previous run and requires the staging flow to execute
// again. This prevents a fresh-but-stale financial proof from surviving later
// code or certification-infrastructure changes.
const paymentRailImpactingPaths = [
  /^backend\//,
  /^package\.json$/,
  /^package-lock\.json$/,
  /^scripts\/certify-transfer-payment-rail\.mjs$/,
  /^scripts\/railway-staging-session\.mjs$/,
  /^\.github\/workflows\/payment-rail-certification\.yml$/,
  /^\.github\/workflows\/staging-e2e\.yml$/,
];

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

function githubHeaders(includeToken = true) {
  const token = process.env.GITHUB_TOKEN;
  return {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(includeToken && token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function readManifest() {
  const raw = await fs.readFile(MANIFEST_PATH, 'utf8');
  const manifest = JSON.parse(raw);

  if (manifest.schemaVersion !== 1) fail('RC manifest schemaVersion must be 1.');
  if (manifest.phase !== 11) fail('RC manifest phase must be 11.');
  if (typeof manifest.candidate !== 'string' || !/^1\.0\.0-rc\.\d+$/.test(manifest.candidate)) {
    fail('RC candidate must use the 1.0.0-rc.N format.');
  }

  for (const key of [
    'productionCanaryMaxAgeHours',
    'stagingE2eMaxAgeHours',
    'ctgOneAccessCanaryMaxAgeHours',
    'recoveryDrillMaxAgeHours',
    'alertDrillMaxAgeHours',
    'paymentRailApplicationMaxAgeHours',
  ]) {
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

async function githubRuns(repo, { allowPublicFallback = false } = {}) {
  const url = `https://api.github.com/repos/${repo}/actions/runs?branch=main&per_page=100`;
  let response = await fetch(url, { headers: githubHeaders(true) });

  if (!response.ok && allowPublicFallback) {
    response = await fetch(url, { headers: githubHeaders(false) });
  }

  if (!response.ok) fail(`GitHub Actions API failed for ${repo}: HTTP ${response.status}`);
  const payload = await response.json();
  return Array.isArray(payload.workflow_runs) ? payload.workflow_runs : [];
}

async function githubCompare(repo, base, head) {
  const response = await fetch(`https://api.github.com/repos/${repo}/compare/${base}...${head}`, {
    headers: githubHeaders(true),
  });
  if (!response.ok) fail(`GitHub compare API failed for ${repo}: HTTP ${response.status}`);
  const payload = await response.json();
  if (!Array.isArray(payload.files)) fail('GitHub compare response did not contain files.');
  if (payload.files.length >= 300) {
    fail('GitHub compare reached the 300-file safety boundary; evidence cannot be reused safely.');
  }
  return payload;
}

function latestRun(runs, name, predicate = () => true) {
  return runs.find((run) => run?.name === name && predicate(run));
}

function isRailwayImpactingPath(path) {
  return railwayImpactingPaths.some((pattern) => pattern.test(path));
}

function isPaymentRailImpactingPath(path) {
  return paymentRailImpactingPaths.some((pattern) => pattern.test(path));
}

async function resolveRailwayEvidence(nvetRuns, repo, sha) {
  const exact = latestRun(
    nvetRuns,
    'Railway Contract',
    (run) => run.head_sha === sha && run.status === 'completed' && run.conclusion === 'success',
  );
  if (exact) {
    return {
      ok: true,
      detail: `exact candidate success run=${exact.id}`,
    };
  }

  const baseline = latestRun(
    nvetRuns,
    'Railway Contract',
    (run) => run.status === 'completed' && run.conclusion === 'success' && /^[0-9a-f]{40}$/i.test(run.head_sha || ''),
  );
  if (!baseline) {
    return { ok: false, detail: 'no successful Railway Contract baseline on main' };
  }

  const comparison = await githubCompare(repo, baseline.head_sha, sha);
  if (!['ahead', 'identical'].includes(comparison.status)) {
    return {
      ok: false,
      detail: `Railway baseline is not a safe ancestor of candidate (compare status=${comparison.status ?? 'unknown'})`,
    };
  }

  const changedFiles = comparison.files.map((file) => file?.filename).filter(Boolean);
  const impacting = changedFiles.filter(isRailwayImpactingPath);
  if (impacting.length > 0) {
    return {
      ok: false,
      detail: `Railway-impacting changes since run=${baseline.id}: ${impacting.slice(0, 5).join(', ')}`,
    };
  }

  return {
    ok: true,
    detail: `reused run=${baseline.id} sha=${baseline.head_sha.slice(0, 7)}; ${changedFiles.length} later file change(s), none Railway-impacting`,
  };
}

async function resolvePaymentRailEvidence(nvetRuns, repo, sha, maxAgeHours) {
  const candidates = nvetRuns.filter(
    (run) =>
      run?.name === 'Nvet Transfer Payment Rail Certification' &&
      run.head_branch === 'main' &&
      run.status === 'completed' &&
      run.conclusion === 'success' &&
      /^[0-9a-f]{40}$/i.test(run.head_sha || ''),
  );

  for (const run of candidates) {
    const age = hoursSince(run.updated_at || run.created_at);
    if (age > maxAgeHours) continue;

    if (run.head_sha === sha) {
      return {
        ok: true,
        detail: `${age.toFixed(1)}h old exact candidate run=${run.id}; CLIENT→VET→ADMIN lifecycle only`,
      };
    }

    const comparison = await githubCompare(repo, run.head_sha, sha);
    if (!['ahead', 'identical'].includes(comparison.status)) continue;

    const changedFiles = comparison.files.map((file) => file?.filename).filter(Boolean);
    const impacting = changedFiles.filter(isPaymentRailImpactingPath);
    if (impacting.length > 0) {
      return {
        ok: false,
        detail: `latest fresh run=${run.id} invalidated by payment-impacting changes: ${impacting.slice(0, 5).join(', ')}`,
      };
    }

    return {
      ok: true,
      detail: `${age.toFixed(1)}h old run=${run.id} safely reused across ${changedFiles.length} non-payment change(s); CLIENT→VET→ADMIN lifecycle only`,
    };
  }

  return {
    ok: false,
    detail: 'no fresh successful staging TRANSFER application certification',
  };
}

async function auditRuntime(manifest) {
  const repo = process.env.GITHUB_REPOSITORY || 'VladPhil92/Nvet-Care-App';
  const sha = process.env.RC_CANDIDATE_SHA || process.env.GITHUB_SHA;
  if (!sha || !/^[0-9a-f]{40}$/i.test(sha)) {
    fail('RC_CANDIDATE_SHA or GITHUB_SHA is required for runtime RC audit.');
  }

  const [nvetRuns, ctgRuns] = await Promise.all([
    githubRuns(repo),
    githubRuns('VladPhil92/ctg_one_website', { allowPublicFallback: true }),
  ]);

  const checks = [];

  const ci = latestRun(nvetRuns, 'CI', (run) => run.head_sha === sha);
  checks.push({
    ok: ci?.status === 'completed' && ci?.conclusion === 'success',
    label: 'main CI on candidate SHA',
    detail: ci ? `${ci.status}/${ci.conclusion ?? 'none'} run=${ci.id}` : 'no run for candidate SHA',
  });

  const railway = await resolveRailwayEvidence(nvetRuns, repo, sha);
  checks.push({
    ok: railway.ok,
    label: 'Railway deployment contract evidence',
    detail: railway.detail,
  });

  const backendCanary = latestRun(nvetRuns, 'Nvet Production Backend Health Canary', (run) => run.conclusion === 'success' && run.event !== 'push');
  const backendCanaryAge = backendCanary ? hoursSince(backendCanary.updated_at || backendCanary.created_at) : Number.POSITIVE_INFINITY;
  checks.push({
    ok: Boolean(backendCanary) && backendCanaryAge <= manifest.policy.productionCanaryMaxAgeHours,
    label: 'production backend canary freshness',
    detail: backendCanary
      ? `${backendCanaryAge.toFixed(1)}h old run=${backendCanary.id}`
      : 'no successful real production backend canary',
  });

  const recovery = latestRun(nvetRuns, 'Nvet Recovery Readiness', (run) => run.conclusion === 'success');
  const recoveryAge = recovery ? hoursSince(recovery.updated_at || recovery.created_at) : Number.POSITIVE_INFINITY;
  checks.push({
    ok: Boolean(recovery) && recoveryAge <= manifest.policy.recoveryDrillMaxAgeHours,
    label: 'application recovery rehearsal freshness',
    detail: recovery
      ? `${recoveryAge.toFixed(1)}h old run=${recovery.id}`
      : 'no successful Nvet Recovery Readiness run',
  });

  const currentStagingPreflight = process.env.RC_STAGING_PREFLIGHT_CURRENT === 'true';
  const staging = latestRun(nvetRuns, 'Staging E2E Seed & Preflight', (run) => run.conclusion === 'success');
  const stagingAge = staging ? hoursSince(staging.updated_at || staging.created_at) : Number.POSITIVE_INFINITY;
  checks.push({
    ok: currentStagingPreflight || (Boolean(staging) && stagingAge <= manifest.policy.stagingE2eMaxAgeHours),
    label: 'isolated staging E2E freshness',
    detail: currentStagingPreflight
      ? 'verified in current convergence run: candidate revision + CLIENT/VET auth + emergency discovery'
      : staging
        ? `${stagingAge.toFixed(1)}h old run=${staging.id}`
        : 'no successful staging E2E run or current preflight proof',
  });

  const transferRail = await resolvePaymentRailEvidence(
    nvetRuns,
    repo,
    sha,
    manifest.policy.paymentRailApplicationMaxAgeHours,
  );
  checks.push({
    ok: transferRail.ok,
    label: 'TRANSFER application rail certification freshness',
    detail: transferRail.detail,
  });

  const ctgCanary = latestRun(ctgRuns, 'Nvet Production Access Canary', (run) => run.conclusion === 'success');
  const ctgCanaryAge = ctgCanary ? hoursSince(ctgCanary.updated_at || ctgCanary.created_at) : Number.POSITIVE_INFINITY;
  checks.push({
    ok: Boolean(ctgCanary) && ctgCanaryAge <= manifest.policy.ctgOneAccessCanaryMaxAgeHours,
    label: 'ctgone.com -> Nvet access canary freshness',
    detail: ctgCanary ? `${ctgCanaryAge.toFixed(1)}h old run=${ctgCanary.id}` : 'no successful CTG One access canary',
  });

  if (!machineOnly) {
    const alertDrill = latestRun(
      nvetRuns,
      'Nvet Production Backend Health Canary',
      (run) => run.event === 'push' && run.conclusion === 'success',
    );
    const alertDrillAge = alertDrill ? hoursSince(alertDrill.updated_at || alertDrill.created_at) : Number.POSITIVE_INFINITY;
    checks.push({
      ok: Boolean(alertDrill) && alertDrillAge <= manifest.policy.alertDrillMaxAgeHours,
      label: 'synthetic production alert drill freshness',
      detail: alertDrill
        ? `${alertDrillAge.toFixed(1)}h old run=${alertDrill.id}`
        : 'no successful isolated synthetic alert drill',
    });

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
