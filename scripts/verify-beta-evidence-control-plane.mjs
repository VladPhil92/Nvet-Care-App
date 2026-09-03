import fs from 'node:fs/promises'

const ROOT = new URL('../', import.meta.url)

async function read(path) {
  return fs.readFile(new URL(path, ROOT), 'utf8')
}

function fail(message) {
  throw new Error(message)
}

function includes(source, needle, label) {
  if (!source.includes(needle)) fail(`${label} missing contract marker: ${needle}`)
}

const [constants, service, controller, readiness, app, sidebar, page, manifestRaw] =
  await Promise.all([
    read('backend/src/beta/beta-evidence.constants.ts'),
    read('backend/src/beta/beta-evidence.service.ts'),
    read('backend/src/beta/beta.controller.ts'),
    read('backend/src/beta/beta-readiness.service.ts'),
    read('dashboard/src/App.tsx'),
    read('dashboard/src/components/Sidebar.tsx'),
    read('dashboard/src/pages/BetaEvidencePage.tsx'),
    read('docs/production/BETA_CARTAGENA_READINESS.json'),
  ])

const manifest = JSON.parse(manifestRaw)
const block = constants.match(/BETA_EVIDENCE_GATES\s*=\s*\[([\s\S]*?)\]\s*as const/)
if (!block) fail('Unable to parse BETA_EVIDENCE_GATES.')
const codeGates = [...block[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]).sort()
const manifestGates = Object.keys(manifest.requiredEvidence || {}).sort()
if (JSON.stringify(codeGates) !== JSON.stringify(manifestGates)) {
  fail(`Evidence gate drift: code=${codeGates.join(',')} manifest=${manifestGates.join(',')}`)
}

includes(service, 'BETA_EVIDENCE_TARGET_TYPE', 'Evidence service')
includes(service, 'AuditAction.CONFIG_CHANGED', 'Evidence service')
includes(service, 'eventType: "SUBMITTED"', 'Evidence service')
includes(service, '"APPROVED"', 'Evidence service')
includes(service, '"REJECTED"', 'Evidence service')
includes(service, '"REVOKED"', 'Evidence service')
includes(service, 'eligibleForOperatorActivation', 'Evidence service')
includes(service, 'SENSITIVE_REFERENCE_PATTERN', 'Evidence service')
if (/auditLog\.(update|delete|deleteMany|updateMany)\s*\(/.test(service)) {
  fail('Evidence ledger must remain append-only; mutable auditLog operation detected.')
}

for (const route of [
  '@Get("evidence/summary")',
  '@Get("evidence/history")',
  '@Post("evidence")',
  '@Post("evidence/:evidenceId/approve")',
  '@Post("evidence/:evidenceId/reject")',
  '@Post("evidence/:evidenceId/revoke")',
]) {
  includes(controller, route, 'Beta controller')
}

includes(readiness, 'operatorActivationEligible', 'Beta readiness')
includes(readiness, 'evidencePromotion.eligibleForOperatorActivation', 'Beta readiness')
includes(readiness, 'evidenceApprovalIsNotCommercialLaunchApproval: true', 'Beta readiness')
includes(readiness, 'evidenceReferencesAdminOnly: true', 'Beta readiness')

includes(app, "'evidence'", 'Dashboard routing')
includes(app, '<BetaEvidencePage />', 'Dashboard routing')
includes(sidebar, "id: 'evidence'", 'Dashboard sidebar')
includes(page, "'/beta/evidence/summary'", 'Evidence dashboard')
includes(page, "'/beta/evidence/history'", 'Evidence dashboard')
includes(page, "'/beta/evidence'", 'Evidence dashboard')

if (manifest.policy?.evidenceLedger !== 'audit_logs') {
  fail('Manifest evidenceLedger must be audit_logs.')
}
if (manifest.policy?.evidenceLedgerAppendOnly !== true) {
  fail('Manifest must require an append-only evidence ledger.')
}
if (manifest.policy?.operatorActivationRequiresAllEvidenceGates !== true) {
  fail('Manifest must require all evidence gates before operator activation.')
}
if (manifest.policy?.manifestEvidenceNeverAutoMutated !== true) {
  fail('Manifest must remain evidence-honest and never auto-mutate approvals.')
}

console.log(`Beta evidence control plane contract valid: ${codeGates.length} gates, append-only ledger, admin UI routed.`)
