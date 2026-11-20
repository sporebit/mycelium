/**
 * The wall as a household device (master run §11; 0176).
 *
 * Design, and why (also in docs/run/wall-report.md):
 *
 *   A wall must never hold a person's session. The least new machinery that
 *   still keeps every access rule is an ordinary USER that is an ordinary
 *   MEMBER of the family team: the device user "Wall". Then the wall reads
 *   the family space under the same row policies as any member, and nothing
 *   personal is reachable at all, because the device is nobody's self. The
 *   device holds one scoped api token (routes ["wall"]), the kind the phone
 *   already holds for capture; it lives in an httpOnly cookie because the
 *   wall is a page, and the middleware reads that cookie on the wall's
 *   routes only.
 *
 *   Making the device user goes through the doors a person would: an
 *   invite row (the invite-only trigger refuses anything else), the Auth
 *   admin API to create the account, and accept_invite as that user to join
 *   the team. No policy was loosened and no trigger bypassed; the only
 *   service-role work is bookkeeping in the two wall tables.
 *
 *   A person's own view needs their quick unlock (lib/system/quickUnlock.ts):
 *   on a correct PIN the server signs a ten-minute note for that person and
 *   that device (lib/wall/personToken.ts) and then acts for the person
 *   itself, with the minted-JWT client every system route already uses, on
 *   the person routes alone. The screen never sees a token for the person.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mintToken, normaliseScopes, sha256Hex } from "./apiTokens";
import { mintUserJwt } from "./jwt";
import { createServiceClient } from "./serviceClient";

export const PAIRING_TTL_MS = 10 * 60_000;
const DEVICE_DOMAIN = "wall.mycelium.local";

export type WallDevice = { id: string; team_space_id: string; device_user_id: string; token_id: string; label: string; paired_at: string | null; revoked_at: string | null };
export type WallListing = WallDevice & { team_name: string | null; pairing_open: boolean };

type Team = { id: string; name: string | null; space_id: string; owner_user_id: string | null };

async function teamOfSpace(db: SupabaseClient, teamSpaceId: string): Promise<Team | null> {
  const { data } = await db.from("teams").select("id, name, space_id, owner_user_id").eq("space_id", teamSpaceId).maybeSingle();
  return (data as Team | null) ?? null;
}

/** Owners and admins of the team manage its walls: the same people who may invite. */
async function manages(db: SupabaseClient, teamId: string, uid: string): Promise<boolean> {
  const { data } = await db.from("team_members").select("role").eq("team_id", teamId).eq("user_id", uid).maybeSingle();
  const role = (data as { role: string } | null)?.role;
  return role === "owner" || role === "admin";
}

function pairingCode(): string {
  const bytes = new Uint32Array(2);
  crypto.getRandomValues(bytes);
  return `${String(bytes[0] % 10_000).padStart(4, "0")}${String(bytes[1] % 10_000).padStart(4, "0")}`;
}

