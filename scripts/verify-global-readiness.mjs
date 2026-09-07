import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST_PATH = 'docs/production/GLOBAL_READINESS.json';
const args = new Set(process.argv.slice(2));
const contractOnly = args.has('--contract-only');
const runtime = args.has('--runtime');
const enforceRelease = process.env.GLOBAL_RELEASE_ENFORCE === 'true';

function fail(message) {
  throw new Error(`Global readiness contract mismatch: ${message}`);
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

function resolveGate(sourceKey, manifests) {
  const parts = sourceKey.split('.');
  const sourceName = parts.shift();
  let value = manifests[sourceName];
  if (!value) fail(`unknown source manifest '${sourceName}' in ${sourceKey}`);
  for (const part of parts) {
    value = value?.[part];
    if (value === undefined) fail(`source gate '${sourceKey}' does not exist`);
  }
  return value;
}

function percentage(verified, total) {
  if (total === 0) return 100;
  return Math.round((verified / total) * 10000) / 100;
}

function weightedScore(engineering, machineRuntime, external, policy) {
  const totalWeight = policy.engineeringWeight + policy.machineRuntimeWeight + policy.externalEvidenceWeight;
  if (Math.abs(totalWeight - 1) > 0.000001) fail('scorePolicy weights must sum to 1');
  return Math.round(
    (engineering * policy.engineeringWeight +
      machineRuntime * policy.machineRuntimeWeight +
      external * policy.externalEvidenceWeight) * 100,
  ) / 100;
}

async function validateContract() {
  const manifest = await readJson(MANIFEST_PATH);
  if (manifest.schemaVersion !== 1) fail('schemaVersion must be 1');
  if (manifest.program !== 'global-release-closure') fail('unexpected program');
  if (!/^1\.0\.0-rc\.\d+$/.test(manifest.candidate)) fail('candidate must use 1.0.0-rc.N format');
  if (!/^[0-9a-f]{40}$/i.test(manifest.auditBaselineSha)) fail('auditBaselineSha must be a full git SHA');

  const sourceEntries = Object.entries(manifest.sourceManifests ?? {});
  if (sourceEntries.length < 2) fail('at least RC and Android source manifests are required');
  const manifests = {};
  for (const [key, relativePath] of sourceEntries) {
    if (!(await exists(relativePath))) fail(`missing source manifest ${relativePath}`);
    manifests[key] = await readJson(relativePath);
  }

  const engineering = manifest.engineeringGates;
  if (!Array.isArray(engineering) || engineering.length === 0) fail('engineeringGates must be non-empty');
  const engineeringIds = new Set();
  for (const gate of engineering) {
    if (!gate?.id || engineeringIds.has(gate.id)) fail(`invalid or duplicate engineering gate id '${gate?.id}'`);
    engineeringIds.add(gate.id);
    if (!['verified', 'pending'].includes(gate.status)) fail(`invalid engineering status for ${gate.id}`);
    if (gate.status !== 'verified' && gate.blocking) fail(`blocking engineering gate ${gate.id} cannot be pending in the canonical development baseline`);
    if (!Array.isArray(gate.evidencePaths) || gate.evidencePaths.length === 0) fail(`engineering gate ${gate.id} needs evidencePaths`);
    for (const evidencePath of gate.evidencePaths) {
      if (!(await exists(evidencePath))) fail(`engineering evidence missing for ${gate.id}: ${evidencePath}`);
    }
    if (gate.sourceGate) {
      const source = resolveGate(gate.sourceGate, manifests);
      if (source?.status !== gate.status) fail(`${gate.id} diverges from ${gate.sourceGate}`);
    }
  }

  const workflows = manifest.runtimeWorkflows;
  if (!Array.isArray(workflows) || workflows.length === 0) fail('runtimeWorkflows must be non-empty');
  for (const workflow of workflows) {
    const workflowPath = `.github/workflows/${workflow}`;
    if (!(await exists(workflowPath))) fail(`runtime workflow missing: ${workflowPath}`);
  }

  const external = manifest.externalEvidence;
  if (!Array.isArray(external) || external.length === 0) fail('externalEvidence must be non-empty');
  const externalIds = new Set();
  const resolvedExternal = external.map((gate) => {
    if (!gate?.id || externalIds.has(gate.id)) fail(`invalid or duplicate external gate id '${gate?.id}'`);
    externalIds.add(gate.id);
    if (typeof gate.manual !== 'boolean') fail(`external gate ${gate.id} must declare manual`);
    const source = resolveGate(gate.sourceGate, manifests);
    if (!['verified', 'pending'].includes(source?.status)) fail(`invalid source status for ${gate.id}`);
    return { ...gate, status: source.status, evidence: source.evidence ?? null, note: source.note ?? null };
  });

  const operator = manifest.operatorGates ?? [];
  for (const gate of operator) {
    if (!gate?.id || !['verified', 'pending'].includes(gate.status)) fail('operator gates require id and valid status');
    if (typeof gate.manual !== 'boolean') fail(`operator gate ${gate.id} must declare manual`);
  }

  const engineeringVerified = engineering.filter((gate) => gate.status === 'verified').length;
  const externalCombined = [...resolvedExternal, ...operator];
  const externalVerified = externalCombined.filter((gate) => gate.status === 'verified').length;

  const contract = {
    manifest,
    manifests,
    resolvedExternal,
    operator,
    scores: {
      engineering: percentage(engineeringVerified, engineering.length),
      externalEvidence: percentage(externalVerified, externalCombined.length),
    },
  };

  console.log('Nvet Care — Global Release Readiness Contract');
  console.log(`Candidate: ${manifest.candidate}`);
  console.log(`Engineering: ${engineeringVerified}/${engineering.length} verified (${contract.scores.engineering}%)`);
  console.log(`External/operator evidence: ${externalVerified}/${externalCombined.length} verified (${contract.scores.externalEvidence}%)`);
  for (const gate of externalCombined.filter((item) => item.status !== 'verified')) {
    console.log(`BLOCKED | ${gate.id} | owner=${gate.owner} | manual=${gate.manual}`);
  }

  return contract;
}

function githubHeaders() {
  return {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
  };
}

async function workflowStatus(repo, workflow, sha) {
  const params = new URLSearchParams({ branch: 'main', head_sha: sha, per_page: '20' });
  const response = await fetch(
    `https://api.github.com/repos/${repo}/actions/workflows/${encodeURIComponent(workflow)}/runs?${params}`,
    { headers: githubHeaders() },
  );
  if (!response.ok) fail(`GitHub Actions API failed for ${workflow}: HTTP ${response.status}`);
  const payload = await response.json();
  const runs = Array.isArray(payload.workflow_runs) ? payload.workflow_runs : [];
  const successful = runs.find((run) => run.head_sha === sha && run.status === 'completed' && run.conclusion === 'success');
  const latest = runs.find((run) => run.head_sha === sha) ?? null;
  return {
    workflow,
    ok: Boolean(successful),
    runId: successful?.id ?? latest?.id ?? null,
    status: successful?.status ?? latest?.status ?? 'missing',
    conclusion: successful?.conclusion ?? latest?.conclusion ?? null,
  };
}

async function writeRuntimeEvidence(contract) {
  const repo = process.env.GITHUB_REPOSITORY || 'VladPhil92/Nvet-Care-App';
  const sha = process.env.GLOBAL_READINESS_SHA || process.env.GITHUB_SHA;
  if (!sha || !/^[0-9a-f]{40}$/i.test(sha)) fail('GITHUB_SHA or GLOBAL_READINESS_SHA is required for runtime audit');

  const runtimeChecks = [];
  for (const workflow of contract.manifest.runtimeWorkflows) {
    runtimeChecks.push(await workflowStatus(repo, workflow, sha));
  }

  const runtimeVerified = runtimeChecks.filter((check) => check.ok).length;
  const machineRuntime = percentage(runtimeVerified, runtimeChecks.length);
  const releaseReadiness = weightedScore(
    contract.scores.engineering,
    machineRuntime,
    contract.scores.externalEvidence,
    contract.manifest.scorePolicy,
  );

  const blockedExternal = [...contract.resolvedExternal, ...contract.operator].filter((gate) => gate.status !== 'verified');
  const artifact = {
    schemaVersion: 1,
    observedAt: new Date().toISOString(),
    repository: repo,
    candidate: contract.manifest.candidate,
    sha,
    scores: {
      engineering: contract.scores.engineering,
      machineRuntime,
      externalEvidence: contract.scores.externalEvidence,
      releaseReadiness,
    },
    runtimeChecks,
    externalEvidence: contract.resolvedExternal,
    operatorGates: contract.operator,
    verdict: runtimeChecks.every((check) => check.ok) && blockedExternal.length === 0 ? 'READY' : 'BLOCKED',
  };

  const artifactDir = path.join(ROOT, '.artifacts');
  await fs.mkdir(artifactDir, { recursive: true });
  await fs.writeFile(path.join(artifactDir, 'global-readiness.json'), `${JSON.stringify(artifact, null, 2)}\n`);

  console.log(`Machine runtime: ${runtimeVerified}/${runtimeChecks.length} successful (${machineRuntime}%)`);
  console.log(`Release readiness score: ${releaseReadiness}%`);
  console.log(`Verdict: ${artifact.verdict}`);

  if (process.env.GITHUB_STEP_SUMMARY) {
    const rows = runtimeChecks.map(
      (check) => `| ${check.workflow} | ${check.ok ? 'PASS' : 'BLOCKED'} | ${check.runId ?? 'none'} | ${check.status}/${check.conclusion ?? 'none'} |`,
    );
    const externalRows = [...contract.resolvedExternal, ...contract.operator].map(
      (gate) => `| ${gate.id} | ${gate.status === 'verified' ? 'PASS' : 'BLOCKED'} | ${gate.owner} | ${gate.manual ? 'manual/external' : 'machine/repository'} |`,
    );
    const summary = [
      '# Nvet Care — Global Release Readiness',
      '',
      `Candidate: \`${contract.manifest.candidate}\``,
      `SHA: \`${sha}\``,
      '',
      `- Engineering completion: **${contract.scores.engineering}%**`,
      `- Machine runtime evidence: **${machineRuntime}%**`,
      `- External/operator evidence: **${contract.scores.externalEvidence}%**`,
      `- Weighted release readiness: **${releaseReadiness}%**`,
      `- Verdict: **${artifact.verdict}**`,
      '',
      '## Runtime workflows',
      '',
      '| Workflow | Result | Run | State |',
      '|---|---|---:|---|',
      ...rows,
      '',
      '## External and operator gates',
      '',
      '| Gate | Result | Owner | Boundary |',
      '|---|---|---|---|',
      ...externalRows,
      '',
      '> Pending external evidence does not reduce engineering completion. It blocks release promotion only.',
    ].join('\n');
    await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
  }

  if (enforceRelease && artifact.verdict !== 'READY') {
    fail('GLOBAL_RELEASE_ENFORCE=true and release evidence is not complete');
  }
}

const contract = await validateContract();
if (runtime) {
  await writeRuntimeEvidence(contract);
} else if (!contractOnly) {
  console.log('Tip: use --runtime to include GitHub Actions evidence for the current SHA.');
}
