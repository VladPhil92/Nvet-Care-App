-- ============================================================
-- Nvet Care — appointment-scoped live location
-- ============================================================
-- Live GPS coordinates must not overwrite VetProfile latitude/longitude,
-- because those fields represent the veterinarian's service/discovery base.
-- Tracking coordinates are private, ephemeral appointment data.
--
-- IMPORTANT: Appointment.id is Prisma String @default(uuid()), which maps to
-- PostgreSQL TEXT unless @db.Uuid is explicitly declared. Keep appointment_id
-- as TEXT so the FK type always matches appointments(id).

CREATE TABLE IF NOT EXISTS appointment_live_locations (
  appointment_id TEXT PRIMARY KEY,
  latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  accuracy DOUBLE PRECISION NULL CHECK (accuracy IS NULL OR accuracy BETWEEN 0 AND 5000),
  heading DOUBLE PRECISION NULL CHECK (heading IS NULL OR heading BETWEEN 0 AND 360),
  speed_mps DOUBLE PRECISION NULL CHECK (speed_mps IS NULL OR speed_mps BETWEEN 0 AND 100),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Repair a partially/manual-created legacy table that used UUID. The UUID ->
-- TEXT cast is lossless. Any other unexpected type aborts the deployment so
-- production never silently coerces an unknown schema.
DO $$
DECLARE
  appointment_id_type TEXT;
BEGIN
  SELECT data_type
    INTO appointment_id_type
  FROM information_schema.columns
  WHERE table_schema = current_schema()
    AND table_name = 'appointment_live_locations'
    AND column_name = 'appointment_id';

  IF appointment_id_type = 'uuid' THEN
    ALTER TABLE appointment_live_locations
      DROP CONSTRAINT IF EXISTS appointment_live_locations_appointment_fk;

    ALTER TABLE appointment_live_locations
      ALTER COLUMN appointment_id TYPE TEXT
      USING appointment_id::text;
  ELSIF appointment_id_type IS DISTINCT FROM 'text' THEN
    RAISE EXCEPTION
      'appointment_live_locations.appointment_id has unexpected type: %',
      appointment_id_type;
  END IF;
END;
$$;

-- Add the FK separately so this file remains idempotent for both a fresh table
-- and an already-created table repaired above. If orphan rows exist, PostgreSQL
-- rejects the constraint and predeploy stops fail-closed.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'appointment_live_locations_appointment_fk'
      AND conrelid = 'appointment_live_locations'::regclass
  ) THEN
    ALTER TABLE appointment_live_locations
      ADD CONSTRAINT appointment_live_locations_appointment_fk
      FOREIGN KEY (appointment_id)
      REFERENCES appointments(id)
      ON DELETE CASCADE;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS appointment_live_locations_updated_at_idx
  ON appointment_live_locations(updated_at);

COMMENT ON TABLE appointment_live_locations IS
  'Private ephemeral veterinarian GPS position scoped to an active appointment.';

-- Privacy retention rule: once the service is no longer trackable, remove the
-- precise coordinate immediately rather than retaining a movement trace.
CREATE OR REPLACE FUNCTION nvet_clear_closed_appointment_live_location()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('COMPLETED', 'CANCELLED', 'DISPUTED') THEN
    DELETE FROM appointment_live_locations
    WHERE appointment_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS appointments_clear_live_location_on_close ON appointments;
CREATE TRIGGER appointments_clear_live_location_on_close
AFTER UPDATE OF status ON appointments
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION nvet_clear_closed_appointment_live_location();
