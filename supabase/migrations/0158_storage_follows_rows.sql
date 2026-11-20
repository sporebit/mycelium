-- 0158_storage_follows_rows.sql
-- Storage buckets follow the row they belong to.
--
-- Found 2026-11-20 (master run, before a second real user exists): the
-- policies on storage.objects for the `tickets` (0119) and `daylog` (0132)
-- buckets tested only `bucket_id`, so ANY signed-in user could list, read,
-- overwrite-by-new-name and delete every file in them through the Storage
-- API with the anon key and their own session. The `receipts` bucket (0092)
-- had no policy at all: written for the service role, but the code uploads
-- with the user's client since the multi-user cutover, so a receipt photo
-- could not be stored by anyone.
--
-- Every bucket already stores files as `<owning row id>/<file>`:
--   tickets   <ticket id>/…      lib/storage/tickets.ts
--   daylog    <day id>/…         lib/daylog/media.ts
--   receipts  <receipt id>/…     lib/storage/receipts.ts
--
-- The policies now look that row up. A policy's subquery runs as the caller,
-- so the row's own RLS decides: personal space, team role, direct grant,
-- and for Day log photos the linked-user rule (shareable photos of a scene
-- the person is in, 0130). Reading needs the row to be visible; writing and
-- deleting need edit rights on its entity group. A file under no row, or
-- under a row the caller cannot see, is refused.
--
-- lib/access/storage.test.ts proves it through the Storage API.
-- Depends on: 0132.

-- A path segment that is not a uuid must not raise inside a policy.
create or replace function app.uuid_or_null(p text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
	return p::uuid;
exception when others then
	return null;
end
$$;

revoke all on function app.uuid_or_null(text) from public;
grant execute on function app.uuid_or_null(text) to authenticated, service_role;

-- tickets ---------------------------------------------------------------
drop policy if exists "tickets attachments read"   on storage.objects;
drop policy if exists "tickets attachments write"  on storage.objects;
drop policy if exists "tickets attachments delete" on storage.objects;

create policy "tickets attachments read" on storage.objects for select to authenticated
using (
	bucket_id = 'tickets'
	and exists (
		select 1 from public.tickets t
		where t.id = app.uuid_or_null((storage.foldername(name))[1])
	)
);

create policy "tickets attachments write" on storage.objects for insert to authenticated
with check (
	bucket_id = 'tickets'
	and exists (
		select 1 from public.tickets t
		where t.id = app.uuid_or_null((storage.foldername(name))[1])
			and t.space_id in (select app.accessible_spaces('organisation.tickets', 'edit'))
	)
);

create policy "tickets attachments delete" on storage.objects for delete to authenticated
using (
	bucket_id = 'tickets'
	and exists (
		select 1 from public.tickets t
		where t.id = app.uuid_or_null((storage.foldername(name))[1])
			and t.space_id in (select app.accessible_spaces('organisation.tickets', 'edit'))
	)
);

-- daylog ----------------------------------------------------------------
-- Reading follows the photo's own row, so a linked user gets a shareable
-- photo and nothing else. The file is uploaded before its row exists, so
-- the uploader may also read under a day they can edit.
drop policy if exists "daylog media read"   on storage.objects;
drop policy if exists "daylog media write"  on storage.objects;
drop policy if exists "daylog media delete" on storage.objects;

create policy "daylog media read" on storage.objects for select to authenticated
using (
	bucket_id = 'daylog'
	and (
		exists (select 1 from public.daylog_media m where m.storage_path = name)
		or exists (
			select 1 from public.daylog_days d
			where d.id = app.uuid_or_null((storage.foldername(name))[1])
				and d.space_id in (select app.accessible_spaces('journal.daylog', 'edit'))
		)
	)
);

create policy "daylog media write" on storage.objects for insert to authenticated
with check (
	bucket_id = 'daylog'
	and exists (
		select 1 from public.daylog_days d
		where d.id = app.uuid_or_null((storage.foldername(name))[1])
			and d.space_id in (select app.accessible_spaces('journal.daylog', 'edit'))
	)
);

create policy "daylog media delete" on storage.objects for delete to authenticated
using (
	bucket_id = 'daylog'
	and exists (
		select 1 from public.daylog_days d
		where d.id = app.uuid_or_null((storage.foldername(name))[1])
			and d.space_id in (select app.accessible_spaces('journal.daylog', 'edit'))
	)
);

-- receipts --------------------------------------------------------------
drop policy if exists "receipts images read"   on storage.objects;
drop policy if exists "receipts images write"  on storage.objects;
drop policy if exists "receipts images delete" on storage.objects;

create policy "receipts images read" on storage.objects for select to authenticated
using (
	bucket_id = 'receipts'
	and exists (
		select 1 from public.receipts r
		where r.id = app.uuid_or_null((storage.foldername(name))[1])
	)
);

create policy "receipts images write" on storage.objects for insert to authenticated
with check (
	bucket_id = 'receipts'
	and exists (
		select 1 from public.receipts r
		where r.id = app.uuid_or_null((storage.foldername(name))[1])
			and r.space_id in (select app.accessible_spaces('organisation.purchases', 'edit'))
	)
);

create policy "receipts images delete" on storage.objects for delete to authenticated
using (
	bucket_id = 'receipts'
	and exists (
		select 1 from public.receipts r
		where r.id = app.uuid_or_null((storage.foldername(name))[1])
			and r.space_id in (select app.accessible_spaces('organisation.purchases', 'edit'))
	)
);
