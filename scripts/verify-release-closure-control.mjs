import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTROL_PATH = 'docs/production/RELEASE_CLOSURE_CONTROL.json';
const GLOBAL_PATH = 'docs/production/GLOBAL_READINESS.json';
const RC_PATH = 'docs/production/RC_READINESS.json';
const ANDROID_PATH = 'docs/production/ANDROID_PRODUCTION_READINESS.json';
const BETA_PATH = 'docs/production/BETA_CARTAGENA_READINESS.json';
const args = process.argv.slice(2);
const contractOnly = args.includes('--contract-only');
const enforceArg = args.find((arg) => arg.startsWith('--enforce='));
const enforceStage = enforceArg ? enforceArg.split('=')[1] : null;
const validStages = new Set(['rc', 'android', 'beta', 'global']);

function fail(message) {
  throw new Error(`Release closure control mismatch: ${message}`);
}

async function readJson(relativePath) {
  const raw = await fs.readFile(path.join(ROOT, relativePath), 'utf8');
  return JSON.parse(raw);
}

function evidenceReferenceValid(entry) {
  return typeof entry?.evidence === 'string' && entry.evidence.trim().length >= 3;
}

function validateEvidenceMap(label, evidence) {
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
    fail(`${label} evidence map is missing`);
  }
  for (const [id, entry] of Object.entries(evidence)) {
    if (!['pending', 'verified'].includes(entry?.status)) {
      fail(`${label}.${id} has invalid status '${entry?.status}'`);
    }
    if (entry.status === 'verified' && !evidenceReferenceValid(entry)) {
      fail(`${label}.${id} is verified without a concrete evidence reference`);
    }
  }
}

function resolveSourceGate(sourceGate, sources) {
  const parts = sourceGate.split('.');
  const sourceName = parts.shift();
  let value = sources[sourceName];
  if (!value) fail(`unknown source '${sourceName}' in ${sourceGate}`);
  for (const part of parts) {
    value = value?.[part];
    if (value === undefined) fail(`source gate '${sourceGate}' does not exist`);
  }
  return value;
}

function normalizedEvidence(entry) {
  return {
    status: entry.status,
    evidence: entry.evidence ?? null,
    note: entry.note ?? null,
  };
}

