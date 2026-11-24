-- 0187 — the Family calendar's ACL guard (family calendar spec §4.1, decision
-- D7 of 2026-11-23; built 2026-11-24).
--
-- Phirsty Life may be shared with Phil's own account and Kirsty's address and
-- nobody else. Choosing a calendar reads its ACL first and refuses one that
-- holds anyone else (a user, a group, a domain or the public), naming them.
-- The daily health check reads the ACL again: if someone has been added
-- since, the names land here, Mycelium stops writing to the calendar (the
-- writes wait on the jobs queue), Phil is pushed once and a dated ticket is
-- raised. Cleared by the next health check, or Sync now, once they are gone.

ALTER TABLE public.family_calendar_sync
	ADD COLUMN IF NOT EXISTS acl_blocked text;

COMMENT ON COLUMN public.family_calendar_sync.acl_blocked IS
	'Who else the calendar is shared with, when the daily ACL check found a stranger (0187); writes stop while set. Null when only the two allowed accounts hold it.';
