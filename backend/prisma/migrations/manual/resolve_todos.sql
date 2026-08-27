-- Migration: resolve_todos
-- Generated: 2026-05-23
-- Adds fields and models introduced when resolving all pending TODOs
-- Apply with: psql $DATABASE_URL -f prisma/migrations/manual/resolve_todos.sql

-- -------------------------------------------------------
-- New enums for MessageReport
-- -------------------------------------------------------
CREATE TYPE "ReportReason" AS ENUM ('INAPPROPRIATE_CONTENT', 'HARASSMENT', 'SPAM', 'FRAUD', 'OTHER');
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'REVIEWED', 'DISMISSED');

-- -------------------------------------------------------
-- User: client CTG wallet balance
-- -------------------------------------------------------
ALTER TABLE "users" ADD COLUMN "ctg_balance" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- -------------------------------------------------------
-- Appointment: GPS tracking + per-status timestamps
-- -------------------------------------------------------
ALTER TABLE "appointments"
  ADD COLUMN "vet_latitude"          DOUBLE PRECISION,
  ADD COLUMN "vet_longitude"         DOUBLE PRECISION,
  ADD COLUMN "vet_location_at"       TIMESTAMP(3),
  ADD COLUMN "eta_minutes"           INTEGER,
  ADD COLUMN "scheduled_at"          TIMESTAMP(3),
  ADD COLUMN "confirmed_at"          TIMESTAMP(3),
  ADD COLUMN "in_progress_at"        TIMESTAMP(3),
  ADD COLUMN "completed_at"          TIMESTAMP(3),
  ADD COLUMN "last_status_change_at" TIMESTAMP(3);

-- -------------------------------------------------------
-- Transaction: external ID from PSE provider
-- -------------------------------------------------------
ALTER TABLE "transactions" ADD COLUMN "external_transaction_id" TEXT;

-- -------------------------------------------------------
-- Message: read receipts
-- -------------------------------------------------------
ALTER TABLE "messages" ADD COLUMN "read_at" TIMESTAMP(3);
CREATE INDEX "messages_read_at_idx" ON "messages"("read_at");

-- -------------------------------------------------------
-- MessageReport: persist reported messages for admin review
-- -------------------------------------------------------
CREATE TABLE "message_reports" (
    "id"           TEXT         NOT NULL,
    "message_id"   TEXT         NOT NULL,
    "reporter_id"  TEXT         NOT NULL,
    "reason"       "ReportReason" NOT NULL,
    "details"      TEXT,
    "status"       "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "reviewed_by"  TEXT,
    "reviewed_at"  TIMESTAMP(3),
    "review_notes" TEXT,
    "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_reports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "message_reports_message_id_idx"  ON "message_reports"("message_id");
CREATE INDEX "message_reports_reporter_id_idx" ON "message_reports"("reporter_id");
CREATE INDEX "message_reports_status_idx"      ON "message_reports"("status");

ALTER TABLE "message_reports"
  ADD CONSTRAINT "message_reports_message_id_fkey"
  FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- -------------------------------------------------------
-- WaitlistEntry: store pre-launch interest list
-- -------------------------------------------------------
CREATE TABLE "waitlist_entries" (
    "id"         TEXT         NOT NULL,
    "email"      TEXT         NOT NULL,
    "source"     TEXT         NOT NULL DEFAULT 'store',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "waitlist_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "waitlist_entries_email_key" ON "waitlist_entries"("email");
CREATE INDEX        "waitlist_entries_email_idx" ON "waitlist_entries"("email");
