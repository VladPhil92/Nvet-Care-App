-- Nvet Care · canonical CTG One SUPERADMIN binding
--
-- Security invariant:
--   * Exactly one CTG One identity is allowed to hold Nvet SUPERADMIN.
--   * The identity is bound to the immutable Supabase auth.users.id (`sub`),
--     never to browser input or an unverified role/email claim.
--   * First-time CTG One provisioning may still request CLIENT in application
--     code; this trigger upgrades only the canonical `ctg_user_id` atomically.
--   * Any attempt to assign SUPERADMIN to a different identity fails closed.
--
-- Canonical CTG One identity verified in the production Supabase project:
--   b7c5a0f0-0ff4-4470-9df5-aaa50fbf5405
-- A one-way MD5 fingerprint is used only to reconcile a possible pre-existing
-- Nvet row without publishing the account email in this public repository.
-- Ongoing authorization is based solely on the immutable UUID.

DO $$
DECLARE
  canonical_ctg_user_id CONSTANT uuid := 'b7c5a0f0-0ff4-4470-9df5-aaa50fbf5405'::uuid;
  canonical_email_fingerprint CONSTANT text := 'f28df668c2b5b4e37698ce037ee214ab';
  canonical_link_exists boolean;
BEGIN
  SELECT EXISTS(
    SELECT 1
    FROM public.users
    WHERE ctg_user_id = canonical_ctg_user_id
  ) INTO canonical_link_exists;

  -- A legacy Nvet account matching the canonical email fingerprint can be
  -- linked safely only when it is not already bound to a different CTG
  -- identity. This repairs the common email-collision case without enabling
  -- generic email-based account linking.
  IF NOT canonical_link_exists THEN
    IF EXISTS (
      SELECT 1
      FROM public.users
      WHERE md5(lower(email)) = canonical_email_fingerprint
        AND ctg_user_id IS NOT NULL
        AND ctg_user_id <> canonical_ctg_user_id
    ) THEN
      RAISE EXCEPTION
        'Canonical CTG One superadmin account is already linked to another CTG identity';
    END IF;

    UPDATE public.users
    SET ctg_user_id = canonical_ctg_user_id,
        role = 'SUPERADMIN'::"UserRole",
        email_verified = true,
        updated_at = now()
    WHERE md5(lower(email)) = canonical_email_fingerprint
      AND ctg_user_id IS NULL;
  END IF;

  -- If the canonical identity is already linked, promote that row regardless
  -- of a later email change. The immutable CTG UUID is the authority.
  UPDATE public.users
  SET role = 'SUPERADMIN'::"UserRole",
      email_verified = true,
      updated_at = now()
  WHERE ctg_user_id = canonical_ctg_user_id;

  -- Remove elevated ownership from every non-canonical row before installing
  -- the permanent trigger. ADMIN is retained to avoid unexpectedly stripping
  -- legitimate administrative access while still enforcing single ownership.
  UPDATE public.users
  SET role = 'ADMIN'::"UserRole",
      updated_at = now()
  WHERE role = 'SUPERADMIN'::"UserRole"
    AND ctg_user_id IS DISTINCT FROM canonical_ctg_user_id;
END
$$;

CREATE OR REPLACE FUNCTION public.enforce_canonical_nvet_superadmin()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  canonical_ctg_user_id CONSTANT uuid := 'b7c5a0f0-0ff4-4470-9df5-aaa50fbf5405'::uuid;
BEGIN
  IF NEW.ctg_user_id = canonical_ctg_user_id THEN
    -- The canonical CTG One identity always owns the Nvet SUPERADMIN role.
    NEW.role := 'SUPERADMIN'::"UserRole";
  ELSIF NEW.role = 'SUPERADMIN'::"UserRole" THEN
    -- No local registration, admin mutation, seed, or alternate CTG account
    -- may mint another SUPERADMIN.
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Nvet SUPERADMIN is reserved for the canonical CTG One identity';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_canonical_superadmin_guard ON public.users;

CREATE TRIGGER users_canonical_superadmin_guard
BEFORE INSERT OR UPDATE OF role, ctg_user_id
ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.enforce_canonical_nvet_superadmin();
