import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARTIFACT_PATH = path.join(ROOT, '.artifacts', 'global-readiness.json');
const MANIFEST_PATH = path.join(ROOT, 'docs', 'production', 'GLOBAL_READINESS.json');
const RAILWAY_WORKFLOW = 'railway-contract.yml';

const railwayImpactingPaths = [
  /^backend\//,
  /^ops\/recovery\//,
  /^scripts\/lib\/railway-graphql-client\.mjs$/,
  /^scripts\/railway-staging-bootstrap\.mjs$/,
  /^scripts\/audit-railway-production-backups\.mjs$/,
  /^scripts\/audit-railway-production-deployment\.mjs$/,
  /^scripts\/verify-release-candidate-readiness\.mjs$/,
  /^Dockerfile\.railway$/,
  /^railway\.json$/,
  /^package\.json$/,
  /^package-lock\.json$/,
  /^\.github\/workflows\/railway-contract\.yml$/,
  /^\.github\/workflows\/deploy-backend\.yml$/,
  /^\.github\/workflows\/provision-staging\.yml$/,
  /^\.github\/workflows\/production-backup-evidence\.yml$/,
  /^\.github\/workflows\/production-deployment-attestation\.yml$/,
  /^\.github\/workflows\/web-production-convergence\.yml$/,
];

function fail(message) {
  throw new Error(`Global runtime evidence convergence failed: ${message}`);
}

function percentage(verified, total) {
  if (total === 0) return 100;
  return Math.round((verified / total) * 10000) / 100;
}

function weightedScore(engineering, machineRuntime, external, policy) {
  const totalWeight =
    policy.engineeringWeight + policy.machineRuntimeWeight + policy.externalEvidenceWeight;
  if (Math.abs(totalWeight - 1) > 0.000001) {
    fail('scorePolicy weights must sum to 1');
  }
  return (
    Math.round(
      (engineering * policy.engineeringWeight +
        machineRuntime * policy.machineRuntimeWeight +
        external * policy.externalEvidenceWeight) *
        100,
    ) / 100
  );
}

function githubHeaders() {
  return {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
  };
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: githubHeaders() });
  if (!response.ok) {
    fail(`GitHub API request failed (${response.status}) for ${url}`);
  }
  return response.json();
}

async function workflowRuns(repo, workflow) {
  const encoded = encodeURIComponent(workflow);
  const payload = await fetchJson(
    `https://api.github.com/repos/${repo}/actions/workflows/${encoded}/runs?branch=main&per_page=100`,
  );
  return Array.isArray(payload.workflow_runs) ? payload.workflow_runs : [];
}

async function compare(repo, base, head) {
  const payload = await fetchJson(`https://api.github.com/repos/${repo}/compare/${base}...${head}`);
  if (!Array.isArray(payload.files)) {
    fail('GitHub compare response did not contain files');
  }
  if (payload.files.length >= 300) {
    fail('GitHub compare reached the 300-file safety boundary; evidence reuse is unsafe');
  }
  return payload;
}

function isRailwayImpacting(pathname) {
  return railwayImpactingPaths.some((pattern) => pattern.test(pathname));
}

async function resolveReusableRailwayEvidence(repo, candidateSha) {
  const runs = await workflowRuns(repo, RAILWAY_WORKFLOW);
  const candidates = runs.filter(
    (run) =>
      run?.head_branch === 'main' &&
      run?.status === 'completed' &&
      run?.conclusion === 'success' &&
      /^[0-9a-f]{40}$/i.test(run?.head_sha || ''),
  );

  for (const run of candidates) {
    if (run.head_sha === candidateSha) {
      return {
        ok: true,
        run,
        mode: 'exact',
        changedFiles: [],
        impactingFiles: [],
      };
    }

    const comparison = await compare(repo, run.head_sha, candidateSha);
    if (!['ahead', 'identical'].includes(comparison.status)) {
      continue;
    }

    const changedFiles = comparison.files.map((file) => file?.filename).filter(Boolean);
    const impactingFiles = changedFiles.filter(isRailwayImpacting);
    if (impactingFiles.length > 0) {
      return {
        ok: false,
        run,
        mode: 'rejected',
        changedFiles,
        impactingFiles,
      };
    }

    return {
      ok: true,
      run,
      mode: 'safe-reuse',
      changedFiles,
      impactingFiles: [],
    };
  }

  return {
    ok: false,
    run: null,
    mode: 'missing',
    changedFiles: [],
    impactingFiles: [],
  };
}

