/**
 * Cross-user read auditing for list routes (P12 Part 5).
 *
 * A route that returns rows from a shareable section calls
 * `auditListRead(req, rows, section, group)` once with what it is about
 * to send. Rows whose space_id is not the caller's personal space are
 * foreign: a team space, or another user's personal space reached by a
 * grant. One audit row is written per foreign space per request — never
 * per row — naming the space's owner (personal) or team, so the owner can
 * see who looked under Settings → Security → "Who has seen my data".
 *
 * Costs: the caller's personal space is looked up once per user per five
 * minutes; space owners are cached for a minute; the audit insert is fire
 * and forget. A route that returns no foreign rows pays nothing beyond the
 * cache lookup.
 */
import { headers } from "next/headers";
import { PRINCIPAL_USER_HEADER } from "@/lib/auth/gate";
import { auditCrossUserRead } from "@/lib/system/audit";
import { createServiceClient } from "@/lib/system/serviceClient";

type SpaceInfo = { ownerUserId: string | null; teamId: string | null };
const spaceCache = new Map<string, { info: SpaceInfo; at: number }>();
const personalCache = new Map<string, { space: string | null; at: number }>();
const SPACE_TTL = 60_000;
const PERSONAL_TTL = 5 * 60_000;

async function resolveSpaces(ids: string[]): Promise<Map<string, SpaceInfo>> {
  const out = new Map<string, SpaceInfo>();
  const missing: string[] = [];
  const now = Date.now();
  for (const id of ids) {
    const c = spaceCache.get(id);
    if (c && now - c.at < SPACE_TTL) out.set(id, c.info);
    else missing.push(id);
  }
  if (missing.length) {
    const db = createServiceClient();
    const { data } = await db.from("spaces").select("id, owner_user_id, team_id").in("id", missing);
    for (const s of data ?? []) {
      const info = { ownerUserId: (s.owner_user_id as string | null) ?? null, teamId: (s.team_id as string | null) ?? null };
      spaceCache.set(s.id as string, { info, at: now });
      out.set(s.id as string, info);
    }
  }
  return out;
}

async function personalSpaceOf(userId: string): Promise<string | null> {
  const now = Date.now();
  const c = personalCache.get(userId);
  if (c && now - c.at < PERSONAL_TTL) return c.space;
  const db = createServiceClient();
  const { data } = await db.from("profiles").select("personal_space_id").eq("id", userId).maybeSingle();
  const space = (data?.personal_space_id as string | null) ?? null;
  personalCache.set(userId, { space, at: now });
  return space;
}

/**
 * Audit foreign reads among `rows` for the current request. Rows must carry
 * `space_id` (select it, or select `*`). Safe to call with any rows: rows
 * without space_id are ignored. Returns at once; the work is async.
 */
export function auditListRead(
  req: Request,
  rows: ReadonlyArray<{ space_id?: string | null }> | null | undefined,
  section: string,
  entityGroup: string,
): void {
  if (!rows || rows.length === 0) return;
  void (async () => {
    try {
      const h = await headers();
      const actorId = h.get(PRINCIPAL_USER_HEADER);
      if (!actorId) return;
      const personal = await personalSpaceOf(actorId);
      const foreign = new Set<string>();
      for (const r of rows) {
        const s = r.space_id;
        if (s && s !== personal) foreign.add(s);
      }
      if (foreign.size === 0) return;
      const map = await resolveSpaces([...foreign]);
      auditCrossUserRead({
        actorId,
        path: new URL(req.url).pathname,
        section,
        entityGroup,
        foreignSpaces: [...foreign].map((spaceId) => ({
          spaceId,
          ownerUserId: map.get(spaceId)?.ownerUserId ?? null,
          teamId: map.get(spaceId)?.teamId ?? null,
        })),
        headers: h,
      });
    } catch (err) {
      console.error("[read-audit] failed:", err);
    }
  })();
}
