-- ============================================================
-- Nvet Care — appointment-scoped live location
-- ============================================================
-- Live GPS coordinates must not overwrite VetProfile latitude/longitude,
-- because those fields represent the veterinarian's service/discovery base.
-- Tracking coordinates are private, ephemeral appointment data.

CREATE TABLE IF NOT EXISTS appointment_live_locations (
  appointment_id UUID PRIMARY KEY,
  latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  accuracy DOUBLE PRECISION NULL CHECK (accuracy IS NULL OR accuracy BETWEEN 0 AND 5000),
  heading DOUBLE PRECISION NULL CHECK (heading IS NULL OR heading BETWEEN 0 AND 360),
  speed_mps DOUBLE PRECISION NULL CHECK (speed_mps IS NULL OR speed_mps BETWEEN 0 AND 100),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT appointment_live_locations_appointment_fk
    FOREIGN KEY (appointment_id)
    REFERENCES appointments(id)
    ON DELETE CASCADE
);

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
