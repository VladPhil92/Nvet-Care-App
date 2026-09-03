-- Veterinary Trust Convergence
--
-- Professional registry evidence is intentionally separate from Prisma-managed
-- domain models. COMVEZCOL exposes a public consultation surface, not a stable
-- application API contract, so Nvet records an auditable admin verification
-- instead of scraping it and pretending that scrape is authoritative.

CREATE TABLE IF NOT EXISTS "vet_professional_registry_checks" (
  "id" TEXT PRIMARY KEY,
  "vet_profile_id" TEXT NOT NULL UNIQUE,
  "status" TEXT NOT NULL,
  "checked_by" TEXT,
  "evidence" TEXT NOT NULL,
  "source_url" TEXT NOT NULL,
  "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "vet_professional_registry_checks_vet_profile_id_fkey"
    FOREIGN KEY ("vet_profile_id") REFERENCES "vet_profiles"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "vet_professional_registry_checks_checked_by_fkey"
    FOREIGN KEY ("checked_by") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "vet_professional_registry_checks_status_check"
    CHECK ("status" IN ('VERIFIED', 'NOT_FOUND', 'SANCTIONED', 'UNAVAILABLE'))
);

CREATE INDEX IF NOT EXISTS "vet_professional_registry_checks_status_idx"
  ON "vet_professional_registry_checks"("status");

UPDATE "vet_profiles"
SET "is_active" = FALSE,
    "is_available_now" = FALSE
WHERE NOT EXISTS (
  SELECT 1
  FROM "vet_professional_registry_checks" registry
  WHERE registry."vet_profile_id" = "vet_profiles"."id"
    AND registry."status" = 'VERIFIED'
);

CREATE OR REPLACE FUNCTION public.enforce_verified_vet_operational_state()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  registry_verified boolean := false;
BEGIN
  IF NEW."is_active" OR NEW."is_available_now" THEN
    SELECT EXISTS(
      SELECT 1
      FROM public."vet_professional_registry_checks" registry
      WHERE registry."vet_profile_id" = NEW."id"
        AND registry."status" = 'VERIFIED'
    ) INTO registry_verified;

    IF NOT NEW."is_verified"
       OR NEW."verification_status" <> 'APPROVED'::"VerificationStatus"
       OR NOT registry_verified THEN
      NEW."is_active" := FALSE;
      NEW."is_available_now" := FALSE;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS vet_profiles_verified_operational_guard ON public."vet_profiles";
CREATE TRIGGER vet_profiles_verified_operational_guard
BEFORE INSERT OR UPDATE OF "is_active", "is_available_now", "is_verified", "verification_status"
ON public."vet_profiles"
FOR EACH ROW
EXECUTE FUNCTION public.enforce_verified_vet_operational_state();

CREATE OR REPLACE FUNCTION public.deactivate_vet_on_registry_loss()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."status" <> 'VERIFIED' THEN
    UPDATE public."vet_profiles"
    SET "is_active" = FALSE,
        "is_available_now" = FALSE
    WHERE "id" = NEW."vet_profile_id";
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS vet_registry_loss_deactivates_profile
ON public."vet_professional_registry_checks";
CREATE TRIGGER vet_registry_loss_deactivates_profile
AFTER INSERT OR UPDATE OF "status"
ON public."vet_professional_registry_checks"
FOR EACH ROW
EXECUTE FUNCTION public.deactivate_vet_on_registry_loss();
