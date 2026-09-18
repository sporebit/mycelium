-- 0128_daylog_persona_text.sql
-- The spec typed daylog_days.persona_agent_id as uuid, but The Boys' ids are
-- text ('da_boi', 'fitness', …; agents.id text, 0053). Every Talk turn failed
-- with "invalid input syntax for type uuid" on the first deploy. Retype and
-- add the FK the spec asked to confirm. Depends on: 0127.

alter table public.daylog_days alter column persona_agent_id type text using persona_agent_id::text;
alter table public.daylog_days drop constraint if exists daylog_days_persona_agent_id_fkey;
alter table public.daylog_days
	add constraint daylog_days_persona_agent_id_fkey foreign key (persona_agent_id) references public.agents(id) on delete set null;
