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

const [
  constants,
  service,
  activation,
  access,
  controller,
  readiness,
  app,
  sidebar,
  page,
  manifestRaw,
] = await Promise.all([
  read('backend/src/beta/beta-evidence.constants.ts'),
  read('backend/src/beta/beta-evidence.service.ts'),
  read('backend/src/beta/beta-activation.service.ts'),
  read('backend/src/beta/closed-beta-access.service.ts'),
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
includes(service, 'item.environment === "production"', 'Evidence service')
includes(service, 'requiredEnvironment: "production"', 'Evidence service')
includes(service, 'eligibleForOperatorActivation', 'Evidence service')
includes(service, 'SENSITIVE_REFERENCE_PATTERN', 'Evidence service')
if (/auditLog\.(update|delete|deleteMany|updateMany)\s*\(/.test(service)) {
  fail('Evidence ledger must remain append-only; mutable auditLog operation detected.')
}

includes(activation, 'BETA_ACTIVATION_AUTHORIZATION', 'Activation service')
includes(activation, 'eventType: "AUTHORIZED"', 'Activation service')
includes(activation, '"REVOKED"', 'Activation service')
includes(activation, 'MAX_INITIAL_CLIENTS = 50', 'Activation service')
includes(activation, 'MIN_VERIFIED_VETS = 3', 'Activation service')
includes(activation, 'assertActiveForBooking', 'Activation service')
includes(activation, 'PRODUCTION_EVIDENCE_GATES_INCOMPLETE', 'Activation service')
if (/auditLog\.(update|delete|deleteMany|updateMany)\s*\(/.test(activation)) {
  fail('Activation authorization ledger must remain append-only.')
}

includes(access, 'await this.activation.assertActiveForBooking()', 'Booking boundary')
includes(access, 'CLOSED_BETA_ACTIVATION_GATE_NOT_CONFIGURED', 'Booking boundary')

for (const route of [
  '@Get("activation")',
  '@Post("activation/authorize")',
  '@Post("activation/revoke")',
  '@Get("evidence/summary")',
  '@Get("evidence/history")',
  '@Post("evidence")',
  '@Post("evidence/:evidenceId/approve")',
  '@Post("evidence/:evidenceId/reject")',
  '@Post("evidence/:evidenceId/revoke")',
]) {
  includes(controller, route, 'Beta controller')
}

includes(readiness, 'awaiting-authorization', 'Beta readiness')
includes(readiness, 'authorizationRequired: true', 'Beta readiness')
includes(readiness, 'authorizationActive', 'Beta readiness')
includes(readiness, 'operatorActivationEligible', 'Beta readiness')
includes(readiness, 'evidencePromotion.eligibleForOperatorActivation', 'Beta readiness')
includes(readiness, 'evidenceApprovalIsNotCommercialLaunchApproval: true', 'Beta readiness')
includes(readiness, 'operatorAuthorizationDoesNotToggleProviderConfiguration: true', 'Beta readiness')
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
if (manifest.policy?.authorizationLedger !== 'audit_logs') {
  fail('Manifest authorizationLedger must be audit_logs.')
}
if (manifest.policy?.authorizationLedgerAppendOnly !== true) {
  fail('Manifest must require append-only activation authorization.')
}
if (manifest.policy?.authorizationLeaseMaxHours !== 168) {
  fail('Activation authorization lease must be capped at 168 hours.')
}
if (manifest.policy?.productionEvidenceRequiredForActivation !== true) {
  fail('Production evidence must be required for activation.')
}
if (manifest.policy?.bookingRequiresActiveAuthorization !== true) {
  fail('Booking must require an active operator authorization.')
}
if (manifest.policy?.operatorActivationRequiresAllEvidenceGates !== true) {
  fail('Manifest must require all evidence gates before operator activation.')
}
if (manifest.policy?.authorizationDoesNotMutateProviderConfig !== true) {
  fail('Authorization must never silently mutate provider runtime configuration.')
}
if (manifest.policy?.manifestEvidenceNeverAutoMutated !== true) {
  fail('Manifest must remain evidence-honest and never auto-mutate approvals.')
}

console.log(
  `Beta activation control contract valid: ${codeGates.length} production gates, append-only evidence + authorization ledgers, booking fail-closed.`,
)
