-- Migration: weekly team rundowns. P12 Part 6.
--
-- A rundown is a weekly digest of a team space, rendered ONCE PER
-- RECIPIENT under that recipient's identity (lib/system/withUser), so the
-- copy each person receives contains exactly what their role and section
-- toggles let them see. Three tables:
--   rundown_settings       one row per team: on/off, content blocks,
--                          sections, day and hour. Owner sets it.
--   rundown_subscriptions  one row per (user, team): channels, opt-out,
--                          day/hour override. Each member sets their own.
--                          No row = subscribed with the defaults.
--   rundown_issues         what was rendered and sent: per team, recipient,
--                          ISO week and channel. Only the recipient reads
--                          theirs; the cron (service role) writes them.
--
-- Depends on: 0112 (teams, team_members, app.team_role).
-- Rollback: drop the three tables and the two functions.

create table if not exists public.rundown_settings (
	team_id    uuid        primary key references public.teams (id) on delete cascade,
	enabled    boolean     not null default false,
	content    jsonb       not null default '{"changed": true, "upcoming": true, "stats": true, "per_person": false}'::jsonb,
	sections   text[]      not null default array['organisation', 'fitness', 'health', 'studio', 'drops', 'ventures', 'journal', 'places', 'reminders', 'media'],
	day        smallint    not null default 1 check (day between 0 and 6),   -- 0 = Sunday
	hour       smallint    not null default 8 check (hour between 0 and 23), -- UTC
	updated_at timestamptz not null default now(),
	constraint rundown_settings_sections_shape check (
		sections <@ array['organisation', 'fitness', 'health', 'studio', 'drops', 'ventures', 'journal', 'places', 'reminders', 'media']::text[])
);

create table if not exists public.rundown_subscriptions (
	user_id    uuid        not null references auth.users (id) on delete cascade,
	team_id    uuid        not null references public.teams (id) on delete cascade,
	channels   text[]      not null default array['email', 'push', 'in_app'],
	opted_out  boolean     not null default false,
	day        smallint    check (day between 0 and 6),
	hour       smallint    check (hour between 0 and 23),
	updated_at timestamptz not null default now(),
	primary key (user_id, team_id),
	constraint rundown_subscriptions_channels_shape check (channels <@ array['email', 'push', 'in_app', 'telegram']::text[])
);

create table if not exists public.rundown_issues (
	id            uuid        primary key default gen_random_uuid(),
	team_id       uuid        not null references public.teams (id) on delete cascade,
	user_id       uuid        not null references auth.users (id) on delete cascade,
	week          text        not null check (week ~ '^\d{4}-W\d{2}$'),
	channel       text        not null check (channel in ('email', 'push', 'in_app', 'telegram')),
	rendered_html text        not null,
	rendered_text text        not null default '',
	sent_at       timestamptz,
	error         text,
	created_at    timestamptz not null default now(),
	unique (team_id, user_id, week, channel)
);

create index if not exists rundown_issues_user_idx on public.rundown_issues (user_id, created_at desc);

alter table public.rundown_settings      enable row level security;
alter table public.rundown_subscriptions enable row level security;
alter table public.rundown_issues        enable row level security;

drop policy if exists rundown_settings_select_member on public.rundown_settings;
create policy rundown_settings_select_member
	on public.rundown_settings for select to authenticated
	using (app.is_team_member(team_id));

drop policy if exists rundown_subscriptions_select_own on public.rundown_subscriptions;
create policy rundown_subscriptions_select_own
	on public.rundown_subscriptions for select to authenticated
	using (user_id = auth.uid());

drop policy if exists rundown_issues_select_own on public.rundown_issues;
create policy rundown_issues_select_own
	on public.rundown_issues for select to authenticated
	using (user_id = auth.uid());

grant select on public.rundown_settings, public.rundown_subscriptions, public.rundown_issues to authenticated;
grant all on public.rundown_settings, public.rundown_subscriptions, public.rundown_issues to service_role;

-- Owner sets the team's rundown.
create or replace function public.set_rundown_settings(
	p_team uuid, p_enabled boolean, p_content jsonb, p_sections text[], p_day smallint, p_hour smallint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
	if app.team_role(p_team, auth.uid()) <> 'owner' then raise exception 'Only the team owner sets the rundown'; end if;
	insert into public.rundown_settings (team_id, enabled, content, sections, day, hour, updated_at)
	values (p_team, coalesce(p_enabled, false),
		coalesce(p_content, '{"changed": true, "upcoming": true, "stats": true, "per_person": false}'::jsonb),
		coalesce(p_sections, array['organisation', 'fitness', 'health', 'studio', 'drops', 'ventures', 'journal', 'places', 'reminders', 'media']),
		coalesce(p_day, 1), coalesce(p_hour, 8), now())
	on conflict (team_id) do update set
		enabled = excluded.enabled, content = excluded.content, sections = excluded.sections,
		day = excluded.day, hour = excluded.hour, updated_at = now();
	perform app.audit('rundown_settings_changed', p_team_id => p_team,
		p_meta => jsonb_build_object('enabled', p_enabled, 'sections', to_jsonb(p_sections), 'day', p_day, 'hour', p_hour));
end
$$;

-- Each member sets their own subscription.
create or replace function public.set_rundown_subscription(
	p_team uuid, p_channels text[], p_opted_out boolean, p_day smallint, p_hour smallint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
	if app.team_role(p_team, auth.uid()) is null then raise exception 'Not a member of this team'; end if;
	insert into public.rundown_subscriptions (user_id, team_id, channels, opted_out, day, hour, updated_at)
	values (auth.uid(), p_team, coalesce(p_channels, array['email', 'push', 'in_app']), coalesce(p_opted_out, false), p_day, p_hour, now())
	on conflict (user_id, team_id) do update set
		channels = excluded.channels, opted_out = excluded.opted_out, day = excluded.day, hour = excluded.hour, updated_at = now();
end
$$;

revoke all on function public.set_rundown_settings(uuid, boolean, jsonb, text[], smallint, smallint) from public;
revoke all on function public.set_rundown_subscription(uuid, text[], boolean, smallint, smallint) from public;
grant execute on function public.set_rundown_settings(uuid, boolean, jsonb, text[], smallint, smallint) to authenticated, service_role;
grant execute on function public.set_rundown_subscription(uuid, text[], boolean, smallint, smallint) to authenticated, service_role;
