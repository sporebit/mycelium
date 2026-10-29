-- 0150 — remember why the Google token refresh failed (MYC-147).
--
-- A revoked or expired refresh token makes Google answer 400 invalid_grant
-- on every refresh. getAccessToken() returned null and logged, so the
-- Integrations panel kept saying "Connected" while every sync did nothing.
-- The failure is now written here (ISO time + Google's error), cleared on
-- the next successful refresh and on a fresh OAuth round trip, and the
-- panel reads it to say "Reconnect".

ALTER TABLE public.user_settings
	ADD COLUMN IF NOT EXISTS google_sync_error text;

COMMENT ON COLUMN public.user_settings.google_sync_error IS
	'Last Google token refresh failure: "<iso time> <error>"; null while refreshes succeed (0150).';