function rand(n: number): string {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** A client that acts as the device user, with its email in the claim: accept_invite checks it. */
async function deviceClient(uid: string, email: string): Promise<SupabaseClient> {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) throw new Error("SUPABASE_JWT_SECRET is not set");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const token = await mintUserJwt({ sub: uid, secret, issuer: `${url}/auth/v1`, email });
  return createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

export type Created = { ok: true; device_id: string; code: string; expires_at: string } | { ok: false; status: number; error: string };

/**
 * Make a wall for a team and open a pairing code for it. The code is shown
 * once, on the owner's screen; the wall types it and gets the device token.
 */
export async function createWallDevice(ownerUid: string, teamSpaceId: string, label: string, now: Date = new Date()): Promise<Created> {
  const svc = createServiceClient();
  const team = await teamOfSpace(svc, teamSpaceId);
  if (!team) return { ok: false, status: 404, error: "No team has that space." };
  if (!(await manages(svc, team.id, ownerUid))) return { ok: false, status: 403, error: "Only the team's owner or an admin can add a wall." };

  // 1. The device account, through the invite door.
  const email = `wall+${teamSpaceId.slice(0, 8)}-${rand(4)}@${DEVICE_DOMAIN}`;
  const inviteToken = rand(24);
  const { error: invErr } = await svc.from("invites").insert({
    email,
    team_id: team.id,
    role: "member",
    token_hash: await sha256Hex(inviteToken),
    expires_at: new Date(now.getTime() + PAIRING_TTL_MS).toISOString(),
    invited_by: ownerUid,
  });
  if (invErr) return { ok: false, status: 500, error: `invite: ${invErr.message}` };

  const made = await svc.auth.admin.createUser({ email, email_confirm: true, user_metadata: { display_name: label, is_device: true } });
  if (made.error || !made.data.user) return { ok: false, status: 500, error: `device account: ${made.error?.message ?? "no user"}` };
  const deviceUid = made.data.user.id;

  const asDevice = await deviceClient(deviceUid, email);
  const joined = await asDevice.rpc("accept_invite", { p_token: inviteToken });
  if (joined.error) return { ok: false, status: 500, error: `join: ${joined.error.message}` };

  // 2. The device's token: the device's own row, under the same policies as a person's tokens.
  const token = mintToken();
  const { data: tok, error: tokErr } = await asDevice
    .from("api_tokens")
    .insert({
      name: `Wall: ${label}`,
      token_hash: await sha256Hex(token),
      token_prefix: token.slice(4, 12),
      scopes: normaliseScopes({ projects: [], verbs: ["read", "write"], routes: ["wall"] }),
      expires_at: null,
    })
    .select("id")
    .single();
  if (tokErr || !tok) return { ok: false, status: 500, error: `token: ${tokErr?.message ?? "insert failed"}` };

  // 3. Bookkeeping, and the pairing code.
  const { data: dev, error: devErr } = await svc
    .from("wall_devices")
    .insert({ team_space_id: teamSpaceId, device_user_id: deviceUid, token_id: tok.id, label, space_id: teamSpaceId, created_by: ownerUid })
    .select("id")
    .single();
  if (devErr || !dev) return { ok: false, status: 500, error: `device: ${devErr?.message ?? "insert failed"}` };

  const code = pairingCode();
  const expires_at = new Date(now.getTime() + PAIRING_TTL_MS).toISOString();
  const { error: pairErr } = await svc.from("wall_pairings").insert({ device_id: dev.id, code_hash: await sha256Hex(code), token, expires_at, space_id: teamSpaceId, created_by: ownerUid });
  if (pairErr) return { ok: false, status: 500, error: `pairing: ${pairErr.message}` };

  await svc.from("audit_log").insert({ action: "wall_created", resource_type: "wall_device", resource_id: dev.id, metadata: { label }, space_id: teamSpaceId, created_by: ownerUid }).then(() => {}, () => {});
  return { ok: true, device_id: dev.id, code, expires_at };
}

/** Open a fresh pairing code for an existing wall (a new frame, or the old one wiped). */
export async function reopenPairing(ownerUid: string, deviceId: string, now: Date = new Date()): Promise<Created> {
  const svc = createServiceClient();
  const { data } = await svc.from("wall_devices").select("id, team_space_id, device_user_id, token_id, revoked_at").eq("id", deviceId).maybeSingle();
  const dev = data as Pick<WallDevice, "id" | "team_space_id" | "device_user_id" | "token_id" | "revoked_at"> | null;
  if (!dev || dev.revoked_at) return { ok: false, status: 404, error: "No such wall." };
  const team = await teamOfSpace(svc, dev.team_space_id);
  if (!team || !(await manages(svc, team.id, ownerUid))) return { ok: false, status: 403, error: "Not yours to pair." };

  // The old token is unknown (only its hash is kept): mint a new one and move the device onto it.
  const asDevice = await deviceClient(dev.device_user_id, "");
  const token = mintToken();
  const { data: tok, error: tokErr } = await asDevice
    .from("api_tokens")
    .insert({ name: "Wall (re-paired)", token_hash: await sha256Hex(token), token_prefix: token.slice(4, 12), scopes: normaliseScopes({ projects: [], verbs: ["read", "write"], routes: ["wall"] }), expires_at: null })
    .select("id")
    .single();
  if (tokErr || !tok) return { ok: false, status: 500, error: `token: ${tokErr?.message ?? "insert failed"}` };
  await svc.from("api_tokens").update({ revoked_at: now.toISOString() }).eq("id", dev.token_id);
  await svc.from("wall_devices").update({ token_id: tok.id, paired_at: null }).eq("id", dev.id);

  const code = pairingCode();
  const expires_at = new Date(now.getTime() + PAIRING_TTL_MS).toISOString();
  const { error } = await svc.from("wall_pairings").insert({ device_id: dev.id, code_hash: await sha256Hex(code), token, expires_at, space_id: dev.team_space_id, created_by: ownerUid });
  if (error) return { ok: false, status: 500, error: `pairing: ${error.message}` };
  return { ok: true, device_id: dev.id, code, expires_at };
}

/** The wall types the code: the token comes back once and the code is spent. Null for a wrong, used or old code. */
export async function redeemPairing(code: string, now: Date = new Date()): Promise<{ token: string; device_id: string } | null> {
  if (!/^\d{8}$/.test(code)) return null;
  const svc = createServiceClient();
  const { data } = await svc.from("wall_pairings").select("id, device_id, token, expires_at, used_at").eq("code_hash", await sha256Hex(code)).maybeSingle();
  const row = data as { id: string; device_id: string; token: string | null; expires_at: string; used_at: string | null } | null;
  if (!row || row.used_at || !row.token || Date.parse(row.expires_at) <= now.getTime()) return null;
  const { error } = await svc.from("wall_pairings").update({ used_at: now.toISOString(), token: null }).eq("id", row.id).is("used_at", null);
  if (error) return null;
  await svc.from("wall_devices").update({ paired_at: now.toISOString() }).eq("id", row.device_id);
  return { token: row.token, device_id: row.device_id };
}

/** The wall behind a request: the device user the middleware resolved from the cookie. Null when the wall is revoked. */
export async function deviceForUser(deviceUid: string): Promise<WallDevice | null> {
  const { data } = await createServiceClient().from("wall_devices").select("id, team_space_id, device_user_id, token_id, label, paired_at, revoked_at").eq("device_user_id", deviceUid).is("revoked_at", null).maybeSingle();
  return (data as WallDevice | null) ?? null;
}

/** The walls of every team the caller owns or administers. */
export async function listWalls(uid: string): Promise<WallListing[]> {
  const svc = createServiceClient();
  const { data: mem } = await svc.from("team_members").select("team_id, role").eq("user_id", uid).in("role", ["owner", "admin"]);
  const teamIds = ((mem ?? []) as Array<{ team_id: string }>).map((m) => m.team_id);
  if (!teamIds.length) return [];
  const { data: teams } = await svc.from("teams").select("id, name, space_id").in("id", teamIds);
  const bySpace = new Map(((teams ?? []) as Team[]).filter((t) => t.space_id).map((t) => [t.space_id, t.name]));
  const spaceIds = [...bySpace.keys()];
  if (!spaceIds.length) return [];
  const { data: devs } = await svc.from("wall_devices").select("id, team_space_id, device_user_id, token_id, label, paired_at, revoked_at").in("team_space_id", spaceIds).is("revoked_at", null).order("label");
  const devices = (devs ?? []) as WallDevice[];
  const { data: open } = devices.length
    ? await svc.from("wall_pairings").select("device_id").in("device_id", devices.map((d) => d.id)).is("used_at", null).gt("expires_at", new Date().toISOString())
    : { data: [] };
  const openFor = new Set(((open ?? []) as Array<{ device_id: string }>).map((p) => p.device_id));
  return devices.map((d) => ({ ...d, team_name: bySpace.get(d.team_space_id) ?? null, pairing_open: openFor.has(d.id) }));
}

/** Revoke a wall: its token stops at the next request, its device user leaves the team. The rows stay for the audit trail. */
export async function revokeWall(uid: string, deviceId: string, now: Date = new Date()): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const svc = createServiceClient();
  const { data } = await svc.from("wall_devices").select("id, team_space_id, device_user_id, token_id").eq("id", deviceId).is("revoked_at", null).maybeSingle();
  const dev = data as Pick<WallDevice, "id" | "team_space_id" | "device_user_id" | "token_id"> | null;
  if (!dev) return { ok: false, status: 404, error: "No such wall." };
  const team = await teamOfSpace(svc, dev.team_space_id);
  if (!team || !(await manages(svc, team.id, uid))) return { ok: false, status: 403, error: "Not yours to revoke." };
  await svc.from("api_tokens").update({ revoked_at: now.toISOString() }).eq("created_by", dev.device_user_id).is("revoked_at", null);
  await svc.from("wall_pairings").update({ used_at: now.toISOString(), token: null }).eq("device_id", dev.id).is("used_at", null);
  await svc.from("wall_devices").update({ revoked_at: now.toISOString() }).eq("id", dev.id);
  await svc.from("team_members").delete().eq("team_id", team.id).eq("user_id", dev.device_user_id);
  await svc.from("audit_log").insert({ action: "wall_revoked", resource_type: "wall_device", resource_id: dev.id, metadata: {}, space_id: dev.team_space_id, created_by: uid }).then(() => {}, () => {});
  return { ok: true };
}