async function main() {
  const [artifactRaw, manifestRaw] = await Promise.all([
    fs.readFile(ARTIFACT_PATH, 'utf8'),
    fs.readFile(MANIFEST_PATH, 'utf8'),
  ]);

  const artifact = JSON.parse(artifactRaw);
  const manifest = JSON.parse(manifestRaw);
  const repo = artifact.repository || process.env.GITHUB_REPOSITORY || 'VladPhil92/Nvet-Care-App';
  const candidateSha = artifact.sha;

  if (!/^[0-9a-f]{40}$/i.test(candidateSha || '')) {
    fail('artifact.sha must be a full git SHA');
  }

  if (!Array.isArray(artifact.runtimeChecks) || artifact.runtimeChecks.length === 0) {
    fail('runtimeChecks are missing from the global readiness artifact');
  }

  const railway = artifact.runtimeChecks.find((check) => check.workflow === RAILWAY_WORKFLOW);
  if (!railway) {
    fail(`runtime check ${RAILWAY_WORKFLOW} is missing`);
  }

  let decision = {
    mode: railway.ok ? 'exact-existing' : 'unresolved',
    baselineRunId: railway.runId ?? null,
    baselineSha: null,
    changedFiles: [],
    impactingFiles: [],
  };

  if (!railway.ok) {
    const resolved = await resolveReusableRailwayEvidence(repo, candidateSha);
    decision = {
      mode: resolved.mode,
      baselineRunId: resolved.run?.id ?? null,
      baselineSha: resolved.run?.head_sha ?? null,
      changedFiles: resolved.changedFiles,
      impactingFiles: resolved.impactingFiles,
    };

    if (resolved.ok) {
      railway.ok = true;
      railway.runId = resolved.run.id;
      railway.status = 'completed';
      railway.conclusion = 'success';
      railway.evidenceMode = resolved.mode;
      railway.baselineSha = resolved.run.head_sha;
      railway.changedFilesSinceBaseline = resolved.changedFiles.length;
      railway.note =
        resolved.mode === 'exact'
          ? 'Exact candidate Railway Contract evidence.'
          : `Safely reused Railway Contract run ${resolved.run.id}; ${resolved.changedFiles.length} later file change(s), none Railway-impacting.`;
    } else {
      railway.evidenceMode = resolved.mode;
      railway.baselineSha = resolved.run?.head_sha ?? null;
      railway.changedFilesSinceBaseline = resolved.changedFiles.length;
      railway.note =
        resolved.mode === 'rejected'
          ? `Evidence reuse rejected because Railway-impacting paths changed: ${resolved.impactingFiles
              .slice(0, 10)
              .join(', ')}`
          : 'No successful Railway Contract baseline on main could be safely reused.';
    }
  }

  const runtimeVerified = artifact.runtimeChecks.filter((check) => check.ok).length;
  const machineRuntime = percentage(runtimeVerified, artifact.runtimeChecks.length);
  const releaseReadiness = weightedScore(
    artifact.scores.engineering,
    machineRuntime,
    artifact.scores.externalEvidence,
    manifest.scorePolicy,
  );
  const blockedExternal = [...(artifact.externalEvidence ?? []), ...(artifact.operatorGates ?? [])].filter(
    (gate) => gate.status !== 'verified',
  );

  artifact.runtimeEvidenceConvergence = {
    schemaVersion: 1,
    observedAt: new Date().toISOString(),
    policy: 'exact-or-safe-reuse',
    railwayImpactingPathCount: railwayImpactingPaths.length,
    railwayDecision: decision,
  };
  artifact.scores.machineRuntime = machineRuntime;
  artifact.scores.releaseReadiness = releaseReadiness;
  artifact.verdict =
    artifact.runtimeChecks.every((check) => check.ok) && blockedExternal.length === 0
      ? 'READY'
      : 'BLOCKED';

  await fs.writeFile(ARTIFACT_PATH, `${JSON.stringify(artifact, null, 2)}\n`);

  console.log('Nvet Care — Global Runtime Evidence Convergence');
  console.log(`Candidate: ${candidateSha}`);
  console.log(
    `Railway evidence mode: ${artifact.runtimeChecks.find((c) => c.workflow === RAILWAY_WORKFLOW)?.evidenceMode ?? 'exact-existing'}`,
  );
  console.log(`Machine runtime: ${runtimeVerified}/${artifact.runtimeChecks.length} (${machineRuntime}%)`);
  console.log(`Release readiness: ${releaseReadiness}%`);
  console.log(`Verdict: ${artifact.verdict}`);

  if (process.env.GITHUB_STEP_SUMMARY) {
    const railwayCheck = artifact.runtimeChecks.find((check) => check.workflow === RAILWAY_WORKFLOW);
    const lines = [
      '## Global Runtime Evidence Convergence',
      '',
      `- Candidate: \`${candidateSha}\``,
      `- Railway evidence: **${railwayCheck?.ok ? 'PASS' : 'BLOCKED'}** (${railwayCheck?.evidenceMode ?? 'exact-existing'})`,
      `- Machine runtime: **${machineRuntime}%**`,
      `- Weighted release readiness: **${releaseReadiness}%**`,
      `- Verdict: **${artifact.verdict}**`,
      '',
      '> Safe reuse is permitted only when the successful Railway Contract baseline is an ancestor of the candidate and no Railway-impacting path changed. External/operator gates remain untouched.',
    ];
    await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