function uniqueById(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function pendingEntries(evidence, { exclude = [] } = {}) {
  const excluded = new Set(exclude);
  return Object.entries(evidence)
    .filter(([id, entry]) => !excluded.has(id) && entry.status !== 'verified')
    .map(([id, entry]) => ({ id, status: entry.status, evidence: entry.evidence ?? null, note: entry.note ?? null }));
}

async function validateContract() {
  const [control, globalManifest, rc, android, beta] = await Promise.all([
    readJson(CONTROL_PATH),
    readJson(GLOBAL_PATH),
    readJson(RC_PATH),
    readJson(ANDROID_PATH),
    readJson(BETA_PATH),
  ]);

  if (control.schemaVersion !== 1 || control.program !== 'release-closure-control') {
    fail('control manifest schema/program is invalid');
  }
  if (control.candidate !== rc.candidate || control.candidate !== android.prerequisiteRcTag || control.candidate !== beta.prerequisiteRcTag) {
    fail('candidate/prerequisite RC tag is inconsistent across release manifests');
  }
  if (!globalManifest?.operatorGates || !Array.isArray(globalManifest.operatorGates)) {
    fail('GLOBAL_READINESS.json must declare operatorGates');
  }

  validateEvidenceMap('rc.requiredExternalEvidence', rc.requiredExternalEvidence);
  validateEvidenceMap('android.requiredEvidence', android.requiredEvidence);
  validateEvidenceMap('beta.requiredEvidence', beta.requiredEvidence);

  const operatorById = new Map(globalManifest.operatorGates.map((gate) => [gate.id, gate]));
  for (const gate of globalManifest.operatorGates) {
    if (!gate?.id || !['pending', 'verified'].includes(gate.status)) {
      fail('operator gate requires id and pending/verified status');
    }
    if (gate.status === 'verified' && !evidenceReferenceValid(gate)) {
      fail(`operator gate ${gate.id} is verified without evidence`);
    }
  }

  for (const id of control.stages.rc.operatorGateIds ?? []) {
    if (!operatorById.has(id)) fail(`RC operator gate '${id}' is not declared in GLOBAL_READINESS.json`);
  }

  for (const id of control.stages.beta.inheritedRcEvidence ?? []) {
    const rcEntry = rc.requiredExternalEvidence[id];
    const betaEntry = beta.requiredEvidence[id];
    if (!rcEntry || !betaEntry) fail(`inherited RC evidence '${id}' must exist in RC and beta manifests`);
    if (rcEntry.status !== betaEntry.status) {
      fail(`beta inherited evidence '${id}' diverges from RC status (${betaEntry.status} != ${rcEntry.status})`);
    }
    if (rcEntry.status === 'verified' && betaEntry.evidence !== rcEntry.evidence) {
      fail(`beta inherited evidence '${id}' must reuse the exact RC evidence reference`);
    }
  }

  const sources = { rc, android, beta };
  for (const [sharedId, sourceGates] of Object.entries(control.sharedPromotionEvidence ?? {})) {
    if (!Array.isArray(sourceGates) || sourceGates.length < 2) fail(`shared evidence '${sharedId}' must reference at least two gates`);
    const resolved = sourceGates.map((sourceGate) => resolveSourceGate(sourceGate, sources));
    const statuses = new Set(resolved.map((entry) => entry.status));
    if (statuses.size > 1) fail(`shared evidence '${sharedId}' has divergent statuses`);
    if (resolved[0].status === 'verified') {
      const refs = new Set(resolved.map((entry) => entry.evidence));
      if (refs.size > 1) fail(`shared evidence '${sharedId}' has divergent evidence references`);
    }
  }

  const globalExternal = globalManifest.externalEvidence ?? [];
  for (const gate of globalExternal) {
    const source = resolveSourceGate(gate.sourceGate, sources);
    if (!['pending', 'verified'].includes(source?.status)) fail(`global external gate '${gate.id}' resolves to invalid status`);
  }

  return { control, globalManifest, rc, android, beta, operatorById };
}

function buildStageReport(contract) {
  const { control, globalManifest, rc, android, beta, operatorById } = contract;
  const rcBlockers = [
    ...pendingEntries(rc.requiredExternalEvidence).map((entry) => ({ ...entry, id: `rc:${entry.id}`, owner: 'external-operator' })),
    ...(control.stages.rc.operatorGateIds ?? [])
      .map((id) => operatorById.get(id))
      .filter((gate) => gate?.status !== 'verified')
      .map((gate) => ({ id: `operator:${gate.id}`, status: gate.status, evidence: gate.evidence ?? null, note: gate.note ?? null, owner: gate.owner ?? 'repository-admin' })),
  ];
  const rcReady = rcBlockers.length === 0;

  const androidBlockers = pendingEntries(android.requiredEvidence).map((entry) => ({
    ...entry,
    id: `android:${entry.id}`,
    owner: 'android-release-operator',
  }));
  if (!rcReady) {
    androidBlockers.unshift({ id: 'dependency:rc', status: 'pending', evidence: null, note: 'RC closure must be READY before Android production promotion.', owner: 'release-operator' });
  }

  const betaInherited = new Set([...(control.stages.beta.inheritedRcEvidence ?? []), 'rcPromoted']);
  const betaBlockers = pendingEntries(beta.requiredEvidence, { exclude: [...betaInherited] }).map((entry) => ({
    ...entry,
    id: `beta:${entry.id}`,
    owner: 'beta-operator',
  }));
  if (!rcReady) {
    betaBlockers.unshift({ id: 'dependency:rc', status: 'pending', evidence: null, note: 'RC closure must be READY before Cartagena beta activation.', owner: 'release-operator' });
  }

  const globalExternal = (globalManifest.externalEvidence ?? []).map((gate) => {
    const [sourceName, ...parts] = gate.sourceGate.split('.');
    let entry = { rc, android, beta }[sourceName];
    for (const part of parts) entry = entry?.[part];
    return {
      id: `global:${gate.id}`,
      status: entry?.status ?? 'pending',
      evidence: entry?.evidence ?? null,
      note: entry?.note ?? null,
      owner: gate.owner ?? 'operator',
    };
  });
  const globalOperator = (globalManifest.operatorGates ?? []).map((gate) => ({
    id: `operator:${gate.id}`,
    status: gate.status,
    evidence: gate.evidence ?? null,
    note: gate.note ?? null,
    owner: gate.owner ?? 'operator',
  }));
  const globalBlockers = uniqueById([...globalExternal, ...globalOperator]).filter((entry) => entry.status !== 'verified');

  return {
    rc: { verdict: rcReady ? 'READY' : 'BLOCKED', blockers: rcBlockers },
    android: { verdict: androidBlockers.length === 0 ? 'READY' : 'BLOCKED', blockers: androidBlockers },
    beta: { verdict: betaBlockers.length === 0 ? 'READY' : 'BLOCKED', blockers: betaBlockers },
    global: { verdict: globalBlockers.length === 0 ? 'READY' : 'BLOCKED', blockers: globalBlockers },
  };
}

function recommendedActions(stages) {
  if (stages.rc.verdict !== 'READY') {
    return stages.rc.blockers.map((blocker, index) => ({ priority: index + 1, stage: 'rc', gate: blocker.id, owner: blocker.owner, note: blocker.note }));
  }

  const downstream = [
    ...stages.beta.blockers.map((blocker) => ({ stage: 'beta', blocker })),
    ...stages.android.blockers.map((blocker) => ({ stage: 'android', blocker })),
  ].filter(({ blocker }) => blocker.id !== 'dependency:rc');

  return downstream.map(({ stage, blocker }, index) => ({
    priority: index + 1,
    stage,
    gate: blocker.id,
    owner: blocker.owner,
    note: blocker.note,
  }));
}

async function writeArtifact(contract, stages) {
  const artifact = {
    schemaVersion: 1,
    observedAt: new Date().toISOString(),
    candidate: contract.control.candidate,
    stages,
    nextActions: recommendedActions(stages),
  };
  const artifactDir = path.join(ROOT, '.artifacts');
  await fs.mkdir(artifactDir, { recursive: true });
  await fs.writeFile(path.join(artifactDir, 'release-closure-control.json'), `${JSON.stringify(artifact, null, 2)}\n`);

  console.log('Nvet Care — Release Closure Control');
  console.log(`Candidate: ${artifact.candidate}`);
  for (const [stage, report] of Object.entries(stages)) {
    console.log(`${stage.toUpperCase()}: ${report.verdict} (${report.blockers.length} blocker(s))`);
    for (const blocker of report.blockers) console.log(`  BLOCKED | ${blocker.id} | owner=${blocker.owner}`);
  }

  if (process.env.GITHUB_STEP_SUMMARY) {
    const lines = [
      '# Nvet Care — Release Closure Control',
      '',
      `Candidate: \`${artifact.candidate}\``,
      '',
      '| Stage | Verdict | Blockers |',
      '|---|---|---:|',
      ...Object.entries(stages).map(([stage, report]) => `| ${stage.toUpperCase()} | ${report.verdict} | ${report.blockers.length} |`),
      '',
      '## Next actions',
      '',
      ...(artifact.nextActions.length > 0
        ? artifact.nextActions.map((item) => `${item.priority}. **${item.stage.toUpperCase()}** — \`${item.gate}\` — owner: ${item.owner}`)
        : ['All tracked release-closure gates are verified.']),
      '',
      '> RC, beta and Android are evaluated independently. RC promotion never waits on Play/App Store evidence that itself depends on an RC tag.',
    ];
    await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
  }
}

const contract = await validateContract();
const stages = buildStageReport(contract);

if (!contractOnly) {
  await writeArtifact(contract, stages);
}

if (enforceStage) {
  if (!validStages.has(enforceStage)) fail(`unknown enforce stage '${enforceStage}'`);
  if (stages[enforceStage].verdict !== 'READY') {
    fail(`${enforceStage.toUpperCase()} promotion/activation is blocked by ${stages[enforceStage].blockers.length} gate(s)`);
  }
}
