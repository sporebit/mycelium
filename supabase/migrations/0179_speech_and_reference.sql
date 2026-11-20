-- 0179 — the PC's voice, and bulk reference data held on the PC (master run §9, MYC-187).
--
-- 1. speech_clips: one row per spoken line the PC has rendered (or is
--    rendering), keyed by the words and the voice, with the file in the
--    private `speech` bucket. Personal (0111 shape): what the app says to
--    a person is theirs.
-- 2. gousto_recipes: two stamps so the 12,000 recipe details (46 MB of the
--    hosted database's 88 MB) can live on the PC. `detail_opened_at` says
--    when a person last read the full recipe; `detail_offloaded_at` says
--    the PC holds the detail and the hosted copy was cleared. The listing
--    columns stay, so the cookbook pages and search lose nothing.
-- 3. pc_metrics: its indexes held 744 kB for no rows; rebuilt.

-- 1. speech_clips -------------------------------------------------------
create table if not exists public.speech_clips (
	id             uuid        primary key default gen_random_uuid(),
	-- sha256 of voice + text: the same line in the same voice is one clip
	key            text        not null,
	voice          text        not null,
	text           text        not null,
	-- '<id>/clip.wav' in the speech bucket once the PC has uploaded it
	path           text,
	seconds        numeric,
	bytes          integer,
	created_at     timestamptz not null default now(),
	ready_at       timestamptz,
	last_played_at timestamptz
);

select app.adopt_table('speech_clips');
alter table public.speech_clips enable row level security;
grant all on public.speech_clips to service_role;

insert into public.entity_groups (table_name, section, entity_group)
values ('speech_clips', 'platform', 'speech')
on conflict (table_name) do update set section = excluded.section, entity_group = excluded.entity_group;

drop policy if exists "deny all"           on public.speech_clips;
drop policy if exists speech_clips_select  on public.speech_clips;
drop policy if exists speech_clips_insert  on public.speech_clips;
drop policy if exists speech_clips_update  on public.speech_clips;
drop policy if exists speech_clips_delete  on public.speech_clips;
create policy speech_clips_select on public.speech_clips for select to authenticated using (space_id = app.personal_space());
create policy speech_clips_insert on public.speech_clips for insert to authenticated with check (space_id = app.personal_space());
create policy speech_clips_update on public.speech_clips for update to authenticated using (space_id = app.personal_space()) with check (space_id = app.personal_space());
create policy speech_clips_delete on public.speech_clips for delete to authenticated using (space_id = app.personal_space());
grant select, insert, update, delete on public.speech_clips to authenticated;
alter table public.speech_clips alter column space_id set default app.personal_space();
alter table public.speech_clips alter column created_by set default auth.uid();

create unique index if not exists speech_clips_space_key_idx on public.speech_clips (space_id, key);
create index if not exists speech_clips_played_idx on public.speech_clips (space_id, last_played_at);

-- the bucket: private; a file belongs to its clip's row, and the row to its owner
insert into storage.buckets (id, name, public, file_size_limit)
values ('speech', 'speech', false, 20971520)
on conflict (id) do nothing;

drop policy if exists "speech read"   on storage.objects;
drop policy if exists "speech write"  on storage.objects;
drop policy if exists "speech delete" on storage.objects;

create policy "speech read" on storage.objects for select to authenticated
using (
	bucket_id = 'speech'
	and exists (
		select 1 from public.speech_clips c
		where c.id = app.uuid_or_null((storage.foldername(name))[1])
			and c.space_id = app.personal_space()
	)
);

create policy "speech write" on storage.objects for insert to authenticated
with check (
	bucket_id = 'speech'
	and exists (
		select 1 from public.speech_clips c
		where c.id = app.uuid_or_null((storage.foldername(name))[1])
			and c.space_id = app.personal_space()
	)
);

create policy "speech delete" on storage.objects for delete to authenticated
using (
	bucket_id = 'speech'
	and exists (
		select 1 from public.speech_clips c
		where c.id = app.uuid_or_null((storage.foldername(name))[1])
			and c.space_id = app.personal_space()
	)
);

-- 2. gousto_recipes: the detail can live on the PC -----------------------
alter table public.gousto_recipes
	add column if not exists detail_opened_at    timestamptz,
	add column if not exists detail_offloaded_at timestamptz;

-- the offload sweep: rows still holding a detail, coldest first
create index if not exists gousto_recipes_detail_cold_idx
	on public.gousto_recipes (space_id, detail_opened_at)
	where detail is not null;

-- 3. pc_metrics: rebuild the indexes a cleared table left behind ----------
reindex table public.pc_metrics;
