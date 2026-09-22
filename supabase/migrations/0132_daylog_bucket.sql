-- 0132 — Day log Part D: the private photo bucket (spec §3 daylog_media,
-- decision 28). Same shape as the tickets bucket (0119): private, 10 MB,
-- authenticated may manage objects; the app writes under <day id>/… and
-- hands out signed URLs only. daylog_media rows (0127) point at the paths.
-- Decision 30's shareable flag stays on the row; the bucket knows nothing.

insert into storage.buckets (id, name, public, file_size_limit)
values ('daylog', 'daylog', false, 10485760)
on conflict (id) do nothing;

drop policy if exists "daylog media read"   on storage.objects;
drop policy if exists "daylog media write"  on storage.objects;
drop policy if exists "daylog media delete" on storage.objects;
create policy "daylog media read"   on storage.objects for select to authenticated using (bucket_id = 'daylog');
create policy "daylog media write"  on storage.objects for insert to authenticated with check (bucket_id = 'daylog');
create policy "daylog media delete" on storage.objects for delete to authenticated using (bucket_id = 'daylog');
