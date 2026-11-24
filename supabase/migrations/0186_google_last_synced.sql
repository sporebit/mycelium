-- 0186 — when the Google connection last did its work (2026-11-24).
--
-- Settings → Integrations says "Connected as <address> · Last synced 3 min
-- ago" and colours it amber past an hour and red past a day, the same words
-- the Family calendar uses. The time is written by every successful read or
-- write through the connection: the calendar page's Personal and UK-holidays
-- read, SYNC NOW and the google-sync cron (lib/google/calendar.ts
-- markGoogleSynced). It is cleared with the tokens on disconnect.
--
-- The iCal feeds (GOOGLE_CALENDAR_ICAL_URLS) retire with this: the calendar
-- page reads Personal and UK holidays through the OAuth connection instead.

ALTER TABLE public.user_settings
	ADD COLUMN IF NOT EXISTS google_last_synced_at timestamptz;

COMMENT ON COLUMN public.user_settings.google_last_synced_at IS
	'Last successful read or write through the Google connection (0186); null until the first, cleared on disconnect.';
