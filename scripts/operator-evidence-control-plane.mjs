import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildOperatorEvidenceStatus,
  loadOperatorEvidenceControl,
  loadOperatorEvidenceRecords,
  writeApprovalFromEnv,
  writeSubmissionFromEnv,
  syncReadinessManifestsFromOperatorEvidence,
} from './lib/operator-evidence.mjs';

const args = new Set(process.argv.slice(2));
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function emitOutput(name, value) {
  if (process.env.GITHUB_OUTPUT) await fs.appendFile(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

const control = await loadOperatorEvidenceControl();
const records = await loadOperatorEvidenceRecords(control);
console.log(`Operator evidence contract valid: ${control.gates.length} gates, ${records.length} append-only record(s).`);

if (args.has('--submit')) {
  const { record, relativePath } = await writeSubmissionFromEnv();
  console.log(`SUBMITTED | ${record.gateId} | ${record.id} | ${relativePath}`);
  await emitOutput('record_path', relativePath);
  await emitOutput('record_id', record.id);
} else if (args.has('--approve')) {
  const { record, relativePath } = await writeApprovalFromEnv();
  console.log(`APPROVED-RECORD-CREATED | ${record.gateId} | ${record.id} | ${relativePath}`);
  await emitOutput('record_path', relativePath);
  await emitOutput('record_id', record.id);
  if (args.has('--sync-manifests')) {
    const changedPaths = await syncReadinessManifestsFromOperatorEvidence();
    console.log(`SYNCED | ${changedPaths.length} readiness manifest(s) | ${changedPaths.join(', ') || 'no changes'}`);
    await emitOutput('manifest_paths', changedPaths.join(' '));
  }
} else if (args.has('--sync-manifests')) {
  const changedPaths = await syncReadinessManifestsFromOperatorEvidence();
  console.log(`SYNCED | ${changedPaths.length} readiness manifest(s) | ${changedPaths.join(', ') || 'no changes'}`);
  await emitOutput('manifest_paths', changedPaths.join(' '));
} else {
  const status = await buildOperatorEvidenceStatus();
  const rows = control.gates.map((gate) => status.byGate[gate.id]);
  for (const row of rows) {
    console.log(`${row.status === 'verified' ? 'PASS' : 'BLOCKED'} | ${row.gateId} | ${row.evidence ?? 'pending approved operator evidence'}`);
  }
  if (args.has('--write-report')) {
    const artifactDir = path.join(ROOT, '.artifacts');
    await fs.mkdir(artifactDir, { recursive: true });
    const report = {
      schemaVersion: 1,
      observedAt: new Date().toISOString(),
      candidate: control.candidate,
      gates: status.byGate,
    };
    await fs.writeFile(path.join(artifactDir, 'operator-evidence-status.json'), `${JSON.stringify(report, null, 2)}\n`);
  }
}
