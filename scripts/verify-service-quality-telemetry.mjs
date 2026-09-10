import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

const [service, controller, module, appModule, page, client, app, sidebar, docs] =
  await Promise.all([
    read('backend/src/operations/service-quality-telemetry.service.ts'),
    read('backend/src/operations/service-quality-telemetry.controller.ts'),
    read('backend/src/operations/service-quality-telemetry.module.ts'),
    read('backend/src/app.module.ts'),
    read('dashboard/src/pages/ServiceQualityPage.tsx'),
    read('dashboard/src/services/service-quality.service.ts'),
    read('dashboard/src/App.tsx'),
    read('dashboard/src/components/Sidebar.tsx'),
    read('docs/production/PHASE_26_SERVICE_QUALITY_TELEMETRY.md'),
  ])

const fail = (message) => {
  console.error(`Service quality telemetry contract failed: ${message}`)
  process.exit(1)
}
const includes = (source, token, label) => {
  if (!source.includes(token)) fail(`${label} missing ${token}`)
}

includes(service, 'production-service-quality-phase-26', 'Telemetry service')
includes(service, 'DEFAULT_MARKET_DANE_CODE = "13001"', 'Telemetry service')
includes(service, 'DEFAULT_WINDOW_HOURS = 168', 'Telemetry service')
includes(service, 'MAX_WINDOW_HOURS = 720', 'Telemetry service')
includes(service, 'MAX_APPOINTMENTS = 5000', 'Telemetry service')
includes(service, 'MINIMUM_SLO_SAMPLE = 10', 'Telemetry service')
includes(service, 'SERVICE_COMPLETION_GRACE_MINUTES = 180', 'Telemetry service')
includes(service, 'this.prisma.appointment.findMany', 'Telemetry service')
includes(service, 'this.coverage.resolveMarketByCity', 'Telemetry market boundary')
includes(service, 'bookingConfirmation: "appointment.createdAt -> confirmedAt"', 'Telemetry semantics')
includes(service, 'vetResponseMeasured: false', 'Telemetry semantics')
includes(service, 'service-start-delay-p95', 'Telemetry SLO')
includes(service, 'assignmentLatencyMeasured: false', 'Telemetry semantics')
includes(service, 'outcomeRatesExcludeImmatureAppointments: true', 'Telemetry maturity boundary')
includes(service, 'failureRateExcludesPendingAndVerifying: true', 'Payment maturity boundary')
includes(service, 'insufficientMetricMakesOverallInsufficient: true', 'SLO sample boundary')
includes(service, 'historicalTransitionsAreDerivedOnlyFromPersistedTimestamps: true', 'Measurement integrity')
includes(service, 'noSyntheticTimestamps: true', 'Measurement integrity')
includes(service, 'targetsAreCustomerPromises: false', 'SLO boundary')
includes(service, 'automaticallyChangesLaunchDecision: false', 'SLO boundary')
includes(service, 'aggregateOnly: true', 'Privacy boundary')
includes(service, 'exposesUserIdentifiers: false', 'Privacy boundary')
includes(service, 'exposesAddresses: false', 'Privacy boundary')
includes(service, 'exposesCoordinates: false', 'Privacy boundary')
includes(service, 'commercialLaunchAuthorized: false', 'Launch boundary')

if (/this\.prisma\.[A-Za-z0-9_]+\.(?:create|update|delete|deleteMany|updateMany|upsert)\s*\(/.test(service)) {
  fail('Phase 26 telemetry must remain read-only')
}
if (/process\.env\s*(?:\[[^\]]+\]|\.[A-Za-z0-9_]+)?\s*=/.test(service)) {
  fail('Phase 26 telemetry must not mutate provider/environment configuration')
}
for (const forbidden of ['clientId:', 'petId:', 'address:', 'latitude:', 'longitude:']) {
  if (service.includes(forbidden)) {
    fail(`Aggregate telemetry service must not select or emit ${forbidden}`)
  }
}

includes(controller, '@Controller("operations")', 'Telemetry controller')
includes(controller, '@Get("service-quality")', 'Telemetry controller')
includes(controller, '@Roles(UserRole.ADMIN, UserRole.SUPERADMIN)', 'Telemetry controller')
includes(module, 'ServiceQualityTelemetryService', 'Telemetry module')
includes(module, 'BetaModule', 'Telemetry module')
includes(module, 'CoverageModule', 'Telemetry module')
includes(appModule, 'ServiceQualityTelemetryModule', 'App module')
includes(client, '/operations/service-quality?', 'Dashboard client')
includes(page, 'PHASE 26 · PRODUCTION SERVICE QUALITY', 'Dashboard page')
includes(page, 'commercialLaunchAuthorized=false', 'Dashboard page')
includes(app, "| 'service-quality'", 'Dashboard routing')
includes(app, "page === 'service-quality'", 'Dashboard routing')
includes(sidebar, "id: 'service-quality'", 'Dashboard sidebar')
includes(docs, 'There is no independent assignment event timestamp.', 'Phase 26 documentation')
includes(docs, 'internal operating objectives', 'Phase 26 documentation')
includes(docs, 'telemetry is read-only', 'Phase 26 documentation')

console.log(
  'Phase 26 service-quality telemetry contract valid: aggregate read-only metrics use durable lifecycle timestamps, mature cohorts, resolved payment outcomes and fail-closed sample sufficiency without inventing veterinarian response evidence.',
)
