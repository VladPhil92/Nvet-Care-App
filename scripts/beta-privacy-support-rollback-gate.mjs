import fs from 'node:fs';

const required = [
  'backend/src/beta/beta-legal.constants.ts',
  'backend/src/beta/beta-legal-consent.service.ts',
  'backend/src/beta/closed-beta-access.service.ts',
  'backend/src/beta/beta-readiness.service.ts',
  'backend/src/beta/beta-activation.service.ts',
  'backend/src/beta/beta-support.service.ts',
  'backend/src/beta/beta.controller.ts',
  'backend/.env.example',
  'dashboard/src/App.tsx',
  'dashboard/src/components/Sidebar.tsx',
  'dashboard/src/pages/BetaSupportPage.tsx',
  'docs/legal/NVET_CARTAGENA_BETA_TERMS.md',
  'docs/legal/NVET_CARTAGENA_BETA_PRIVACY_NOTICE.md',
  'docs/production/CARTAGENA_BETA_OPERATIONS_RUNBOOK.md',
  'docs/production/BETA_CARTAGENA_READINESS.json',
];

for (const path of required) {
  if (!fs.existsSync(path)) throw new Error(`Missing beta certification artifact: ${path}`);
}

const constants = fs.readFileSync('backend/src/beta/beta-legal.constants.ts', 'utf8');
const legalService = fs.readFileSync('backend/src/beta/beta-legal-consent.service.ts', 'utf8');
const access = fs.readFileSync('backend/src/beta/closed-beta-access.service.ts', 'utf8');
const readiness = fs.readFileSync('backend/src/beta/beta-readiness.service.ts', 'utf8');
const activation = fs.readFileSync('backend/src/beta/beta-activation.service.ts', 'utf8');
const support = fs.readFileSync('backend/src/beta/beta-support.service.ts', 'utf8');
const controller = fs.readFileSync('backend/src/beta/beta.controller.ts', 'utf8');
const envExample = fs.readFileSync('backend/.env.example', 'utf8');
const app = fs.readFileSync('dashboard/src/App.tsx', 'utf8');
const sidebar = fs.readFileSync('dashboard/src/components/Sidebar.tsx', 'utf8');
const supportPage = fs.readFileSync('dashboard/src/pages/BetaSupportPage.tsx', 'utf8');
const terms = fs.readFileSync('docs/legal/NVET_CARTAGENA_BETA_TERMS.md', 'utf8');
const privacy = fs.readFileSync('docs/legal/NVET_CARTAGENA_BETA_PRIVACY_NOTICE.md', 'utf8');
const runbook = fs.readFileSync('docs/production/CARTAGENA_BETA_OPERATIONS_RUNBOOK.md', 'utf8');
const manifest = JSON.parse(fs.readFileSync('docs/production/BETA_CARTAGENA_READINESS.json', 'utf8'));

