-- 0159_capture_pipeline.sql
-- Capture that answers at once and never loses anything (master run §5),
-- and the job queue the PC collects from (§9).
--
--   1. raw_captures — the row is written the moment a capture arrives, with
--      `status = 'received'`; transcription, paragraphs, splitting and
--      classification happen afterwards and move it to 'processed'.
--      Long captures are split into child rows (`parent_capture_id`), each
--      its own review card linked to the original recording. The dictated
--      text is kept beside the corrected text, and `text_edited` records a
--      hand edit, which a later re-transcription must never overwrite.
--      `auto_filed_at` is the seven-day rule: an unreviewed card files
--      itself with the AI's guess and is tagged "unreviewed".
--   2. Bucket `captures` — the audio, private, under `<capture id>/…`, with
--      the 0158 rule: a file follows its row.
--   3. jobs — work for the PC (Whisper, local classification, speech) or
--      for the cloud when the PC is off. Owner-only (platform). Claimed by
--      the worker through claim_jobs(), which only the service role may
--      call; a claim is a lease, so a worker that dies gives the job back.
--   4. workers — one row per machine that collects jobs, with its last
--      heartbeat. Instance-level reference data: no space_id, readable by
--      any signed-in user ("is the PC on?"), written by the service role.
--
-- Depends on: 0158.

-- 1. raw_captures -------------------------------------------------------
alter table public.raw_captures
	add column if not exists status            text        not null default 'processed',
	add column if not exists parent_capture_id uuid        references public.raw_captures (id) on delete cascade,
	add column if not exists segment_index     int,
	add column if not exists audio_path        text,
	add column if not exists dictation_text    text,
	add column if not exists text_source       text,
	add column if not exists text_edited       boolean     not null default false,
	add column if not exists auto_filed_at     timestamptz,
	add column if not exists processed_at      timestamptz,
	add column if not exists process_attempts  int         not null default 0,
	add column if not exists process_error     text;

do $$
begin
	if not exists (select 1 from pg_constraint where conname = 'raw_captures_status_check') then
		alter table public.raw_captures
			add constraint raw_captures_status_check check (status in ('received', 'processing', 'processed', 'failed'));
	end if;
	if not exists (select 1 from pg_constraint where conname = 'raw_captures_text_source_check') then
		alter table public.raw_captures
			add constraint raw_captures_text_source_check
			check (text_source is null or text_source in ('typed', 'dictation', 'whisper_pc', 'whisper_cloud'));
	end if;
	if not exists (select 1 from pg_constraint where conname = 'raw_captures_not_own_parent') then
		alter table public.raw_captures
			add constraint raw_captures_not_own_parent check (parent_capture_id is null or parent_capture_id <> id);
	end if;
end
$$;

create index if not exists raw_captures_unprocessed_idx
	on public.raw_captures (created_at)
	where status in ('received', 'processing', 'failed');
create index if not exists raw_captures_parent_idx
	on public.raw_captures (parent_capture_id, segment_index)
	where parent_capture_id is not null;
-- the evening review queue: everything not yet reviewed, oldest first
create index if not exists raw_captures_review_queue_idx
	on public.raw_captures (space_id, created_at)
	where reviewed_at is null and discarded_at is null and deleted_at is null;

-- 2. the audio bucket ---------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('captures', 'captures', false, 52428800)
on conflict (id) do nothing;

drop policy if exists "captures audio read"   on storage.objects;
drop policy if exists "captures audio write"  on storage.objects;
drop policy if exists "captures audio delete" on storage.objects;

create policy "captures audio read" on storage.objects for select to authenticated
using (
	bucket_id = 'captures'
	and exists (
		select 1 from public.raw_captures c
		where c.id = app.uuid_or_null((storage.foldername(name))[1])
	)
);

create policy "captures audio write" on storage.objects for insert to authenticated
with check (
	bucket_id = 'captures'
	and exists (
		select 1 from public.raw_captures c
		where c.id = app.uuid_or_null((storage.foldername(name))[1])
			and c.space_id in (select app.accessible_spaces('organisation.captures', 'edit'))
	)
);

create policy "captures audio delete" on storage.objects for delete to authenticated
using (
	bucket_id = 'captures'
	and exists (
		select 1 from public.raw_captures c
		where c.id = app.uuid_or_null((storage.foldername(name))[1])
			and c.space_id in (select app.accessible_spaces('organisation.captures', 'edit'))
	)
);

-- 3. jobs ---------------------------------------------------------------
create table if not exists public.jobs (
	id           uuid        primary key default gen_random_uuid(),
	kind         text        not null,
	payload      jsonb       not null default '{}'::jsonb,
	status       text        not null default 'queued' check (status in ('queued', 'claimed', 'done', 'failed', 'cancelled')),
	-- 'pc': wait for the PC. 'cloud': run in the cloud. 'any': PC first, cloud after `cloud_after`.
	lane         text        not null default 'pc' check (lane in ('pc', 'cloud', 'any')),
	cloud_after  timestamptz,
	run_after    timestamptz not null default now(),
	attempts     int         not null default 0,
	max_attempts int         not null default 5,
	claimed_by   text,
	claimed_at   timestamptz,
	lease_until  timestamptz,
	result       jsonb,
	error        text,
	-- one live job per key: a retry of the same request must not queue twice
	dedupe_key   text,
	created_at   timestamptz not null default now(),
	finished_at  timestamptz
);