export type TeamPerson = { id: string; name: string };

/** The people of the wall's team: members who are not devices, by name. */
export async function teamPeople(teamSpaceId: string): Promise<{ team: Team; people: TeamPerson[] } | null> {
  const svc = createServiceClient();
  const team = await teamOfSpace(svc, teamSpaceId);
  if (!team) return null;
  const [{ data: mem }, { data: devs }] = await Promise.all([
    svc.from("team_members").select("user_id").eq("team_id", team.id),
    svc.from("wall_devices").select("device_user_id").eq("team_space_id", teamSpaceId),
  ]);
  const deviceIds = new Set(((devs ?? []) as Array<{ device_user_id: string }>).map((d) => d.device_user_id));
  const ids = ((mem ?? []) as Array<{ user_id: string }>).map((m) => m.user_id).filter((id) => !deviceIds.has(id));
  if (!ids.length) return { team, people: [] };
  const { data: profs } = await svc.from("profiles").select("id, display_name").in("id", ids);
  const names = new Map(((profs ?? []) as Array<{ id: string; display_name: string | null }>).map((p) => [p.id, p.display_name?.trim() || "Someone"]));
  const people = ids.map((id) => ({ id, name: names.get(id) ?? "Someone" })).sort((a, b) => a.name.localeCompare(b.name, "en-GB"));
  return { team, people };
}

/** Is this person a member of the wall's team? The unlock asks before it checks a PIN. */
export async function isTeamPerson(teamSpaceId: string, uid: string): Promise<boolean> {
  const found = await teamPeople(teamSpaceId);
  return !!found?.people.some((p) => p.id === uid);
}
