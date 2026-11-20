-- 0177 — the live AI model list (MYC-190, Stream H harvest).
--
-- What each provider's models endpoint says, pulled once a day on the tick
-- (/api/cron/ai-models). A row is one model at one provider, with the day it
-- was first seen and the day it was last seen. A model that a successful
-- fetch no longer lists is marked retired, so a retirement is a fact the
-- app saw, not a guess; it comes back if the provider lists it again.
--
-- This is instance-level, not per space: the providers are the instance's.
-- Only the instance owner reads it (as profiles, 0102). Only the cron
-- writes it, as service role. Nothing here chooses a model: Settings offers
-- only the models priced in lib/config/models.ts, and nothing switches on
-- its own.
--
-- The two nudged_* columns are the "once per model" memory of the Telegram
-- nudges (a new model; a retired model that is still pinned somewhere).
--
-- Depends on: 0102 (app.is_instance_owner).

create table if not exists public.ai_models (
	provider          text        not null check (provider in ('anthropic', 'openai')),
	model_id          text        not null,
	display_name      text,
	released_at       timestamptz,
	first_seen        timestamptz not null default now(),
	last_seen         timestamptz not null default now(),
	retired_at        timestamptz,
	nudged_new_at     timestamptz,
	nudged_retired_at timestamptz,
	raw               jsonb       not null default '{}'::jsonb,
	primary key (provider, model_id)
);

comment on table public.ai_models is 'What the AI providers'' model lists said, day by day: first seen, last seen, retired (MYC-190).';

alter table public.ai_models enable row level security;

revoke all on public.ai_models from public, anon;
grant select on public.ai_models to authenticated;
grant all on public.ai_models to service_role;

drop policy if exists ai_models_select_instance_owner on public.ai_models;
create policy ai_models_select_instance_owner
	on public.ai_models
	for select
	to authenticated
	using (app.is_instance_owner());

-- No insert, update or delete policy: authenticated writes nothing here.
-- The service role bypasses RLS and is the only writer (the cron).
