-- ============================================================
-- Nvet Care — Booking integrity v1
-- Prevents two active appointments for the same vet/date/time.
--
-- This is a partial unique index because CANCELLED/COMPLETED/DISPUTED
-- appointments must not permanently reserve a slot.
-- Idempotent and safe to re-run.
-- ============================================================

-- Fail loudly if production already contains duplicate active slots.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM appointments
    WHERE status IN (
      'PENDING'::"AppointmentStatus",
      'CONFIRMED'::"AppointmentStatus",
      'IN_PROGRESS'::"AppointmentStatus"
    )
    GROUP BY vet_id, date, time
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'booking_integrity_v1: duplicate active veterinarian slots exist; resolve them before creating the unique index';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS appointments_active_slot_unique
  ON appointments (vet_id, date, time)
  WHERE status IN (
    'PENDING'::"AppointmentStatus",
    'CONFIRMED'::"AppointmentStatus",
    'IN_PROGRESS'::"AppointmentStatus"
  );

COMMENT ON INDEX appointments_active_slot_unique IS
  'Guarantees one active appointment per veterinarian/date/time slot; application maps conflicts to HTTP 409.';