const invariants = [
  [constants.includes('cartagena-beta-terms-v1-2026-09-03'), 'terms version is pinned'],
  [constants.includes('cartagena-beta-privacy-v1-2026-09-03'), 'privacy version is pinned'],
  [legalService.includes('BetaLegalAcceptance'), 'acceptance is persisted as a dedicated audit target'],
  [legalService.includes('BETA_LEGAL_ACCEPTANCE_REQUIRED'), 'missing acceptance fails closed'],
  [access.includes('await this.legalConsent.assertCurrentAcceptance(clientId)'), 'booking enforces current acceptance'],
  [access.includes('CLOSED_BETA_LEGAL_GATE_NOT_CONFIGURED'), 'missing legal wiring fails closed'],
  [controller.includes('@Post("legal/accept")'), 'explicit acceptance endpoint exists'],
  [controller.includes('@Get("support")'), 'admin support status endpoint exists'],
  [controller.includes('@Post("support/configure")'), 'admin support configure endpoint exists'],
  [controller.includes('@Post("support/revoke")'), 'admin support revoke endpoint exists'],
  [support.includes('BETA_SUPPORT_CONFIGURATION'), 'support uses a dedicated audit target'],
  [support.includes('eventType: "CONFIGURED"'), 'support configuration is append-only'],
  [support.includes('"REVOKED"'), 'support revocation is append-only'],
  [support.includes('MAX_EVENT_ROWS'), 'support ledger has a bounded operational read'],
  [support.includes('SENSITIVE_CHANNEL_PATTERN'), 'support references reject credential-like values'],
  [support.includes('configurationSource: "admin-control-plane"'), 'support source is the admin control plane'],
  [support.includes('CRITICAL_INCIDENT_TARGET_MINUTES = 30'), 'critical incident target remains 30 minutes'],
  [activation.includes('this.support.getOperationalSnapshot()'), 'activation reads support from the ledger'],
  [readiness.includes('this.support.getOperationalSnapshot()'), 'readiness reads support from the ledger'],
  [!activation.includes('NVET_BETA_SUPPORT_OWNER'), 'activation does not read legacy support owner env'],
  [!activation.includes('NVET_BETA_SUPPORT_CHANNEL'), 'activation does not read legacy support channel env'],
  [!readiness.includes('NVET_BETA_SUPPORT_OWNER'), 'readiness does not read legacy support owner env'],
  [!readiness.includes('NVET_BETA_SUPPORT_CHANNEL'), 'readiness does not read legacy support channel env'],
  [!envExample.includes('NVET_BETA_SUPPORT_OWNER=""'), 'legacy support owner env is not configurable'],
  [!envExample.includes('NVET_BETA_SUPPORT_CHANNEL=""'), 'legacy support channel env is not configurable'],
  [app.includes('<BetaSupportPage />'), 'dashboard routes the support control plane'],
  [sidebar.includes("id: 'support'"), 'dashboard exposes support navigation'],
  [!sidebar.includes('items.slice(0, 5)'), 'mobile navigation does not hide beta operations'],
  [supportPage.includes("'/beta/support'"), 'dashboard reads support status'],
  [supportPage.includes("'/beta/support/configure'"), 'dashboard can configure support coverage'],
  [supportPage.includes("'/beta/support/revoke'"), 'dashboard can revoke support coverage'],
  [terms.includes('REVISIÓN JURÍDICA PENDIENTE'), 'terms cannot masquerade as legal approval'],
  [privacy.includes('REVISIÓN JURÍDICA PENDIENTE'), 'privacy notice cannot masquerade as legal approval'],
  [runbook.includes('NVET_BOOKING_ENABLED=false'), 'rollback kill switch is documented'],
  [runbook.includes('A unit test or CI contract alone is not sufficient evidence.'), 'rollback evidence requires provider execution'],
  [runbook.includes('An ACTIVE lease satisfies only the **technical runtime prerequisite**.'), 'support runtime readiness cannot masquerade as operator evidence'],
  [manifest.policy?.supportLedger === 'audit_logs', 'manifest pins the support ledger'],
  [manifest.policy?.supportLedgerAppendOnly === true, 'manifest requires append-only support history'],
  [manifest.policy?.supportConfigurationSource === 'admin-control-plane', 'manifest pins admin support source'],
  [manifest.policy?.legacyEnvSupportConfigurationAccepted === false, 'manifest rejects legacy support env configuration'],
  [manifest.policy?.supportLeaseMaxHours === 168, 'support lease is capped at 168 hours'],
  [manifest.policy?.supportMonitoringConfirmationRequired === true, 'support monitoring confirmation is mandatory'],
  [manifest.requiredEvidence.privacyAndTermsReviewed.status === 'pending', 'legal review remains human-gated'],
  [manifest.requiredEvidence.supportOwnerConfirmed.status === 'pending', 'support confirmation remains human-gated'],
  [manifest.requiredEvidence.rollbackDrillVerified.status === 'pending', 'rollback drill remains provider-gated'],
];

if (/auditLog\.(update|delete|deleteMany|updateMany)\s*\(/.test(support)) {
  throw new Error('Support ledger must remain append-only; mutable auditLog operation detected.');
}

for (const [ok, label] of invariants) {
  if (!ok) throw new Error(`Beta privacy/support/rollback invariant failed: ${label}`);
  console.log(`✓ ${label}`);
}

console.log('Beta Privacy, Support & Rollback contract is fail-closed and evidence-honest.');
