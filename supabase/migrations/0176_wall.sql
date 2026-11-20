-- 0176 — the wall screen (master run §11, Stream G).
--
-- The wall is a household device in the family team. It never holds a
-- person's session: it holds a scoped token (api_tokens, routes ["wall"])
-- owned by a device user that is an ordinary member of the family team,
-- so every family read goes through the same row rules as a person's.
-- Entering a person's own view needs that person's quick unlock: a short
-- PIN they set themselves, kept hashed in their own space; the server
-- then acts for them, read-only, for ten minutes, on the wall routes only.
--
--   wall_devices    one row per paired wall: which team, which device
--                   user, which token; revoked_at ends it
--   wall_pairings   a pairing code shown once in Settings, good for ten
--                   minutes, redeemed once by the wall
--   quick_unlocks   a person's PIN, hashed, in their personal space
--
-- The first two are platform tables: no authenticated policy at all
-- (service role only, through lib/system/wall.ts). The third is owner-only
-- in the 0111 shape. Depends on: 0103 (adopt_table, personal_space), 0111.

create table if not exists public.wall_devices (
	id              uuid primary key default gen_random_uuid(),
	team_space_id   uuid not null references public.spaces(id) on delete cascade,
	device_user_id  uuid not null references auth.users(id) on delete cascade,
	token_id        uuid not null references public.api_tokens(id) on delete cascade,
	label           text not null default 'Wall' check (length(label) between 1 and 60),
	paired_at       timestamptz,
	revoked_at      timestamptz
);

create table if not exists public.wall_pairings (
	id              uuid primary key default gen_random_uuid(),
	device_id       uuid not null references public.wall_devices(id) on delete cascade,
	code_hash       text not null unique,
	-- the device token, kept only until the code is redeemed or expires
	token           text,
	expires_at      timestamptz not null,
	used_at         timestamptz
);

create table if not exists public.quick_unlocks (
	id          uuid primary key default gen_random_uuid(),
	pin_hash    text not null,
	salt        text not null,
	updated_at  timestamptz not null default now()
);

do $$
declare
	t text;
begin
	foreach t in array array['wall_devices', 'wall_pairings', 'quick_unlocks']
	loop
		perform app.adopt_table(t);
		execute format('alter table public.%I enable row level security', t);
		execute format('grant all on public.%I to service_role', t);
		execute format('drop policy if exists "deny all" on public.%I', t);
		execute format('drop policy if exists %I on public.%I', t || '_select', t);
		execute format('drop policy if exists %I on public.%I', t || '_insert', t);
		execute format('drop policy if exists %I on public.%I', t || '_update', t);
		execute format('drop policy if exists %I on public.%I', t || '_delete', t);
		execute format('revoke all on public.%I from authenticated, anon', t);
	end loop;

	insert into public.entity_groups (table_name, section, entity_group) values
		('wall_devices', 'platform', 'wall'),
		('wall_pairings', 'platform', 'wall'),
		('quick_unlocks', 'platform', 'quick_unlock')
	on conflict (table_name) do update set section = excluded.section, entity_group = excluded.entity_group;

	-- quick_unlocks: owner-only, the 0111 shape. One row a person.
	create policy quick_unlocks_select on public.quick_unlocks for select to authenticated using (space_id = app.personal_space());
	create policy quick_unlocks_insert on public.quick_unlocks for insert to authenticated with check (space_id = app.personal_space());
	create policy quick_unlocks_update on public.quick_unlocks for update to authenticated using (space_id = app.personal_space()) with check (space_id = app.personal_space());
	create policy quick_unlocks_delete on public.quick_unlocks for delete to authenticated using (space_id = app.personal_space());
	grant select, insert, update, delete on public.quick_unlocks to authenticated;
	alter table public.quick_unlocks alter column space_id set default app.personal_space();
	alter table public.quick_unlocks alter column created_by set default auth.uid();
end
$$;

create unique index if not exists quick_unlocks_one_per_space on public.quick_unlocks (space_id);
create index if not exists wall_devices_team on public.wall_devices (team_space_id) where revoked_at is null;
create index if not exists wall_pairings_live on public.wall_pairings (expires_at) where used_at is null;
