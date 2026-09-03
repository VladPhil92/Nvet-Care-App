-- ============================================================
-- Manual migration: auth_hardening_v2
-- ============================================================
-- Aplica el schema endurecido (Argon2id + 2FA + reset password + sessions
-- + email verification + audit log + idempotency keys + chat membership +
-- index performance) a una base ya en producción.
--
-- IMPORTANTE:
--   - Ejecutar dentro de una TRANSACTION manual (psql usa BEGIN ... COMMIT).
--   - Idempotente: usa IF NOT EXISTS donde puede; las columnas adicionadas
--     en una segunda ejecución NO fallarán (Postgres "ADD COLUMN IF NOT EXISTS"
--     desde 9.6).
--   - Tras aplicar este SQL, ejecutar `npx prisma generate` para regenerar
--     el cliente TypeScript.
--   - Si usas `prisma migrate dev`, este archivo es PURAMENTE DOCUMENTAL:
--     prisma generará uno equivalente automáticamente.
-- ============================================================

BEGIN;

-- ----------------------------------------------------------
-- 1. ENUMS — extensiones y nuevos
-- ----------------------------------------------------------

-- 1.1 AuditAction: agregar valores nuevos (idempotente con DO block)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AuditAction') THEN
    CREATE TYPE "AuditAction" AS ENUM (
      'REGISTER_SUCCESS','LOGIN_SUCCESS','LOGIN_FAILED','LOGIN_LOCKED',
      'LOGOUT','PASSWORD_CHANGED','PASSWORD_RESET_REQUESTED','PASSWORD_RESET_COMPLETED',
      'TOKEN_REVOKED','TWO_FACTOR_ENABLED','TWO_FACTOR_DISABLED',
      'EMAIL_VERIFICATION_SENT','EMAIL_VERIFIED',
      'VET_VERIFICATION_APPROVED','VET_VERIFICATION_REJECTED',
      'VET_TIER_CHANGED','VET_SUSPENDED','VET_REACTIVATED',
      'TRANSFER_VERIFIED','TRANSFER_REJECTED','DISPUTE_RESOLVED','REFUND_ISSUED',
      'USER_DELETED','ADMIN_IMPERSONATION','CONFIG_CHANGED'
    );
  ELSE
    -- Agregar valores que pueden faltar (PG ≥ 12 soporta IF NOT EXISTS)
    BEGIN ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'REGISTER_SUCCESS'; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'LOGIN_LOCKED'; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PASSWORD_RESET_REQUESTED'; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PASSWORD_RESET_COMPLETED'; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'TWO_FACTOR_ENABLED'; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'TWO_FACTOR_DISABLED'; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'EMAIL_VERIFICATION_SENT'; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'EMAIL_VERIFIED'; EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END$$;

-- 1.2 AuditSeverity (nuevo)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AuditSeverity') THEN
    CREATE TYPE "AuditSeverity" AS ENUM ('INFO','WARN','CRITICAL');
  END IF;
END$$;

-- 1.3 VerificationStatus (nuevo si no existe)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'VerificationStatus') THEN
    CREATE TYPE "VerificationStatus" AS ENUM ('NONE','PENDING','IN_REVIEW','APPROVED','REJECTED','EXPIRED');
  END IF;
END$$;

-- 1.4 DocumentType (nuevo si no existe)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DocumentType') THEN
    CREATE TYPE "DocumentType" AS ENUM ('COMVEZCOL_CARD','PROFESSIONAL_DEGREE','ID_DOCUMENT','ADDITIONAL');
  END IF;
END$$;

-- 1.5 DocumentStatus (nuevo si no existe)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DocumentStatus') THEN
    CREATE TYPE "DocumentStatus" AS ENUM ('UPLOADED','APPROVED','REJECTED','EXPIRED');
  END IF;
END$$;

-- 1.6 DayOfWeek (nuevo si no existe)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DayOfWeek') THEN
    CREATE TYPE "DayOfWeek" AS ENUM ('MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY');
  END IF;
END$$;

-- ----------------------------------------------------------
-- 2. USERS — agregar campos de seguridad
-- ----------------------------------------------------------

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "email_verified" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "email_verification_token_hash" TEXT,
  ADD COLUMN IF NOT EXISTS "email_verification_expires_at" TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "password_reset_token_hash" TEXT,
  ADD COLUMN IF NOT EXISTS "password_reset_expires_at" TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "password_changed_at" TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "two_factor_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "two_factor_secret" TEXT,
  ADD COLUMN IF NOT EXISTS "two_factor_enrolled_at" TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "recovery_codes_hash" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "locked_until" TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "last_login_at" TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "last_login_ip" TEXT,
  ADD COLUMN IF NOT EXISTS "last_login_user_agent" TEXT,
  ADD COLUMN IF NOT EXISTS "is_active" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "deactivated_at" TIMESTAMP;

CREATE INDEX IF NOT EXISTS "users_email_verified_idx" ON "users" ("email_verified");
CREATE INDEX IF NOT EXISTS "users_locked_until_idx"   ON "users" ("locked_until");

-- ----------------------------------------------------------
-- 3. USER_SESSIONS (nuevo modelo)
-- ----------------------------------------------------------

