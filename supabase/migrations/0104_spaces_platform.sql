-- Migration: space_id + created_by on the platform section. P12 Part 2.
--
-- Each call to app.adopt_table (0103) adds space_id (backfilled to Phil's
-- personal space, or from the named parent row), created_by, rebuilds any
-- user_id-keyed indexes and constraints on space_id, and drops user_id.
-- Parents before children.
--
-- search_memory_chunks filtered on user_id; it now filters on the legacy
-- user's personal space so its existing caller keeps working until Part 3
-- rewrites it to auth.uid().
--
-- Depends on: 0103.
-- Rollback: not supported in place — restore from the pre-cutover dump
--   (docs/multi-user-rollback.md). The adoption drops user_id.

-- user_settings carries a row with user_id = 'default'. Migration 0075
-- inserted it with coalesce(current_setting('app.user_id'), 'default');
-- the GUC was never set, so 'default' is what landed. The app itself
-- creates the real 'phil' row the first time settings are saved, so:
--
--   * on the hosted project (and any replay of its dump) both rows exist.
--     The placeholder is unread — every read keys on USER_ID — and it
--     cannot be mapped to Phil, because user_settings becomes UNIQUE
--     (space_id) and two rows in his space would collide. It is deleted,
--     but ONLY if it is provably untouched (no tokens, chat id or prefs);
--     a dirty placeholder is the STOP the prompt requires.
--   * on a from-empty replay only the placeholder exists. It is then the
--     settings row, and it becomes Phil's: its legacy key is set to 'phil'
--     so the adoption maps it like every other row.
--
-- Both paths were exercised locally (incremental run and from-empty run).
do $$
declare
	v_default_rows bigint;
	v_real_rows    bigint;
	v_dirty        bigint;
begin
	select count(*) into v_default_rows from public.user_settings where user_id = 'default';
	if v_default_rows = 0 then return; end if;

	select count(*) into v_real_rows from public.user_settings where app.legacy_user_uid(user_id) is not null;

	if v_real_rows = 0 then
		update public.user_settings set user_id = 'phil' where user_id = 'default';
		raise notice 'user_settings: the 0075 placeholder is the only row; adopted as Phil''s';
		return;
	end if;

	select count(*) into v_dirty from public.user_settings
	where user_id = 'default'
	  and (google_refresh_token is not null or google_access_token is not null
	       or telegram_chat_id is not null or spotify_connected or ui_prefs <> '{}'::jsonb
	       or card_orders <> '{}'::jsonb);
	if v_dirty > 0 then
		raise exception using message =
			'STOP: user_settings ''default'' row holds data (tokens, chat id or prefs) beside a real row. Resolve by hand before continuing.';
	end if;

	delete from public.user_settings where user_id = 'default';
	raise notice 'user_settings: removed the untouched 0075 placeholder row (user_id = ''default'')';
end
$$;

select app.adopt_table('user_settings');
select app.adopt_table('dashboard_layouts');
select app.adopt_table('push_subscriptions');
select app.adopt_table('audit_log');
select app.adopt_table('agent_conversations');
select app.adopt_table('agent_messages', 'agent_conversations', 'conversation_id');
select app.adopt_table('bin_schedule_config');
select app.adopt_table('bin_garden_seasons');
select app.adopt_table('bin_google_events');
select app.adopt_table('memory_chunks');

create or replace function public.search_memory_chunks(
	query_embedding extensions.vector,
	p_user_id text,
	match_count integer default 20,
	similarity_threshold double precision default 0.3
)
returns table (
	id uuid, source_type text, source_id uuid, text text,
	similarity double precision, created_at timestamptz
)
language sql
stable
as $$
	select
		mc.id,
		mc.source_type,
		mc.source_id,
		mc.text,
		1 - (mc.embedding OPERATOR(extensions.<=>) query_embedding) as similarity,
		mc.created_at
	from public.memory_chunks mc
	where mc.space_id = app.personal_space_for_legacy(p_user_id)
	  and 1 - (mc.embedding OPERATOR(extensions.<=>) query_embedding) > similarity_threshold
	order by mc.embedding OPERATOR(extensions.<=>) query_embedding asc
	limit match_count;
$$;
