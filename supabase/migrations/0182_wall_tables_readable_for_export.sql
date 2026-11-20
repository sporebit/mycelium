-- 0182: the account export (/api/export/space) reads every registered entity table as the
-- caller. 0176 granted the two wall tables to the service role alone, so the caller's read
-- was refused (42501) and the export's manifest marked them failed. A select grant for
-- authenticated makes the read answer; row level security stays on with no policies on
-- these tables, so a signed-in person still sees no row. Service-role access is unchanged.
grant select on public.wall_devices, public.wall_pairings to authenticated;
