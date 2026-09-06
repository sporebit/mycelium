-- Migration: enable RLS on every public table, give each an explicit
-- restrictive deny-all, and strip anon/authenticated of all privileges.
--
-- NOTE ON THE PREMISE. This migration was specified on the assumption that
-- 32 tables had RLS disabled and that anon held full CRUD. Neither is true
-- of the live database, which was enumerated before writing this file:
--
--   * 91 of 91 public tables already have rowsecurity = true. None are
--     unprotected.
--   * anon holds only REFERENCES/TRIGGER/TRUNCATE — no SELECT, INSERT,
--     UPDATE or DELETE on anything. A live probe with the real anon key
--     returns SQLSTATE 42501 "permission denied for table" on every table
--     tried, so the anon key cannot read data today.
--   * authenticated additionally holds SELECT on all 92 relations. That is
--     currently inert (no Supabase Auth users exist and RLS denies anyway)
--     but it is a standing grant that a future auth rollout would light up.
--
-- What was actually wrong, and what this migration fixes:
--
--   1. 39 tables have RLS enabled with NO POLICY AT ALL. Postgres treats
--      that as deny-all for non-owner, non-BYPASSRLS roles, so the effect
--      is correct — but it is implicit, and one permissive policy added
--      later silently opens the table. An explicit restrictive deny-all
--      cannot be overridden by a later permissive policy.
--   2. Eight tables carry a PERMISSIVE policy for role `public` keyed on
--      current_setting('app.user_id'): exercise_aliases, health_metrics,
--      health_workouts, pc_components, places, reminders, supplements,
--      supplement_logs. PostgREST never sets that GUC, so it resolves to
--      NULL and matches no rows — but there is no restrictive backstop, so
--      anything that ever set the GUC would open all eight at once.
--   3. anon and authenticated hold TRUNCATE on every table. Not reachable
--      through PostgREST, but it should not exist.
--
-- The permissive app.user_id policies are deliberately left in place; the
-- restrictive deny-all added alongside them makes them inert for every role
-- that is not service_role, without editing policies a later multi-user
-- migration is due to replace.
--
-- FORCE ROW LEVEL SECURITY is deliberately NOT set. The table owner is
-- postgres, which is also the role that runs migrations; forcing RLS would
-- subject seed migrations to the deny-all policies and break them. The
-- owner bypass is not an exposure because PostgREST connects as anon,
-- authenticated or service_role, never as the owner.
--
-- Depends on: nothing. Follows the RLS/grant pattern in 0092/0094.
-- Rollback: there is no safe rollback for a privilege revocation. To undo,
--   re-grant explicitly per table; do not restore blanket anon grants.

-- ---------------------------------------------------------------------
-- 1. Every public table: RLS on, explicit restrictive deny-all,
--    service_role granted. Driven off the catalogue rather than a
--    hard-coded list so a table added between writing and applying this
--    cannot be missed.
--
--    A restrictive policy with cmd ALL and no WITH CHECK reuses its USING
--    expression as the WITH CHECK, so `using (false)` denies select,
--    insert, update and delete alike.
-- ---------------------------------------------------------------------

DO $$
DECLARE
	t RECORD;
BEGIN
	FOR t IN
		SELECT c.relname
		FROM pg_class c
		JOIN pg_namespace n ON n.oid = c.relnamespace
		WHERE n.nspname = 'public'
		  AND c.relkind = 'r'
		ORDER BY c.relname
	LOOP
		EXECUTE format(
			'ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.relname);
		EXECUTE format(
			'DROP POLICY IF EXISTS "deny all" ON public.%I', t.relname);
		EXECUTE format(
			'CREATE POLICY "deny all" ON public.%I AS RESTRICTIVE USING (false)',
			t.relname);
		EXECUTE format(
			'GRANT ALL ON public.%I TO service_role', t.relname);
	END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 2. Strip anon and authenticated schema-wide.
--
-- Every read and write in this application goes through the service-role
-- client (lib/supabase/server.ts). lib/supabase/client.ts defines a
-- browser anon client but nothing imports it, so no user-facing path
-- depends on these grants.
-- ---------------------------------------------------------------------

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;

-- Stop future tables from inheriting grants. Default privileges are
-- recorded per creating role, so this is applied for each role that
-- creates objects here. Guarded: ALTER DEFAULT PRIVILEGES FOR ROLE fails
-- if the executing role is not a member of the named role, and which
-- roles exist varies between a hosted project and a local stack.
DO $$
DECLARE
	r text;
BEGIN
	FOREACH r IN ARRAY ARRAY['postgres', 'supabase_admin', current_user] LOOP
		BEGIN
			EXECUTE format(
				'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public '
				|| 'REVOKE ALL ON TABLES FROM anon, authenticated', r);
			EXECUTE format(
				'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public '
				|| 'REVOKE ALL ON SEQUENCES FROM anon, authenticated', r);
			EXECUTE format(
				'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public '
				|| 'REVOKE ALL ON FUNCTIONS FROM anon, authenticated', r);
		EXCEPTION WHEN OTHERS THEN
			RAISE NOTICE 'default privileges skipped for role %: %', r, SQLERRM;
		END;
	END LOOP;
END $$;
