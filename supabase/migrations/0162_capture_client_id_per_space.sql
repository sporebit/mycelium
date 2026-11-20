-- 0162_capture_client_id_per_space.sql
-- A capture's client id is unique per space, not across everyone.
--
-- raw_captures_client_uuid_key (0040) was unique over the whole table. Two
-- people sending the same id (or one person's id guessed by another) made
-- the second insert fail with a 500, because the duplicate check runs under
-- the caller's own access and cannot see the other row. Nothing leaked, but
-- "send it again with the same id" is the retry rule the iPhone Shortcut
-- depends on, so it has to be true per person.
--
-- Depends on: 0161.

drop index if exists public.raw_captures_client_uuid_key;

create unique index if not exists raw_captures_client_uuid_space_key
	on public.raw_captures (space_id, client_uuid)
	where client_uuid is not null;
