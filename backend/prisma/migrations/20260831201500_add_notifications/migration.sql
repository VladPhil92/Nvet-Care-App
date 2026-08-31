-- Notification & Reminder OS V1: durable, user-scoped in-app inbox.
CREATE TABLE IF NOT EXISTS "notifications" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "dedupe_key" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "action_path" TEXT,
  "metadata" JSONB,
  "occurred_at" TIMESTAMP(3) NOT NULL,
  "read_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "notifications_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "notifications_user_id_dedupe_key_key"
  ON "notifications"("user_id", "dedupe_key");

CREATE INDEX IF NOT EXISTS "notifications_user_id_read_at_occurred_at_idx"
  ON "notifications"("user_id", "read_at", "occurred_at");

CREATE INDEX IF NOT EXISTS "notifications_user_id_occurred_at_idx"
  ON "notifications"("user_id", "occurred_at");
