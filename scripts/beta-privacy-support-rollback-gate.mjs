import fs from 'node:fs';

const required = [
  'backend/src/beta/beta-legal.constants.ts',
  'backend/src/beta/beta-legal-consent.service.ts',
  'backend/src/beta/closed-beta-access.service.ts',
  'backend/src/beta/beta-readiness.service.ts',
  'backend/src/beta/beta.controller.ts',
  'backend/.env.example',
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
const controller = fs.readFileSync('backend/src/beta/beta.controller.ts', 'utf8');
const envExample = fs.readFileSync('backend/.env.example', 'utf8');
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
  [readiness.includes('NVET_BETA_SUPPORT_OWNER'), 'support owner readiness is measured'],
  [readiness.includes('NVET_BETA_SUPPORT_CHANNEL'), 'support route readiness is measured'],
  [envExample.includes('NVET_BETA_SUPPORT_OWNER=""'), 'support owner env is documented'],
  [envExample.includes('NVET_BETA_SUPPORT_CHANNEL=""'), 'support channel env is documented'],
  [terms.includes('REVISIÓN JURÍDICA PENDIENTE'), 'terms cannot masquerade as legal approval'],
  [privacy.includes('REVISIÓN JURÍDICA PENDIENTE'), 'privacy notice cannot masquerade as legal approval'],
  [runbook.includes('NVET_BOOKING_ENABLED=false'), 'rollback kill switch is documented'],
  [runbook.includes('A unit test or CI contract alone is not sufficient evidence.'), 'rollback evidence requires provider execution'],
  [manifest.requiredEvidence.privacyAndTermsReviewed.status === 'pending', 'legal review remains human-gated'],
  [manifest.requiredEvidence.supportOwnerConfirmed.status === 'pending', 'support confirmation remains human-gated'],
  [manifest.requiredEvidence.rollbackDrillVerified.status === 'pending', 'rollback drill remains provider-gated'],
];

for (const [ok, label] of invariants) {
  if (!ok) throw new Error(`Beta privacy/support/rollback invariant failed: ${label}`);
  console.log(`✓ ${label}`);
}

console.log('Beta Privacy, Support & Rollback contract is fail-closed and evidence-honest.');
