import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

const [
  service,
  controller,
  module,
  observationDto,
  activationDto,
  supportDto,
  page,
  client,
  supportPage,
  evidencePage,
  app,
  sidebar,
  manifestRaw,
  docs,
] = await Promise.all([
  read('backend/src/beta/cartagena-launch-operations.service.ts'),
  read('backend/src/beta/beta.controller.ts'),
  read('backend/src/beta/beta.module.ts'),
  read('backend/src/beta/dto/launch-observation.dto.ts'),
  read('backend/src/beta/dto/beta-activation.dto.ts'),
  read('backend/src/beta/dto/beta-support.dto.ts'),
  read('dashboard/src/pages/LaunchOperationsPage.tsx'),
  read('dashboard/src/services/launch-operations.service.ts'),
  read('dashboard/src/pages/BetaSupportPage.tsx'),
  read('dashboard/src/pages/BetaEvidencePage.tsx'),
  read('dashboard/src/App.tsx'),
  read('dashboard/src/components/Sidebar.tsx'),
  read('docs/production/BETA_CARTAGENA_READINESS.json'),
  read('docs/production/PHASE_25_CARTAGENA_LAUNCH_OPERATIONS.md'),
])

const manifest = JSON.parse(manifestRaw)
const fail = (message) => {
  console.error(`Cartagena launch operations contract failed: ${message}`)
  process.exit(1)
}
const includes = (text, token, label) => {
  if (!text.includes(token)) fail(`${label} missing ${token}`)
}

includes(service, 'cartagena-launch-operations-phase-25', 'Launch operations service')
includes(service, 'BETA_CARTAGENA_OBSERVATION', 'Launch operations service')
includes(service, 'MINIMUM_OBSERVATION_DAYS = 7', 'Launch operations service')
includes(service, 'OBSERVATION_START_BUFFER_HOURS = 1', 'Launch operations service')
includes(service, 'MINIMUM_CONTROL_REMAINING_HOURS', 'Launch operations service')
includes(service, 'authorizationId: activation.authorizationId', 'Launch operations service')
includes(service, 'OBSERVATION_AUTHORIZATION_MISMATCH', 'Launch operations service')
includes(service, 'OBSERVATION_AUTHORIZATION_DRIFT', 'Launch operations service')
includes(service, 'OBSERVATION_CONTROL_LEASE_TOO_SHORT', 'Launch operations service')
includes(service, 'this.launchReadiness.getSnapshot()', 'Launch operations service')
includes(service, 'ACTIVE_BETA_OBSERVATION_NOT_TRACKED', 'Launch operations service')
includes(service, 'commercialLaunchAuthorized: false', 'Launch operations service')
includes(service, 'automaticallyMutatesRuntime: false', 'Launch operations service')
includes(service, 'expiryWatchIsReadOnly: true', 'Launch operations service')
includes(service, 'observationLedgerAppendOnly: true', 'Launch operations service')
includes(service, 'observationBoundToActivationAuthorization: true', 'Launch operations service')
includes(service, 'observationActionsNeverToggleProviderFlags: true', 'Launch operations service')
includes(service, 'this.prisma.auditLog.create', 'Launch operations ledger')

if (/process\.env\s*(?:\[[^\]]+\]|\.[A-Za-z0-9_]+)?\s*=/.test(service)) {
  fail('Phase 25 must not mutate provider/environment configuration')
}
if (/this\.prisma\.(?!auditLog\.create)[A-Za-z0-9_.]+\.(?:create|update|delete|upsert)\s*\(/.test(service)) {
  fail('Phase 25 mutations must be restricted to append-only auditLog.create events')
}

includes(controller, '@Get("launch-operations")', 'Beta controller')
includes(controller, '@Post("launch-operations/observation/start")', 'Beta controller')
includes(controller, '@Post("launch-operations/observation/close")', 'Beta controller')
includes(controller, '@Post("launch-operations/observation/abort")', 'Beta controller')
includes(module, 'CartagenaLaunchOperationsService', 'Beta module')
includes(observationDto, 'StartLaunchObservationDto', 'Observation DTO')
includes(observationDto, 'AbortLaunchObservationDto', 'Observation DTO')
includes(observationDto, '@Length(1, 120)', 'Observation incident reference')
includes(activationDto, '@Max(192)', 'Activation DTO')
includes(supportDto, '@Max(192)', 'Support DTO')

if (manifest.policy?.observationWindowDays !== 7) {
  fail('Closed beta observation window must remain seven days')
}
if (manifest.policy?.authorizationLeaseMaxHours !== 192) {
  fail('Activation lease ceiling must allow the Phase 25 observation window plus buffer')
}
if (manifest.policy?.supportLeaseMaxHours !== 192) {
  fail('Support lease ceiling must allow the Phase 25 observation window plus buffer')
}

includes(page, 'Operator Launch Control', 'Dashboard page')
includes(page, 'commercialLaunchAuthorized=false', 'Dashboard page')
includes(client, "'/beta/launch-operations'", 'Dashboard API client')
includes(supportPage, 'max={192}', 'Support dashboard lease control')
includes(evidencePage, 'max={192}', 'Activation dashboard lease control')
includes(app, "| 'launch-operations'", 'Dashboard routing')
includes(app, "page === 'launch-operations'", 'Dashboard routing')
includes(sidebar, "id: 'launch-operations'", 'Dashboard sidebar')
includes(
  docs,
  'Closing the seven-day observation record proves that the elapsed window was recorded.',
  'Phase 25 documentation',
)
includes(docs, '`commercialLaunchAuthorized` is always `false`.', 'Phase 25 documentation')
includes(docs, '**169 hours remaining**', 'Phase 25 documentation')

console.log(
  'Cartagena launch operations contract valid: observation is authorization-bound and append-only, leases can cover the seven-day window, expiry surveillance is read-only, and provider/commercial launch boundaries remain external.',
)
