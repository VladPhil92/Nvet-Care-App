-- Financial Production Convergence
--
-- TRANSFER remains the only production-capable application payment rail.
-- CTG and PSE stay fail-closed until their real provider/ledger adapters are
-- certified. This migration makes transfer evidence, settlement batches and
-- veterinarian withdrawals durable and auditable.

ALTER TABLE "transactions"
  ADD COLUMN IF NOT EXISTS "transfer_proof_storage_key" TEXT,
  ADD COLUMN IF NOT EXISTS "transfer_proof_file_name" TEXT,
  ADD COLUMN IF NOT EXISTS "transfer_proof_mime_type" TEXT,
  ADD COLUMN IF NOT EXISTS "transfer_proof_sha256" TEXT,
  ADD COLUMN IF NOT EXISTS "transfer_date" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "transfer_submitted_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "transfer_reviewed_by_id" TEXT,
  ADD COLUMN IF NOT EXISTS "transfer_rejected_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "transfer_rejection_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "settlement_batch_id" TEXT;

-- Preserve historical transfer evidence that was previously (incorrectly)
-- stored in hash_onchain. StorageService can still read legacy HTTPS keys.
UPDATE "transactions"
   SET "transfer_proof_storage_key" = "hash_onchain",
       "transfer_proof_file_name" = COALESCE("transfer_proof_file_name", 'legacy-transfer-proof')
 WHERE "payment_method"::text = 'TRANSFER'
   AND "hash_onchain" IS NOT NULL
   AND "transfer_proof_storage_key" IS NULL;

CREATE TABLE IF NOT EXISTS "financial_settlement_batches" (
  "id" TEXT PRIMARY KEY,
  "cutoff_at" TIMESTAMP(3) NOT NULL,
  "hold_days" INTEGER NOT NULL,
  "transaction_count" INTEGER NOT NULL,
  "total_gross_cop" DOUBLE PRECISION NOT NULL,
  "total_commission_cop" DOUBLE PRECISION NOT NULL,
  "total_net_cop" DOUBLE PRECISION NOT NULL,
  "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "vet_withdrawals" (
  "id" TEXT PRIMARY KEY,
  "vet_profile_id" TEXT NOT NULL,
  "amount_cop" INTEGER NOT NULL,
  "method" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "destination_ciphertext" TEXT NOT NULL,
  "destination_fingerprint" TEXT NOT NULL,
  "destination_masked" TEXT NOT NULL,
  "requested_by_id" TEXT NOT NULL,
  "approved_by_id" TEXT,
  "paid_by_id" TEXT,
  "payment_reference" TEXT,
  "rejection_reason" TEXT,
  "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approved_at" TIMESTAMP(3),
  "processing_at" TIMESTAMP(3),
  "paid_at" TIMESTAMP(3),
  "rejected_at" TIMESTAMP(3),
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vet_withdrawals_vet_profile_id_fkey'
  ) THEN
    ALTER TABLE "vet_withdrawals"
      ADD CONSTRAINT "vet_withdrawals_vet_profile_id_fkey"
      FOREIGN KEY ("vet_profile_id") REFERENCES "vet_profiles"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'transactions_settlement_batch_id_fkey'
  ) THEN
    ALTER TABLE "transactions"
      ADD CONSTRAINT "transactions_settlement_batch_id_fkey"
      FOREIGN KEY ("settlement_batch_id") REFERENCES "financial_settlement_batches"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vet_withdrawals_amount_positive'
  ) THEN
    ALTER TABLE "vet_withdrawals"
      ADD CONSTRAINT "vet_withdrawals_amount_positive"
      CHECK ("amount_cop" > 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vet_withdrawals_method_check'
  ) THEN
    ALTER TABLE "vet_withdrawals"
      ADD CONSTRAINT "vet_withdrawals_method_check"
      CHECK ("method" IN ('BANK_TRANSFER', 'NEQUI', 'DAVIPLATA'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vet_withdrawals_status_check'
  ) THEN
    ALTER TABLE "vet_withdrawals"
      ADD CONSTRAINT "vet_withdrawals_status_check"
      CHECK ("status" IN ('PENDING', 'APPROVED', 'PROCESSING', 'PAID', 'REJECTED', 'CANCELLED'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'transactions_transfer_evidence_required'
  ) THEN
    ALTER TABLE "transactions"
      ADD CONSTRAINT "transactions_transfer_evidence_required"
      CHECK (
        "payment_method"::text <> 'TRANSFER'
        OR "status"::text NOT IN ('VERIFYING', 'CONFIRMED', 'LIQUIDATED')
        OR ("transfer_proof_storage_key" IS NOT NULL AND "transfer_code" IS NOT NULL)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "transactions_settlement_batch_id_idx"
  ON "transactions"("settlement_batch_id");
CREATE INDEX IF NOT EXISTS "financial_settlement_batches_created_at_idx"
  ON "financial_settlement_batches"("created_at");
CREATE INDEX IF NOT EXISTS "vet_withdrawals_vet_profile_id_status_idx"
  ON "vet_withdrawals"("vet_profile_id", "status");
CREATE INDEX IF NOT EXISTS "vet_withdrawals_status_requested_at_idx"
  ON "vet_withdrawals"("status", "requested_at");

CREATE OR REPLACE FUNCTION public.enforce_vet_withdrawal_state_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."status" = OLD."status" THEN
    RETURN NEW;
  END IF;

  IF OLD."status" = 'PENDING' AND NEW."status" IN ('APPROVED', 'REJECTED', 'CANCELLED') THEN
    RETURN NEW;
  END IF;
  IF OLD."status" = 'APPROVED' AND NEW."status" IN ('PROCESSING', 'REJECTED', 'CANCELLED') THEN
    RETURN NEW;
  END IF;
  IF OLD."status" = 'PROCESSING' AND NEW."status" = 'PAID' THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Invalid vet withdrawal transition: % -> %', OLD."status", NEW."status";
END;
$$;

DROP TRIGGER IF EXISTS vet_withdrawal_state_guard ON public."vet_withdrawals";
CREATE TRIGGER vet_withdrawal_state_guard
BEFORE UPDATE OF "status"
ON public."vet_withdrawals"
FOR EACH ROW
EXECUTE FUNCTION public.enforce_vet_withdrawal_state_transition();
