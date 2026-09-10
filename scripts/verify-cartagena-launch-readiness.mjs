import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

const [service, controller, module, page, client, app, sidebar, docs] = await Promise.all([
  read('backend/src/beta/cartagena-launch-readiness.service.ts'),
  read('backend/src/beta/beta.controller.ts'),
  read('backend/src/beta/beta.module.ts'),
  read('dashboard/src/pages/LaunchReadinessPage.tsx'),
  read('dashboard/src/services/launch-readiness.service.ts'),
  read('dashboard/src/App.tsx'),
  read('dashboard/src/components/Sidebar.tsx'),
  read('docs/production/PHASE_24_CARTAGENA_LAUNCH_READINESS.md'),
])

const fail = (message) => {
  console.error(`Cartagena launch readiness contract failed: ${message}`)
  process.exit(1)
}

const includes = (text, token, label) => {
  if (!text.includes(token)) fail(`${label} missing ${token}`)
}

includes(service, 'cartagena-launch-readiness-phase-24', 'Launch service')
includes(service, '"GO" | "HOLD" | "PAUSE"', 'Launch service')
includes(service, 'this.betaReadiness.getCartagenaSnapshot()', 'Launch service')
includes(service, 'this.marketLaunchPolicy.getPolicySnapshot()', 'Launch service')
includes(service, 'this.vetActivationTelemetry.getSnapshot(CARTAGENA_DANE_CODE)', 'Launch service')
includes(service, 'commercialLaunchAuthorized: false', 'Launch service')
includes(service, 'decisionAuthorizesCommercialLaunch: false', 'Launch service')
includes(service, 'blockingForLaunchDecision: false', 'Launch service')
includes(service, 'noAutomaticEvidenceApproval: true', 'Launch service')
includes(service, 'noProviderConfigurationMutation: true', 'Launch service')
includes(service, 'noCommercialLaunchAuthorization: true', 'Launch service')
includes(service, 'CARTAGENA_BOOKING_GATE_NOT_ELIGIBLE', 'Launch service')
includes(service, 'BETA_ACTIVATION_AUTHORIZATION_INACTIVE', 'Launch service')

for (const gate of [
  'rcPromoted',
  'productionBackupConfigured',
  'restoreDrillVerified',
  'productionAlertingVerified',
  'paymentRailVerified',
  'cartagenaVetCoverageVerified',
  'clientCohortConfigured',
  'supportOwnerConfirmed',
  'privacyAndTermsReviewed',
  'rollbackDrillVerified',
]) {
  includes(service, gate, 'Launch service')
}

if (/\.(approve|authorize|configure|submit|revoke)\s*\(/.test(service)) {
  fail('Launch service must remain read-only and cannot approve or mutate control planes')
}
if (/process\.env\s*(?:\[[^\]]+\]|\.[A-Za-z0-9_]+)?\s*=/.test(service)) {
  fail('Launch service must not mutate provider/environment configuration')
}

includes(controller, '@Get("launch-readiness")', 'Beta controller')
includes(controller, 'this.launchReadiness.getSnapshot()', 'Beta controller')
includes(module, 'VetRecruitmentModule', 'Beta module')
includes(module, 'CartagenaLaunchReadinessService', 'Beta module')
includes(page, 'Launch Readiness Cockpit', 'Dashboard page')
includes(page, 'snapshot.decision.state', 'Dashboard page')
includes(client, "'/beta/launch-readiness'", 'Dashboard API client')
includes(app, "| 'launch'", 'Dashboard routing')
includes(app, "page === 'launch'", 'Dashboard routing')
includes(sidebar, "id: 'launch'", 'Dashboard sidebar')
includes(docs, 'Recruitment lead counts never substitute for operational veterinarian counts.', 'Phase 24 documentation')
includes(docs, '`commercialLaunchAuthorized: false`', 'Phase 24 documentation')

console.log('Cartagena launch readiness contract valid: GO/HOLD/PAUSE cockpit is read-only, fail-closed, evidence-aware and preserves strict VET supply as the launch source of truth.')
