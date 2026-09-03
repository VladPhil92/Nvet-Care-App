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
  cohort,
  access,
  controller,
  readiness,
  app,
  sidebar,
  evidencePage,
  cohortPage,
  manifestRaw,
] = await Promise.all([
  read('backend/src/beta/beta-evidence.constants.ts'),
  read('backend/src/beta/beta-evidence.service.ts'),
  read('backend/src/beta/beta-activation.service.ts'),
  read('backend/src/beta/beta-cohort.service.ts'),
  read('backend/src/beta/closed-beta-access.service.ts'),
  read('backend/src/beta/beta.controller.ts'),
  read('backend/src/beta/beta-readiness.service.ts'),
  read('dashboard/src/App.tsx'),
  read('dashboard/src/components/Sidebar.tsx'),
  read('dashboard/src/pages/BetaEvidencePage.tsx'),
  read('dashboard/src/pages/BetaCohortPage.tsx'),
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

includes(cohort, 'BETA_COHORT_MEMBER', 'Cohort service')
includes(cohort, 'eventType: "INVITED"', 'Cohort service')
includes(cohort, '"REVOKED"', 'Cohort service')
includes(cohort, 'MAX_INITIAL_CLIENTS = 50', 'Cohort service')
includes(cohort, 'UserRole.CLIENT', 'Cohort service')
includes(cohort, 'emailVerified', 'Cohort service')
includes(cohort, 'assertActiveMember', 'Cohort service')
if (/auditLog\.(update|delete|deleteMany|updateMany)\s*\(/.test(cohort)) {
  fail('Cohort ledger must remain append-only; mutable auditLog operation detected.')
}

includes(activation, 'BETA_ACTIVATION_AUTHORIZATION', 'Activation service')
includes(activation, 'eventType: "AUTHORIZED"', 'Activation service')
includes(activation, '"REVOKED"', 'Activation service')
includes(activation, 'MAX_INITIAL_CLIENTS = 50', 'Activation service')
includes(activation, 'MIN_VERIFIED_VETS = 3', 'Activation service')
includes(activation, 'this.cohort.getOperationalSnapshot()', 'Activation service')
includes(activation, 'COHORT_MEMBER_INELIGIBLE', 'Activation service')
includes(activation, 'assertActiveForBooking', 'Activation service')
includes(activation, 'PRODUCTION_EVIDENCE_GATES_INCOMPLETE', 'Activation service')
if (/auditLog\.(update|delete|deleteMany|updateMany)\s*\(/.test(activation)) {
  fail('Activation authorization ledger must remain append-only.')
}

includes(access, 'await this.activation.assertActiveForBooking()', 'Booking boundary')
includes(access, 'await this.cohort.assertActiveMember(clientId)', 'Booking boundary')
includes(access, 'CLOSED_BETA_ACTIVATION_GATE_NOT_CONFIGURED', 'Booking boundary')
includes(access, 'CLOSED_BETA_COHORT_GATE_NOT_CONFIGURED', 'Booking boundary')
for (const source of [access, activation]) {
  if (source.includes('NVET_CLOSED_BETA_CLIENT_HASHES')) {
    fail('Canonical beta runtime must not depend on legacy environment cohort hashes.')
  }
}

for (const route of [
  '@Get("cohort/me")',
  '@Get("cohort")',
  '@Post("cohort/invite")',
  '@Post("cohort/:userId/revoke")',
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
includes(readiness, 'this.cohort.getOperationalSnapshot()', 'Beta readiness')
includes(readiness, 'membershipSource: "admin-control-plane"', 'Beta readiness')
includes(readiness, 'cohortLedger: "audit_logs"', 'Beta readiness')
includes(readiness, 'evidencePromotion.eligibleForOperatorActivation', 'Beta readiness')
includes(readiness, 'evidenceApprovalIsNotCommercialLaunchApproval: true', 'Beta readiness')
includes(readiness, 'operatorAuthorizationDoesNotToggleProviderConfiguration: true', 'Beta readiness')
includes(readiness, 'evidenceReferencesAdminOnly: true', 'Beta readiness')

includes(app, "'evidence'", 'Dashboard routing')
includes(app, "'cohort'", 'Dashboard routing')
includes(app, '<BetaEvidencePage />', 'Dashboard routing')
includes(app, '<BetaCohortPage />', 'Dashboard routing')
includes(sidebar, "id: 'evidence'", 'Dashboard sidebar')
includes(sidebar, "id: 'cohort'", 'Dashboard sidebar')
includes(evidencePage, "'/beta/evidence/summary'", 'Evidence dashboard')
includes(evidencePage, "'/beta/evidence/history'", 'Evidence dashboard')
includes(evidencePage, "'/beta/evidence'", 'Evidence dashboard')
includes(evidencePage, "'/beta/activation'", 'Activation dashboard')
includes(evidencePage, "'/beta/activation/authorize'", 'Activation dashboard')
includes(evidencePage, "'/beta/activation/revoke'", 'Activation dashboard')
includes(evidencePage, 'Autorizar beta controlada', 'Activation dashboard')
includes(evidencePage, 'production · cuenta para activación', 'Activation dashboard')
includes(evidencePage, 'staging · solo informativa', 'Activation dashboard')
includes(cohortPage, "'/beta/cohort'", 'Cohort dashboard')
includes(cohortPage, "'/beta/cohort/invite'", 'Cohort dashboard')
includes(cohortPage, '/revoke', 'Cohort dashboard')
includes(cohortPage, 'Cohorte auditable', 'Cohort dashboard')
includes(cohortPage, 'append-only', 'Cohort dashboard')

if (manifest.policy?.evidenceLedger !== 'audit_logs') {
  fail('Manifest evidenceLedger must be audit_logs.')
}
if (manifest.policy?.evidenceLedgerAppendOnly !== true) {
  fail('Manifest must require an append-only evidence ledger.')
}
if (manifest.policy?.cohortLedger !== 'audit_logs') {
  fail('Manifest cohortLedger must be audit_logs.')
}
if (manifest.policy?.cohortLedgerAppendOnly !== true) {
  fail('Manifest must require append-only cohort membership.')
}
if (manifest.policy?.cohortMembershipSource !== 'admin-control-plane') {
  fail('Manifest must define the admin control plane as canonical cohort source.')
}
if (manifest.policy?.legacyEnvCohortHashesAccepted !== false) {
  fail('Legacy environment cohort hashes must not be accepted by canonical runtime.')
}
if (manifest.policy?.cohortMaximumClients !== 50) {
  fail('Cohort maximum must remain 50 clients for Phase 12.')
}
if (manifest.policy?.cohortRequiresVerifiedActiveClient !== true) {
  fail('Cohort membership must require verified active CLIENT accounts.')
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
  `Beta control plane valid: ${codeGates.length} production gates, append-only evidence + cohort + authorization ledgers, booking fail-closed, admin control UI wired.`,
)
