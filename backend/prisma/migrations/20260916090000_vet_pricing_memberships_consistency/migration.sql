-- Nvet Care commercial consistency
-- 1) Persist the active membership independently from UI state.
-- 2) Track a pending paid-plan change without activating benefits before payment confirmation.
-- 3) Add an optional canonical service code while preserving custom vet services.

CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'PENDING_CHANGE', 'PAST_DUE', 'CANCELED');

ALTER TABLE "prices"
ADD COLUMN "service_code" TEXT;

CREATE INDEX "prices_vet_id_service_code_idx"
ON "prices"("vet_id", "service_code");

CREATE TABLE "vet_memberships" (
  "id" TEXT NOT NULL,
  "vet_profile_id" TEXT NOT NULL,
  "tier" "VetTier" NOT NULL,
  "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
  "monthly_price_cop" INTEGER NOT NULL DEFAULT 0,
  "commission_pct" DOUBLE PRECISION NOT NULL,
  "current_period_start" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "current_period_end" TIMESTAMP(3),
  "requested_tier" "VetTier",
  "requested_monthly_price_cop" INTEGER,
  "requested_at" TIMESTAMP(3),
  "resolution_note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "vet_memberships_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vet_memberships_vet_profile_id_key"
ON "vet_memberships"("vet_profile_id");

CREATE INDEX "vet_memberships_status_idx"
ON "vet_memberships"("status");

CREATE INDEX "vet_memberships_tier_idx"
ON "vet_memberships"("tier");

ALTER TABLE "vet_memberships"
ADD CONSTRAINT "vet_memberships_vet_profile_id_fkey"
FOREIGN KEY ("vet_profile_id") REFERENCES "vet_profiles"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
