-- 0120_api_tokens.sql
-- Tickets — Part G: scoped API tokens (spec §14.4; numbered 0120 because
-- 0118 went to the habits fold). Platform, owner-only.
--
-- A token is shown once on creation (`mtk_` + 32 random bytes, base64url)
-- and stored as a SHA-256 hex hash. The middleware resolves
-- `Authorization: Bearer mtk_…` to the owning user with `scopes`
-- {projects: ["MYC"], verbs: ["read","write"], routes: ["tickets"]}; a
-- write outside scope is 403. Depends on: 0119.

create table if not exists public.api_tokens (
	id           uuid primary key default gen_random_uuid(),
	user_id      uuid not null references auth.users(id) on delete cascade,
	name         text not null,
	token_hash   text not null unique,
	token_prefix text not null,                       -- first 8 chars after mtk_, for display
	scopes       jsonb not null default '{"projects":[],"verbs":["read","write"],"routes":["tickets"]}'::jsonb,
	created_at   timestamptz not null default now(),
	last_used_at timestamptz,
	expires_at   timestamptz,
	revoked_at   timestamptz
);
create index if not exists api_tokens_user_idx on public.api_tokens (user_id) where revoked_at is null;

select app.adopt_table('api_tokens');
alter table public.api_tokens enable row level security;
insert into public.entity_groups (table_name, section, entity_group)
values ('api_tokens', 'platform', 'api_tokens')
on conflict do nothing;

-- The middleware resolves tokens with the service role; users manage their
-- own through the adopted space policies (their personal space).