CREATE TABLE IF NOT EXISTS "user_sessions" (
  "id"                    TEXT      PRIMARY KEY,
  "user_id"               TEXT      NOT NULL,
  "refresh_token_hash"    TEXT      NOT NULL UNIQUE,
  "previous_token_hashes" TEXT[]    NOT NULL DEFAULT ARRAY[]::TEXT[],
  "user_agent"            TEXT,
  "ip_address"            TEXT,
  "device_label"          TEXT,
  "expires_at"            TIMESTAMP NOT NULL,
  "revoked_at"            TIMESTAMP,
  "revoked_reason"        TEXT,
  "last_used_at"          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at"            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_sessions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

-- Idempotente: si la tabla ya existía sin la columna, agregarla
ALTER TABLE "user_sessions"
  ADD COLUMN IF NOT EXISTS "previous_token_hashes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE INDEX IF NOT EXISTS "user_sessions_user_id_idx"            ON "user_sessions" ("user_id");
CREATE INDEX IF NOT EXISTS "user_sessions_refresh_token_hash_idx" ON "user_sessions" ("refresh_token_hash");
CREATE INDEX IF NOT EXISTS "user_sessions_expires_at_idx"         ON "user_sessions" ("expires_at");
-- GIN index para queries `previous_token_hashes @> ARRAY[hash]` (reuse detection)
CREATE INDEX IF NOT EXISTS "user_sessions_previous_token_hashes_idx"
  ON "user_sessions" USING GIN ("previous_token_hashes");

-- ----------------------------------------------------------
-- 4. AUDIT_LOGS (nuevo modelo append-only)
-- ----------------------------------------------------------

CREATE TABLE IF NOT EXISTS "audit_logs" (
  "id"                TEXT          PRIMARY KEY,
  "actor_id"          TEXT,
  "actor_role"        TEXT,
  "actor_ip"          TEXT,
  "actor_user_agent"  TEXT,
  "action"            "AuditAction" NOT NULL,
  "severity"          "AuditSeverity" NOT NULL DEFAULT 'INFO',
  "target_type"       TEXT,
  "target_id"         TEXT,
  "before_data"       JSONB,
  "after_data"        JSONB,
  "reason"            TEXT,
  "metadata"          JSONB,
  "created_at"        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "audit_logs_actor_id_idx"                ON "audit_logs" ("actor_id");
CREATE INDEX IF NOT EXISTS "audit_logs_action_idx"                  ON "audit_logs" ("action");
CREATE INDEX IF NOT EXISTS "audit_logs_target_type_target_id_idx"   ON "audit_logs" ("target_type", "target_id");
CREATE INDEX IF NOT EXISTS "audit_logs_created_at_idx"              ON "audit_logs" ("created_at");
CREATE INDEX IF NOT EXISTS "audit_logs_severity_created_at_idx"    ON "audit_logs" ("severity", "created_at");

-- ----------------------------------------------------------
-- 5. IDEMPOTENCY_KEYS (nuevo modelo)
-- ----------------------------------------------------------

CREATE TABLE IF NOT EXISTS "idempotency_keys" (
  "id"               TEXT      PRIMARY KEY,
  "key"              TEXT      NOT NULL UNIQUE,
  "endpoint"         TEXT      NOT NULL,
  "user_id"          TEXT,
  "request_hash"     TEXT      NOT NULL,
  "response_status"  INTEGER   NOT NULL,
  "response_body"    JSONB,
  "expires_at"       TIMESTAMP NOT NULL,
  "created_at"       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idempotency_keys_expires_at_idx" ON "idempotency_keys" ("expires_at");
CREATE INDEX IF NOT EXISTS "idempotency_keys_user_id_idx"    ON "idempotency_keys" ("user_id");

-- ----------------------------------------------------------
-- 6. PERFORMANCE INDEXES (compuestos para queries hot)
-- ----------------------------------------------------------

-- Appointments: dashboard del vet (citas hoy/semana) + "mis citas activas" del cliente
CREATE INDEX IF NOT EXISTS "appointments_vet_id_date_status_idx"
  ON "appointments" ("vet_id", "date", "status");
CREATE INDEX IF NOT EXISTS "appointments_client_id_status_idx"
  ON "appointments" ("client_id", "status");

-- Transactions: panel admin con filtros combinados
CREATE INDEX IF NOT EXISTS "transactions_status_payment_method_created_at_idx"
  ON "transactions" ("status", "payment_method", "created_at");

-- Messages: timeline ordenado del chat + actividad del usuario
CREATE INDEX IF NOT EXISTS "messages_appointment_id_created_at_idx"
  ON "messages" ("appointment_id", "created_at");
CREATE INDEX IF NOT EXISTS "messages_sender_id_idx"
  ON "messages" ("sender_id");

-- Reviews: mejores ratings de un vet
CREATE INDEX IF NOT EXISTS "reviews_vet_id_rating_idx"
  ON "reviews" ("vet_id", "rating");

-- VetProfile: filtros del catálogo público
CREATE INDEX IF NOT EXISTS "vet_profiles_verification_status_idx"
  ON "vet_profiles" ("verification_status");
CREATE INDEX IF NOT EXISTS "vet_profiles_city_idx"
  ON "vet_profiles" ("city");
CREATE INDEX IF NOT EXISTS "vet_profiles_tier_is_available_now_idx"
  ON "vet_profiles" ("tier", "is_available_now");

COMMIT;

-- ============================================================
-- Verificación post-migración
-- ============================================================
-- Después de COMMIT exitoso, validar:
--   SELECT COUNT(*) FROM information_schema.columns
--     WHERE table_name = 'users'
--     AND column_name IN ('email_verified','two_factor_enabled','locked_until');
--   -- Debe retornar 3
--
--   SELECT COUNT(*) FROM information_schema.tables
--     WHERE table_name IN ('user_sessions','audit_logs','idempotency_keys');
--   -- Debe retornar 3
--
--   SELECT COUNT(*) FROM pg_enum
--     WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction');
--   -- Debe retornar 25 (los valores nuevos de la versión v2)
