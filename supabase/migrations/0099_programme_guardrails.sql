-- 0099 — workout_programmes.guardrails: standing rules for a programme,
-- shown during the workout rather than in a settings page.
--
-- description was the obvious existing home and is deliberately not used.
-- components/fitness/ProgrammesList.tsx:214 renders it as a one-line
-- italic subtitle inside a Panel; a five-line block of safety rules set
-- in that style reads as a caption and would be skimmed past. Keeping the
-- two apart lets description stay a summary while guardrails is rendered
-- as a pinned banner at the top of the live session log.
--
-- Plain text rather than a table: for the PTP this is five static lines
-- per programme with no ordering or severity to model. If it ever needs
-- those, promote it then.
--
-- Depends on: 0005 (workout_programmes).
-- Rollback:
--   ALTER TABLE workout_programmes DROP COLUMN guardrails;

ALTER TABLE workout_programmes
	ADD COLUMN IF NOT EXISTS guardrails text;
