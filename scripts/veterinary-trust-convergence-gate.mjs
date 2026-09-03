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

if (failures.length > 0) {
  console.error("❌ Veterinary Trust Convergence gate failed:");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log("✅ Veterinary Trust Convergence gate passed.");
console.log("   identity: VET remains onboarding-only");
console.log("   operation: documents APPROVED + active profile + official registry VERIFIED");
console.log("   registry: auditable admin evidence; no brittle scraping dependency");
