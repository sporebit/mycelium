-- LOCAL-ONLY seed. Loaded by the Supabase CLI after migrations on a fresh
-- local stack (config.toml [db.seed]). It is never applied to the hosted
-- project: `supabase db push` ships migrations only, and Part 7 creates
-- Phil's live auth user by hand with the SAME id.
--
-- What it does: creates Phil's auth user with the fixed uid from
-- app.legacy_user_uid('phil'), its email identity, and marks the profile
-- (created by the on_auth_user_created trigger) as instance owner.
--
-- Local credentials (not secrets; they only work against the local stack):
--   email    phil@mycelium.local
--   password mycelium-local
-- Magic links land in Mailpit (`supabase status` prints the URL).
--
-- Idempotent: safe to re-run with `supabase db reset` or by piping through
-- the container's psql (see docs/multi-user-handoff.md).

insert into auth.users (
	instance_id, id, aud, role, email, encrypted_password,
	email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
	created_at, updated_at,
	confirmation_token, recovery_token, email_change_token_new, email_change,
	email_change_token_current, phone_change, phone_change_token,
	reauthentication_token, is_sso_user, is_anonymous
)
values (
	'00000000-0000-0000-0000-000000000000',
	app.legacy_user_uid('phil'),
	'authenticated',
	'authenticated',
	'phil@mycelium.local',
	extensions.crypt('mycelium-local', extensions.gen_salt('bf')),
	now(),
	'{"provider":"email","providers":["email"]}'::jsonb,
	'{"display_name":"Phil"}'::jsonb,
	now(),
	now(),
	'', '', '', '', '', '', '', '', false, false
)
on conflict (id) do nothing;

insert into auth.identities (
	id, user_id, provider_id, identity_data, provider,
	last_sign_in_at, created_at, updated_at
)
values (
	gen_random_uuid(),
	app.legacy_user_uid('phil'),
	app.legacy_user_uid('phil')::text,
	jsonb_build_object(
		'sub', app.legacy_user_uid('phil')::text,
		'email', 'phil@mycelium.local',
		'email_verified', true
	),
	'email',
	now(), now(), now()
)
on conflict (provider_id, provider) do nothing;

-- The trigger created the profile; promote it.
update public.profiles
set is_instance_owner = true,
    display_name = coalesce(display_name, 'Phil')
where id = app.legacy_user_uid('phil');
