import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CONTROL_RELATIVE_PATH = 'docs/production/OPERATOR_EVIDENCE_CONTROL.json';

function fail(message) {
  throw new Error(`Operator evidence contract mismatch: ${message}`);
}

async function readJson(relativePath) {
  return JSON.parse(await fs.readFile(path.join(ROOT, relativePath), 'utf8'));
}

function validIso(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function hoursSince(value) {
  return (Date.now() - Date.parse(value)) / 3_600_000;
}

function sourceAddress(sourceManifest, sourceKey) {
  return `${sourceManifest}#${sourceKey}`;
}

function containsSecretLikeContent(value) {
  const text = String(value ?? '');
  return [
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
    /\b(?:password|passwd|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|private[_-]?key)\b\s*[:=]\s*\S+/i,
    /\bBearer\s+[A-Za-z0-9._~+\/-]{20,}/i,
    /[?&](?:token|key|secret|password|signature|sig)=[^&#\s]+/i,
  ].some((pattern) => pattern.test(text));
}

async function walkJsonFiles(directory) {
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) files.push(...(await walkJsonFiles(absolute)));
      else if (entry.isFile() && entry.name.endsWith('.json')) files.push(absolute);
    }
    return files;
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

export async function loadOperatorEvidenceControl() {
  const control = await readJson(CONTROL_RELATIVE_PATH);
  if (control.schemaVersion !== 1) fail('schemaVersion must be 1');
  if (control.program !== 'operator-evidence-control-plane') fail('unexpected program');
  if (!/^1\.0\.0-rc\.\d+$/.test(control.candidate ?? '')) fail('candidate must use 1.0.0-rc.N');
  if (typeof control.recordsDirectory !== 'string' || !control.recordsDirectory.startsWith('docs/production/')) {
    fail('recordsDirectory must stay under docs/production');
  }
  if (control.policy?.failClosed !== true || control.policy?.appendOnlyRecords !== true) {
    fail('control plane must remain fail-closed and append-only');
  }
  if (control.policy?.submittedEvidenceNeverAutoVerifies !== true || control.policy?.requireApprovalEvent !== true) {
    fail('submission and approval must remain separate states');
  }
  if (!Number.isInteger(control.policy?.futureClockSkewMinutes) || control.policy.futureClockSkewMinutes < 0) {
    fail('futureClockSkewMinutes must be a non-negative integer');
  }
  if (!Number.isInteger(control.policy?.approvalMaxAgeHours) || control.policy.approvalMaxAgeHours <= 0) {
    fail('approvalMaxAgeHours must be a positive integer');
  }
  if (!Array.isArray(control.gates) || control.gates.length === 0) fail('gates must be non-empty');

  const ids = new Set();
  const sources = new Set();
  for (const gate of control.gates) {
    if (!/^[a-z0-9][a-z0-9-]+$/.test(gate?.id ?? '') || ids.has(gate.id)) fail(`invalid or duplicate gate id '${gate?.id}'`);
    ids.add(gate.id);
    if (!['rc', 'android', 'beta', 'global'].includes(gate.sourceManifest)) fail(`invalid sourceManifest for ${gate.id}`);
    if (typeof gate.sourceKey !== 'string' || gate.sourceKey.length < 3) fail(`sourceKey missing for ${gate.id}`);
    const source = sourceAddress(gate.sourceManifest, gate.sourceKey);
    if (sources.has(source)) fail(`duplicate source mapping ${source}`);
    sources.add(source);
    if (typeof gate.owner !== 'string' || gate.owner.length < 3) fail(`owner missing for ${gate.id}`);
    if (!Array.isArray(gate.evidenceKinds) || gate.evidenceKinds.length === 0) fail(`evidenceKinds missing for ${gate.id}`);
    if (gate.maxAgeHours !== null && (!Number.isInteger(gate.maxAgeHours) || gate.maxAgeHours <= 0)) {
      fail(`maxAgeHours must be null or a positive integer for ${gate.id}`);
    }
    if (typeof gate.requireDistinctApprover !== 'boolean') fail(`requireDistinctApprover must be boolean for ${gate.id}`);
    if (gate.mirrors !== undefined) {
      if (!Array.isArray(gate.mirrors)) fail(`mirrors must be an array for ${gate.id}`);
      for (const mirror of gate.mirrors) {
        if (!['rc', 'android', 'beta', 'global'].includes(mirror?.sourceManifest)) fail(`invalid mirror sourceManifest for ${gate.id}`);
        if (typeof mirror?.sourceKey !== 'string' || mirror.sourceKey.length < 3) fail(`invalid mirror sourceKey for ${gate.id}`);
      }
    }
  }
  return control;
}

function validateSharedRecord(record, control, gate) {
  if (record.schemaVersion !== 1) fail(`record ${record.id ?? '<missing>'} schemaVersion must be 1`);
  if (!['submission', 'approval'].includes(record.type)) fail(`record ${record.id ?? '<missing>'} has invalid type`);
  if (record.gateId !== gate.id) fail(`record ${record.id ?? '<missing>'} gate mismatch`);
  if (record.candidate !== control.candidate) fail(`record ${record.id ?? '<missing>'} candidate mismatch`);
  if (!/^[0-9a-f]{40}$/i.test(record.candidateSha ?? '')) fail(`record ${record.id ?? '<missing>'} requires full candidateSha`);
  if (typeof record.id !== 'string' || !/^[a-z0-9-]+:[A-Za-z0-9_.-]+$/.test(record.id)) fail('record id must be gateId:opaque-id');
  if (containsSecretLikeContent(JSON.stringify(record))) fail(`record ${record.id} contains secret-like content`);
}

function validateSubmission(record, control, gate) {
  validateSharedRecord(record, control, gate);
  if (!validIso(record.observedAt) || !validIso(record.submittedAt)) fail(`submission ${record.id} requires valid timestamps`);
  const futureToleranceMs = control.policy.futureClockSkewMinutes * 60_000;
  if (Date.parse(record.observedAt) > Date.now() + futureToleranceMs) fail(`submission ${record.id} observedAt is in the future`);
  if (Date.parse(record.submittedAt) > Date.now() + futureToleranceMs) fail(`submission ${record.id} submittedAt is in the future`);
  if (typeof record.submitter !== 'string' || record.submitter.length < 1) fail(`submission ${record.id} requires submitter`);
  if (!gate.evidenceKinds.includes(record.evidence?.kind)) fail(`submission ${record.id} evidence kind is not allowed`);
  if (typeof record.evidence?.reference !== 'string' || record.evidence.reference.trim().length < 6) fail(`submission ${record.id} requires a concrete reference`);
  if (record.evidence?.redacted !== true) fail(`submission ${record.id} must explicitly declare redacted=true`);
}

function validateApproval(record, control, gate) {
  validateSharedRecord(record, control, gate);
  if (record.decision !== 'approved') fail(`approval ${record.id} decision must be approved`);
  if (!validIso(record.approvedAt)) fail(`approval ${record.id} requires approvedAt`);
  if (typeof record.approver !== 'string' || record.approver.length < 1) fail(`approval ${record.id} requires approver`);
  if (typeof record.submissionId !== 'string' || !record.submissionId.startsWith(`${gate.id}:`)) fail(`approval ${record.id} requires a gate-matching submissionId`);
}

export async function loadOperatorEvidenceRecords(control = null) {
  control = control ?? (await loadOperatorEvidenceControl());
  const gateMap = new Map(control.gates.map((gate) => [gate.id, gate]));
  const absoluteDirectory = path.join(ROOT, control.recordsDirectory);
  const files = await walkJsonFiles(absoluteDirectory);
  const records = [];
  const ids = new Set();
  for (const file of files) {
    const record = JSON.parse(await fs.readFile(file, 'utf8'));
    const gate = gateMap.get(record.gateId);
    if (!gate) fail(`unknown gate '${record.gateId}' in ${path.relative(ROOT, file)}`);
    if (ids.has(record.id)) fail(`duplicate record id '${record.id}'`);
    ids.add(record.id);
    if (record.type === 'submission') validateSubmission(record, control, gate);
    else validateApproval(record, control, gate);
    records.push({ ...record, __path: path.relative(ROOT, file) });
  }
  return records;
}

export async function buildOperatorEvidenceStatus() {
  const control = await loadOperatorEvidenceControl();
  const records = await loadOperatorEvidenceRecords(control);
  const submissions = new Map(records.filter((record) => record.type === 'submission').map((record) => [record.id, record]));
  const promotedRcApproval = records
    .filter((record) => record.type === 'approval' && record.gateId === 'rc-promoted')
    .sort((a, b) => Date.parse(b.approvedAt) - Date.parse(a.approvedAt))[0];
  const promotedRcSubmission = promotedRcApproval ? submissions.get(promotedRcApproval.submissionId) : null;

  const byGate = {};
  const bySource = {};
  for (const gate of control.gates) {
    const approvals = records
      .filter((record) => record.type === 'approval' && record.gateId === gate.id)
      .sort((a, b) => Date.parse(b.approvedAt) - Date.parse(a.approvedAt));
    let resolved = null;
    for (const approval of approvals) {
      const submission = submissions.get(approval.submissionId);
      if (!submission) continue;
      if (hoursSince(approval.approvedAt) > control.policy.approvalMaxAgeHours) continue;
      if (submission.gateId !== gate.id || submission.candidateSha !== approval.candidateSha) continue;
      if (gate.requireDistinctApprover && submission.submitter === approval.approver) continue;
      if (gate.maxAgeHours !== null && hoursSince(submission.observedAt) > gate.maxAgeHours) continue;
      if (gate.sourceManifest === 'android' && gate.id !== 'rc-promoted' && control.policy.downstreamAndroidMustMatchPromotedRcSha === true) {
        if (!promotedRcSubmission) continue;
        if (submission.candidateSha !== promotedRcSubmission.candidateSha) continue;
      }
      resolved = {
        status: 'verified',
        gateId: gate.id,
        owner: gate.owner,
        evidence: `${submission.evidence.kind}: ${submission.evidence.reference}`,
        observedAt: submission.observedAt,
        candidateSha: submission.candidateSha,
        submissionId: submission.id,
        approvalId: approval.id,
        submitter: submission.submitter,
        approver: approval.approver,
        recordPaths: [submission.__path, approval.__path],
      };
      break;
    }
    if (!resolved) resolved = { status: 'pending', gateId: gate.id, owner: gate.owner, evidence: null };
    byGate[gate.id] = resolved;
    bySource[sourceAddress(gate.sourceManifest, gate.sourceKey)] = resolved;
  }
  return { control, records, byGate, bySource };
}

export async function resolveOperatorBackedGate(sourceManifest, sourceKey, manifestEntry) {
  if (manifestEntry?.status === 'verified') return { ...manifestEntry, evidenceSource: 'manifest' };
  const status = await buildOperatorEvidenceStatus();
  const overlay = status.bySource[sourceAddress(sourceManifest, sourceKey)];
  if (overlay?.status === 'verified') {
    return { ...manifestEntry, status: 'verified', evidence: overlay.evidence, operatorEvidence: overlay, evidenceSource: 'operator-control-plane' };
  }
  return { ...manifestEntry, evidenceSource: 'manifest' };
}

export async function writeSubmissionFromEnv() {
  const control = await loadOperatorEvidenceControl();
  const gate = control.gates.find((item) => item.id === process.env.EVIDENCE_GATE_ID);
  if (!gate) fail(`unknown EVIDENCE_GATE_ID '${process.env.EVIDENCE_GATE_ID ?? ''}'`);
  const runId = process.env.GITHUB_RUN_ID || `local-${Date.now()}`;
  const record = {
    schemaVersion: 1,
    type: 'submission',
    id: `${gate.id}:${runId}`,
    gateId: gate.id,
    candidate: control.candidate,
    candidateSha: process.env.EVIDENCE_CANDIDATE_SHA,
    observedAt: process.env.EVIDENCE_OBSERVED_AT,
    submittedAt: new Date().toISOString(),
    submitter: process.env.GITHUB_ACTOR || process.env.EVIDENCE_SUBMITTER || 'local-operator',
    evidence: {
      kind: process.env.EVIDENCE_KIND,
      reference: process.env.EVIDENCE_REFERENCE,
      note: process.env.EVIDENCE_NOTE || null,
      redacted: true
    }
  };
  validateSubmission(record, control, gate);
  const relativePath = path.join(control.recordsDirectory, gate.id, `${runId}-submission.json`).replaceAll('\\', '/');
  const absolutePath = path.join(ROOT, relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  try {
    await fs.writeFile(absolutePath, `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
  } catch (error) {
    if (error?.code === 'EEXIST') fail(`append-only record already exists: ${relativePath}`);
    throw error;
  }
  return { record, relativePath };
}

export async function writeApprovalFromEnv() {
  const control = await loadOperatorEvidenceControl();
  const records = await loadOperatorEvidenceRecords(control);
  const submission = records.find((record) => record.type === 'submission' && record.id === process.env.EVIDENCE_SUBMISSION_ID);
  if (!submission) fail(`submission '${process.env.EVIDENCE_SUBMISSION_ID ?? ''}' does not exist on this branch`);
  const gate = control.gates.find((item) => item.id === submission.gateId);
  const runId = process.env.GITHUB_RUN_ID || `local-${Date.now()}`;
  const record = {
    schemaVersion: 1,
    type: 'approval',
    id: `${gate.id}:approval-${runId}`,
    gateId: gate.id,
    candidate: control.candidate,
    candidateSha: submission.candidateSha,
    submissionId: submission.id,
    decision: 'approved',
    approvedAt: new Date().toISOString(),
    approver: process.env.GITHUB_ACTOR || process.env.EVIDENCE_APPROVER || 'local-approver',
    note: process.env.EVIDENCE_NOTE || null
  };
  validateApproval(record, control, gate);
  if (gate.requireDistinctApprover && record.approver === submission.submitter) {
    fail(`gate ${gate.id} requires an approver different from submitter ${submission.submitter}`);
  }
  const relativePath = path.join(control.recordsDirectory, gate.id, `${runId}-approval.json`).replaceAll('\\', '/');
  const absolutePath = path.join(ROOT, relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  try {
    await fs.writeFile(absolutePath, `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
  } catch (error) {
    if (error?.code === 'EEXIST') fail(`append-only record already exists: ${relativePath}`);
    throw error;
  }
  return { record, relativePath };
}

const SOURCE_MANIFEST_PATHS = Object.freeze({
  rc: 'docs/production/RC_READINESS.json',
  android: 'docs/production/ANDROID_PRODUCTION_READINESS.json',
  beta: 'docs/production/BETA_CARTAGENA_READINESS.json',
  global: 'docs/production/GLOBAL_READINESS.json',
});

function locateMutableGate(manifestName, manifest, sourceKey) {
  if (manifestName === 'global' && sourceKey.startsWith('operatorGates.')) {
    const gateId = sourceKey.slice('operatorGates.'.length);
    const entry = manifest.operatorGates?.find((item) => item?.id === gateId);
    if (!entry) fail(`global operator gate '${gateId}' does not exist`);
    return entry;
  }
  const parts = sourceKey.split('.');
  let value = manifest;
  for (const part of parts) {
    value = value?.[part];
    if (value === undefined) fail(`source gate '${manifestName}#${sourceKey}' does not exist`);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`source gate '${manifestName}#${sourceKey}' is not mutable evidence`);
  return value;
}

export async function syncReadinessManifestsFromOperatorEvidence() {
  const status = await buildOperatorEvidenceStatus();
  const manifests = {};
  for (const [name, relativePath] of Object.entries(SOURCE_MANIFEST_PATHS)) manifests[name] = await readJson(relativePath);

  const changed = new Set();
  for (const gate of status.control.gates) {
    const resolved = status.byGate[gate.id];
    const targets = [
      { sourceManifest: gate.sourceManifest, sourceKey: gate.sourceKey },
      ...(Array.isArray(gate.mirrors) ? gate.mirrors : []),
    ];
    for (const target of targets) {
      const manifest = manifests[target.sourceManifest];
      if (!manifest) fail(`unknown sync manifest '${target.sourceManifest}' for ${gate.id}`);
      const entry = locateMutableGate(target.sourceManifest, manifest, target.sourceKey);
      const nextStatus = resolved.status === 'verified' ? 'verified' : 'pending';
      const nextEvidence = resolved.status === 'verified'
        ? resolved.evidence
        : entry.status === 'verified'
          ? null
          : (entry.evidence ?? null);
      if (entry.status !== nextStatus || (entry.evidence ?? null) !== nextEvidence) {
        entry.status = nextStatus;
        entry.evidence = nextEvidence;
        changed.add(target.sourceManifest);
      }
    }
  }

  const changedPaths = [];
  for (const name of changed) {
    const relativePath = SOURCE_MANIFEST_PATHS[name];
    await fs.writeFile(path.join(ROOT, relativePath), `${JSON.stringify(manifests[name], null, 2)}\n`);
    changedPaths.push(relativePath);
  }
  return changedPaths;
}
