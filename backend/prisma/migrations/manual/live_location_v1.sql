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
