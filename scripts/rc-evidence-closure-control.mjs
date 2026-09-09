import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTROL_PATH = 'docs/production/RC_EVIDENCE_CLOSURE_CONTROL.json';
const RC_PATH = 'docs/production/RC_READINESS.json';
const GLOBAL_PATH = 'docs/production/GLOBAL_READINESS.json';
const OPERATOR_CONTROL_PATH = 'docs/production/OPERATOR_EVIDENCE_CONTROL.json';
const BACKUP_OBSERVATION_PATH = '.artifacts/production-backup-evidence.json';
const BRANCH_OBSERVATION_PATH = '.artifacts/main-branch-protection-observation.json';
const OUTPUT_PATH = '.artifacts/rc-evidence-closure.json';

const args = new Set(process.argv.slice(2));
const contractOnly = args.has('--contract-only');
const enforceReady = args.has('--enforce-ready');

function fail(message) {
  throw new Error(`RC evidence closure mismatch: ${message}`);
}

async function readJson(relativePath) {
  return JSON.parse(await fs.readFile(path.join(ROOT, relativePath), 'utf8'));
}

async function readJsonOptional(relativePath) {
  try {
    return await readJson(relativePath);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function validEvidence(entry) {
  return typeof entry?.evidence === 'string' && entry.evidence.trim().length >= 3;
}

function flattenGates(control) {
  return control.lanes.flatMap((lane) =>
    lane.gates.map((gate) => ({ ...gate, lane: lane.id })),
  );
}

function resolveSource(source, rc, globalManifest) {
  const rcPrefix = 'rc.requiredExternalEvidence.';
  if (source.startsWith(rcPrefix)) {
    const key = source.slice(rcPrefix.length);
    const entry = rc.requiredExternalEvidence?.[key];
    if (!entry) fail(`source '${source}' does not exist`);
    return entry;
  }

  const operatorPrefix = 'global.operatorGates.';
  if (source.startsWith(operatorPrefix)) {
    const id = source.slice(operatorPrefix.length);
    const entry = globalManifest.operatorGates?.find((gate) => gate.id === id);
    if (!entry) fail(`source '${source}' does not exist`);
    return entry;
  }

  fail(`unsupported source '${source}'`);
}

function validateStatus(label, entry) {
  if (!['pending', 'verified'].includes(entry?.status)) {
    fail(`${label} must be pending or verified`);
  }
  if (entry.status === 'verified' && !validEvidence(entry)) {
    fail(`${label} is verified without concrete evidence`);
  }
}

function validateDependencies(gates) {
  const byId = new Map(gates.map((gate) => [gate.id, gate]));
  if (byId.size !== gates.length) fail('tracked gate ids must be unique');

  for (const gate of gates) {
    for (const dependency of gate.dependsOn ?? []) {
      if (!byId.has(dependency)) fail(`${gate.id} depends on unknown gate '${dependency}'`);
    }
  }

  const visiting = new Set();
  const visited = new Set();
  function visit(id) {
    if (visiting.has(id)) fail(`dependency cycle detected at '${id}'`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of byId.get(id).dependsOn ?? []) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of byId.keys()) visit(id);
}

async function validateContract() {
  const [control, rc, globalManifest, operatorControl] = await Promise.all([
    readJson(CONTROL_PATH),
    readJson(RC_PATH),
    readJson(GLOBAL_PATH),
    readJson(OPERATOR_CONTROL_PATH),
  ]);

  if (control.schemaVersion !== 1 || control.program !== 'rc-evidence-closure-phase-vi') {
    fail('control schema/program is invalid');
  }
  if (control.candidate !== rc.candidate || control.candidate !== operatorControl.candidate) {
    fail('candidate must match RC and Operator Evidence Control manifests');
  }
  if (!control.policy?.failClosed || !control.policy?.liveObservationNeverAutoVerifies) {
    fail('fail-closed and observation-never-auto-verifies policies are required');
  }
  if (!control.policy?.operatorEvidenceControlIsAuthoritative) {
    fail('Operator Evidence Control must remain authoritative');
  }

  const gates = flattenGates(control);
  validateDependencies(gates);

  const operatorGateIds = new Set((operatorControl.gates ?? []).map((gate) => gate.id));
  for (const gate of gates) {
    const sourceEntry = resolveSource(gate.source, rc, globalManifest);
    validateStatus(gate.source, sourceEntry);
    if (!operatorGateIds.has(gate.operatorEvidenceGate)) {
      fail(`${gate.id} references unknown operator evidence gate '${gate.operatorEvidenceGate}'`);
    }
  }

  const trackedIds = new Set(gates.map((gate) => gate.id));
  for (const required of control.promotion?.requiredGateIds ?? []) {
    if (!trackedIds.has(required)) fail(`promotion requires untracked gate '${required}'`);
  }
  if (control.promotion?.candidateTag !== control.candidate) {
    fail('promotion candidate tag must equal the RC candidate');
  }
  if (!operatorGateIds.has(control.promotion?.postPromotionEvidenceGate)) {
    fail('post-promotion evidence gate is not registered in Operator Evidence Control');
  }

  return { control, rc, globalManifest, operatorControl, gates };
}

function observationFor(gate, observations) {
  if (gate.liveObservation === 'railway-production-backup-evidence') {
    const evidence = observations.backup;
    if (!evidence) return { status: 'not-observed', verified: false, details: null };
    return {
      status: evidence.verdict === 'verified' ? 'observed-green' : 'observed-blocked',
      verified: evidence.verdict === 'verified',
      details: {
        observedAt: evidence.observedAt ?? null,
        scheduleCount: evidence.scheduleCount ?? null,
        backupCount: evidence.backupCount ?? null,
        latestBackupAgeHours: evidence.latestBackup?.ageHours ?? null,
        retentionSatisfied: evidence.checks?.retentionSatisfied ?? null,
        volumeName: evidence.postgres?.volumeName ?? null,
      },
    };
  }

  if (gate.liveObservation === 'github-main-branch-protection') {
    const evidence = observations.branch;
    if (!evidence) return { status: 'not-observed', verified: false, details: null };
    return {
      status: evidence.protected === true ? 'observed-green' : 'observed-blocked',
      verified: evidence.protected === true,
      details: {
        observedAt: evidence.observedAt ?? null,
        branch: evidence.branch ?? 'main',
        protected: evidence.protected === true,
        requiredCheckDetailObserved: evidence.requiredCheckDetailObserved === true,
        requiredCiSuccessObserved: evidence.requiredCiSuccessObserved === true,
      },
    };
  }

  return { status: 'manual-only', verified: false, details: null };
}

function buildReport(contract, observations) {
  const { control, rc, globalManifest, gates } = contract;
  const sourceStatus = new Map();
  for (const gate of gates) {
    sourceStatus.set(gate.id, resolveSource(gate.source, rc, globalManifest).status);
  }

  const gateReports = gates.map((gate) => {
    const sourceEntry = resolveSource(gate.source, rc, globalManifest);
    const blockedBy = (gate.dependsOn ?? []).filter((id) => sourceStatus.get(id) !== 'verified');
    const observation = observationFor(gate, observations);
    const actionable = sourceEntry.status !== 'verified' && blockedBy.length === 0;
    const observationNeedsSubmission =
      sourceEntry.status !== 'verified' && observation.verified === true;

    return {
      id: gate.id,
      lane: gate.lane,
      owner: gate.owner,
      status: sourceEntry.status,
      evidence: sourceEntry.evidence ?? null,
      dependsOn: gate.dependsOn ?? [],
      blockedBy,
      actionable,
      observation,
      operatorEvidenceGate: gate.operatorEvidenceGate,
      observationNeedsSubmission,
    };
  });

  const byId = new Map(gateReports.map((gate) => [gate.id, gate]));
  const promotionBlockers = control.promotion.requiredGateIds
    .map((id) => byId.get(id))
    .filter((gate) => gate.status !== 'verified')
    .map((gate) => gate.id);
  const promotionEligible = promotionBlockers.length === 0;

  const preferredOrder = [
    'production-backup-configured',
    'main-branch-protection',
    'provider-restore-drill',
    'real-transfer-rail',
  ];
  const nextActions = preferredOrder
    .map((id) => byId.get(id))
    .filter((gate) => gate.status !== 'verified')
    .map((gate, index) => {
      let action = 'wait-for-prerequisite';
      if (gate.actionable) action = 'collect-real-evidence';
      if (gate.observationNeedsSubmission) action = 'submit-observed-evidence-for-approval';

      return {
        priority: index + 1,
        gate: gate.id,
        lane: gate.lane,
        owner: gate.owner,
        action,
        blockedBy: gate.blockedBy,
        operatorEvidenceGate: gate.operatorEvidenceGate,
      };
    });

  const runUrl = process.env.RC_CLOSURE_RUN_URL || null;
  const suggestedSubmissions = gateReports
    .filter((gate) => gate.observationNeedsSubmission)
    .map((gate) => ({
      gateId: gate.operatorEvidenceGate,
      operation: 'submit',
      evidenceKind:
        gate.id === 'main-branch-protection' ? 'github-settings' : 'github-run',
      evidenceReference: runUrl,
      note: 'Live observation is green, but approval through Operator Evidence Control is still required before readiness may change.',
    }));

  return {
    schemaVersion: 1,
    program: control.program,
    candidate: control.candidate,
    observedAt: new Date().toISOString(),
    promotion: {
      eligible: promotionEligible,
      blockers: promotionBlockers,
      candidateTag: control.promotion.candidateTag,
      postPromotionEvidenceGate: control.promotion.postPromotionEvidenceGate,
    },
    gates: gateReports,
    nextActions,
    suggestedSubmissions,
    safetyBoundary:
      'Live provider/GitHub observations never mutate readiness. Only approved append-only Operator Evidence Control records may project external evidence into manifests.',
  };
}

async function writeReport(report) {
  await fs.mkdir(path.join(ROOT, '.artifacts'), { recursive: true });
  await fs.writeFile(path.join(ROOT, OUTPUT_PATH), `${JSON.stringify(report, null, 2)}\n`);

  console.log('Nvet Care — RC Evidence Closure Phase VI');
  console.log(`Candidate: ${report.candidate}`);
  console.log(`Promotion eligible: ${report.promotion.eligible}`);
  for (const gate of report.gates) {
    console.log(
      `${gate.status.toUpperCase()} | ${gate.id} | observation=${gate.observation.status} | blockedBy=${gate.blockedBy.join(',') || 'none'}`,
    );
  }

  if (process.env.GITHUB_STEP_SUMMARY) {
    const lines = [
      '# Nvet Care — RC Evidence Closure Phase VI',
      '',
      `Candidate: \`${report.candidate}\``,
      `Promotion eligible: **${report.promotion.eligible ? 'YES' : 'NO'}**`,
      '',
      '| Gate | Manifest | Live observation | Actionable | Blocked by |',
      '|---|---|---|---|---|',
      ...report.gates.map(
        (gate) =>
          `| ${gate.id} | ${gate.status} | ${gate.observation.status} | ${gate.actionable ? 'yes' : 'no'} | ${gate.blockedBy.join(', ') || '—'} |`,
      ),
      '',
      '## Ordered handoff',
      '',
      ...(report.nextActions.length
        ? report.nextActions.map(
            (item) => `${item.priority}. \`${item.gate}\` — **${item.action}** — owner: ${item.owner}`,
          )
        : ['All pre-promotion RC evidence gates are verified.']),
      '',
      '> A green live observation is not an approval. Readiness changes only through the append-only Operator Evidence Control Plane.',
    ];
    await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
  }
}

const contract = await validateContract();

if (!contractOnly) {
  const observations = {
    backup: await readJsonOptional(BACKUP_OBSERVATION_PATH),
    branch: await readJsonOptional(BRANCH_OBSERVATION_PATH),
  };
  const report = buildReport(contract, observations);
  await writeReport(report);

  if (enforceReady && !report.promotion.eligible) {
    fail(`RC promotion is blocked by ${report.promotion.blockers.join(', ')}`);
  }
}