select app.adopt_table('jobs');
alter table public.jobs enable row level security;
grant all on public.jobs to service_role;

create unique index if not exists jobs_dedupe_live_idx
	on public.jobs (space_id, dedupe_key)
	where dedupe_key is not null and status in ('queued', 'claimed');
create index if not exists jobs_queue_idx on public.jobs (run_after) where status = 'queued';
create index if not exists jobs_leased_idx on public.jobs (lease_until) where status = 'claimed';
create index if not exists jobs_space_created_idx on public.jobs (space_id, created_at desc);

insert into public.entity_groups (table_name, section, entity_group)
values ('jobs', 'platform', 'jobs')
on conflict (table_name) do update set section = excluded.section, entity_group = excluded.entity_group;

-- owner-only policies (the 0111 loop's platform branch, for this table)
drop policy if exists "deny all"   on public.jobs;
drop policy if exists jobs_select  on public.jobs;
drop policy if exists jobs_insert  on public.jobs;
drop policy if exists jobs_update  on public.jobs;
drop policy if exists jobs_delete  on public.jobs;
create policy jobs_select on public.jobs for select to authenticated using (space_id = app.personal_space());
create policy jobs_insert on public.jobs for insert to authenticated with check (space_id = app.personal_space());
create policy jobs_update on public.jobs for update to authenticated using (space_id = app.personal_space()) with check (space_id = app.personal_space());
create policy jobs_delete on public.jobs for delete to authenticated using (space_id = app.personal_space());
grant select, insert, update, delete on public.jobs to authenticated;
alter table public.jobs alter column space_id set default app.personal_space();
alter table public.jobs alter column created_by set default auth.uid();

-- Claim up to p_limit jobs of the given kinds for a worker. A claim is a
-- lease: if the worker does not finish before lease_until, the job is
-- claimable again. Jobs for the PC lane are claimable by a 'pc' worker;
-- 'any' jobs by either, and by the cloud only once cloud_after has passed.
create or replace function public.claim_jobs(
	p_worker        text,
	p_lane          text,
	p_kinds         text[],
	p_limit         int default 5,
	p_lease_seconds int default 300
)
returns setof public.jobs
language plpgsql
security definer
set search_path = ''
as $$
begin
	if p_lane not in ('pc', 'cloud') then raise exception 'lane must be pc or cloud'; end if;
	return query
	with picked as (
		select j.id
		from public.jobs j
		where j.kind = any (p_kinds)
			and j.attempts < j.max_attempts
			and (
				(j.status = 'queued' and j.run_after <= now())
				or (j.status = 'claimed' and j.lease_until < now())
			)
			and (
				j.lane = p_lane
				or (j.lane = 'any' and (p_lane = 'pc' or j.cloud_after is null or j.cloud_after <= now()))
			)
		order by j.run_after, j.created_at
		limit greatest(1, least(p_limit, 50))
		for update skip locked
	)
	update public.jobs j
		set status = 'claimed',
			claimed_by = p_worker,
			claimed_at = now(),
			lease_until = now() + make_interval(secs => greatest(30, least(p_lease_seconds, 3600))),
			attempts = j.attempts + 1
	from picked
	where j.id = picked.id
	returning j.*;
end
$$;

-- Finish a claimed job. A failure goes back to the queue with a growing
-- delay until max_attempts, then stays failed with its error.
create or replace function public.finish_job(
	p_id     uuid,
	p_worker text,
	p_ok     boolean,
	p_result jsonb default null,
	p_error  text default null
)
returns public.jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
	j public.jobs;
begin
	select * into j from public.jobs where id = p_id for update;
	if not found then raise exception 'No such job'; end if;
	if j.status <> 'claimed' or j.claimed_by is distinct from p_worker then
		raise exception 'Job is not claimed by this worker';
	end if;
	if p_ok then
		update public.jobs
			set status = 'done', result = p_result, error = null, finished_at = now(), lease_until = null
			where id = p_id returning * into j;
	elsif j.attempts >= j.max_attempts then
		update public.jobs
			set status = 'failed', error = left(coalesce(p_error, 'failed'), 2000), finished_at = now(), lease_until = null
			where id = p_id returning * into j;
	else
		update public.jobs
			set status = 'queued', error = left(coalesce(p_error, 'failed'), 2000), lease_until = null,
				claimed_by = null, claimed_at = null,
				run_after = now() + make_interval(mins => least(60, power(2, j.attempts)::int))
			where id = p_id returning * into j;
	end if;
	return j;
end
$$;

revoke all on function public.claim_jobs(text, text, text[], int, int) from public, anon, authenticated;
revoke all on function public.finish_job(uuid, text, boolean, jsonb, text) from public, anon, authenticated;
grant execute on function public.claim_jobs(text, text, text[], int, int) to service_role;
grant execute on function public.finish_job(uuid, text, boolean, jsonb, text) to service_role;

-- 4. workers ------------------------------------------------------------
create table if not exists public.workers (
	name         text        primary key,
	lane         text        not null default 'pc' check (lane in ('pc', 'cloud')),
	last_seen_at timestamptz not null default now(),
	capabilities jsonb       not null default '{}'::jsonb,
	info         jsonb       not null default '{}'::jsonb,
	started_at   timestamptz
);

alter table public.workers enable row level security;
drop policy if exists workers_select on public.workers;
create policy workers_select on public.workers for select to authenticated using (true);
revoke all on public.workers from anon, authenticated;
grant select on public.workers to authenticated;
grant all on public.workers to service_role;
