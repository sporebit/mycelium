-- 0165 — when the evening close was offered.
--
-- The morning prompt has day_plans.prompted_at. The evening close had no
-- marker of its own: "already offered today" was read from the
-- interruptions ledger, which only knows about messages the server sent.
-- It can now be offered three ways (the phone's own automation when it goes
-- on charge, which shows the line itself; the fallback push; or as the
-- first line of the Day log's evening message), and whichever comes first
-- must stop the others. One column says so.
--
-- Depends on: 0161.

alter table public.day_plans
	add column if not exists evening_prompted_at timestamptz;

comment on column public.day_plans.evening_prompted_at is
	'When the evening close was first offered (by the phone''s automation, the fallback push, or the Day log prompt). Once a day.';
