import fs from 'node:fs'

const required = {
  service: 'backend/src/recruitment/vet-invitation.service.ts',
  controller: 'backend/src/recruitment/vet-invitation.controller.ts',
  dto: 'backend/src/recruitment/dto/vet-invitation.dto.ts',
  module: 'backend/src/recruitment/vet-recruitment.module.ts',
  app: 'dashboard/src/App.tsx',
  register: 'dashboard/src/pages/VetInvitationRegisterPage.tsx',
  ops: 'dashboard/src/pages/VetInvitationOpsPage.tsx',
  client: 'dashboard/src/services/vet-invitation.service.ts',
  docs: 'docs/production/PHASE_21_VET_INVITATION_CONVERSION.md',
}

for (const [name, path] of Object.entries(required)) {
  if (!fs.existsSync(path)) throw new Error(`Missing ${name}: ${path}`)
}

const service = fs.readFileSync(required.service, 'utf8')
const controller = fs.readFileSync(required.controller, 'utf8')
const app = fs.readFileSync(required.app, 'utf8')
const docs = fs.readFileSync(required.docs, 'utf8')

const assertions = [
  [service.includes('randomBytes(32)'), 'Invitation token must be 256-bit random material'],
  [service.includes('createHash("sha256")'), 'Raw bearer tokens must be hashed before persistence'],
  [service.includes('TransactionIsolationLevel.Serializable'), 'Claim must use serializable transaction isolation'],
  [service.includes('SEND_ACCEPTED'), 'Provider acceptance must be explicit'],
  [service.includes('SUPERSEDED'), 'Reissued invitations must supersede old tokens'],
  [service.includes('VET_INVITATION_EMAIL_MISMATCH'), 'Claim must enforce invited-email binding'],
  [service.includes('MAIL_DRIVER') && service.includes('SENDGRID_API_KEY'), 'Production mail path must fail closed'],
  [service.includes('NVET_PUBLIC_APP_URL'), 'Invitation links require explicit public app URL in production'],
  [service.includes('#vetInvite='), 'Raw token must travel in a URL fragment'],
  [controller.includes('@Roles(UserRole.ADMIN, UserRole.SUPERADMIN)'), 'Invitation issuance must be admin-only'],
  [controller.includes('@Roles(UserRole.VET)'), 'Invitation claim must require VET role'],
  [controller.includes('@Post("preview")') && controller.includes('@Post("claim")'), 'Preview/claim must use POST bodies rather than token URL paths'],
  [app.includes('getInviteTokenFromHash') && app.includes('vetInvitationService'), 'Dashboard must consume and claim invitation fragments'],
  [docs.includes('A lead or invitation never counts as veterinarian coverage.'), 'Documentation must preserve supply boundary'],
]

for (const [passed, message] of assertions) {
  if (!passed) throw new Error(message)
}

const forbidden = [
  /token:\s*token\s*,\s*$/m,
  /commercialLaunchAuthorized:\s*true/,
  /cartagena-vet-coverage[^\n]*verified/i,
]
for (const pattern of forbidden) {
  if (pattern.test(service)) {
    throw new Error(`Forbidden Phase 21 boundary matched: ${pattern}`)
  }
}

console.log('Phase 21 veterinarian invitation & conversion contract: PASS')
