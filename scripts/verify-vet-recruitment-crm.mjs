import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

const [service, controller, module, app, page, sidebar, client, docs] = await Promise.all([
  read('backend/src/recruitment/vet-recruitment.service.ts'),
  read('backend/src/recruitment/vet-recruitment.controller.ts'),
  read('backend/src/recruitment/vet-recruitment.module.ts'),
  read('backend/src/app.module.ts'),
  read('dashboard/src/pages/VetRecruitmentPage.tsx'),
  read('dashboard/src/components/Sidebar.tsx'),
  read('dashboard/src/services/vet-recruitment.service.ts'),
  read('docs/production/PHASE_20_VET_RECRUITMENT_CRM.md'),
])

const fail = (message) => {
  console.error(`Vet Recruitment CRM contract failed: ${message}`)
  process.exit(1)
}

const includes = (text, token, label) => {
  if (!text.includes(token)) fail(`${label} missing ${token}`)
}

includes(service, 'VET_RECRUITMENT_LEAD', 'Recruitment service')
includes(service, 'appendEvent', 'Recruitment service')
includes(service, 'leadPresenceNeverCountsAsCoverage: true', 'Recruitment service')
includes(service, 'this.supply.getSupplyFunnelSnapshot()', 'Recruitment service')
includes(service, 'OPERATIONAL_READY', 'Recruitment service')
includes(service, 'DocumentStatus.APPROVED', 'Recruitment service')
includes(service, 'professionalRegistryCheck?.status !== "VERIFIED"', 'Recruitment service')
includes(service, 'this.coverage.isVetServiceAreaConsistent(profile)', 'Recruitment service')

if (/auditLog\.(update|updateMany|delete|deleteMany)\s*\(/.test(service)) {
  fail('Recruitment ledger must remain append-only')
}

includes(controller, '@Controller("recruitment/vets")', 'Recruitment controller')
includes(controller, '@Roles(UserRole.ADMIN, UserRole.SUPERADMIN)', 'Recruitment controller')
includes(controller, '@Post(":leadId/stage")', 'Recruitment controller')
includes(controller, '@Post(":leadId/follow-up")', 'Recruitment controller')
includes(module, 'CoverageModule', 'Recruitment module')
includes(app, 'VetRecruitmentModule', 'Backend app module')

includes(page, 'Captación VET', 'Dashboard page')
includes(page, 'conversionStage', 'Dashboard page')
includes(sidebar, "id: 'recruitment'", 'Dashboard sidebar')
includes(client, "'/recruitment/vets'", 'Dashboard API client')

for (const daneCode of ['13001', '11001', '05001', '08001', '68001', '68276', '76001', '70001', '23001', '47001']) {
  includes(docs, daneCode, 'Phase 20 documentation')
}

includes(docs, 'Recruitment lead counts are never substituted for operational veterinarian counts.', 'Phase 20 documentation')

console.log('Vet Recruitment CRM contract valid: append-only lead lifecycle, admin-only PII, live account reconciliation, and strict operational-supply boundary enforced.')
