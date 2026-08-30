-- Add the privileged platform owner role without creating a separate login surface.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'SUPERADMIN';
