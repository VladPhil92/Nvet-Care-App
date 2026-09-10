import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function requireFile(rel) {
  if (!fs.existsSync(path.join(root, rel))) failures.push(`missing ${rel}`);
}

function requireText(rel, pattern, purpose) {
  if (!fs.existsSync(path.join(root, rel)) || !pattern.test(read(rel))) {
    failures.push(`${purpose}: ${rel}`);
  }
}

const migration =
  "backend/prisma/migrations/20260903023000_veterinary_trust_convergence/migration.sql";
requireFile(migration);
requireFile("backend/src/auth/guards/verified-vet.guard.ts");
requireFile("backend/src/vets/professional-registry.service.ts");
requireFile("backend/src/vets/professional-registry.controller.ts");
requireFile("backend/src/vets/dto/professional-registry.dto.ts");

for (const [pattern, purpose] of [
  [/vet_professional_registry_checks/, "registry evidence table"],
  [/status.*VERIFIED/s, "verified registry state"],
  [/enforce_verified_vet_operational_state/, "database operational guard"],
  [/deactivate_vet_on_registry_loss/, "registry-loss deactivation"],
  [/is_available_now.*FALSE/s, "availability fail-closed"],
]) {
  requireText(migration, pattern, purpose);
}

const guard = "backend/src/auth/guards/verified-vet.guard.ts";
requireText(guard, /VerificationStatus\.APPROVED/, "documentary approval gate");
requireText(guard, /status\s*===\s*["']VERIFIED["']/, "official registry gate");
requireText(guard, /isActive/, "active profile gate");
requireText(guard, /UserRole\.VET/, "VET role boundary");

const registryService = "backend/src/vets/professional-registry.service.ts";
requireText(
  registryService,
  /consejoprofesionalmvz\.gov\.co\/consulta-de-profesionales/,
  "official registry source",
);
requireText(
  registryService,
  /MANUAL_OFFICIAL_REGISTRY/,
  "non-scraping verification method",
);

for (const [rel, operations] of [
  [
    "backend/src/appointments/appointments.controller.ts",
    ["getTodayAppointments", "updateAppointmentStatus", "updateVetLocation", "addClinicalNotes"],
  ],
  [
    "backend/src/payments/payments.controller.ts",
    ["verifyTransfer", "getMyEarnings", "requestWithdrawal"],
  ],
  [
    "backend/src/vets/vets.controller.ts",
    ["toggleMyAvailability", "getMyEarnings"],
  ],
]) {
  const text = read(rel);
  if (!/VerifiedVetGuard/.test(text)) {
    failures.push(`VerifiedVetGuard missing from ${rel}`);
  }
  for (const operation of operations) {
    const index = text.indexOf(`async ${operation}`);
    if (index < 0) {
      failures.push(`operation ${operation} missing from ${rel}`);
      continue;
    }
    const prefix = text.slice(Math.max(0, index - 500), index);
    if (!/UseGuards\([^)]*VerifiedVetGuard/.test(prefix)) {
      failures.push(`${operation} is not protected by VerifiedVetGuard`);
    }
  }
}

// ---------------------------------------------------------------------------
// Phase 22. Recruitment contact governance is an explicit trust boundary.
// A lead is not permission to contact: production invitation delivery must be
// backed by an append-only, auditable permission record and the admin console
// must expose that state instead of silently bypassing it.
// ---------------------------------------------------------------------------
const outreachConsentService =
  "backend/src/recruitment/vet-outreach-consent.service.ts";
const outreachConsentController =
  "backend/src/recruitment/vet-outreach-consent.controller.ts";
const invitationController =
  "backend/src/recruitment/vet-invitation.controller.ts";
const outreachConsentDto =
  "backend/src/recruitment/dto/vet-outreach-consent.dto.ts";
const outreachConsentDashboardService =
  "dashboard/src/services/vet-outreach-consent.service.ts";
const invitationOpsPage = "dashboard/src/pages/VetInvitationOpsPage.tsx";

for (const rel of [
  outreachConsentService,
  outreachConsentController,
  outreachConsentDto,
  outreachConsentDashboardService,
]) {
  requireFile(rel);
}
requireText(
  outreachConsentService,
  /VET_RECRUITMENT_CONTACT_PERMISSION/,
  "outreach permission must use a dedicated audit target",
);
requireText(
  outreachConsentService,
  /CONSENT_GRANTED[\s\S]*CONSENT_REVOKED|CONSENT_REVOKED[\s\S]*CONSENT_GRANTED/,
  "outreach permission history must support grant and revocation",
);
requireText(
  outreachConsentService,
  /process\.env\.NODE_ENV\s*===\s*["']production["']/,
  "production outreach permission enforcement must be non-optional",
);
requireText(
  invitationController,
  /outreachConsent\.assertEmailDeliveryAllowed\(leadId\)/,
  "invitation delivery must fail closed behind outreach permission",
);
requireText(
  invitationOpsPage,
  /permission\?\.contactAllowed/,
  "admin invitation action must reflect contact permission state",
);
requireText(
  invitationOpsPage,
  /Registrar autorización/,
  "admin console must expose permission evidence capture",
);

if (failures.length > 0) {
  console.error("❌ Veterinary Trust Convergence gate failed:");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log("✅ Veterinary Trust Convergence gate passed.");
console.log("   identity: VET remains onboarding-only");
console.log("   operation: documents APPROVED + active profile + official registry VERIFIED");
console.log("   registry: auditable admin evidence; no brittle scraping dependency");
console.log("   recruitment: production invitation delivery requires auditable contact permission");
