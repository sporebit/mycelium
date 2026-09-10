/**
 * Audit writer for what only the API layer knows.
 *
 * Most audit rows are written by database triggers (sign-in/out, MFA,
 * invites, membership, grants — migration 0113) and never pass through
 * here. This module covers the rest: break-glass requests, cross-user
 * reads, exports. It uses the service-role client because audit_events is
 * insert-only for service_role — a user cannot write their own audit trail.
 * Writes are fire-and-forget: an audit failure is logged, never surfaced
 * to the caller, and never blocks the request.
 */
import { createServiceClient } from "@/lib/system/serviceClient";

export type Principal = "user" | "system" | "break_glass";

export type AuditEvent = {
  action: string;
  actorId: string | null;
  principal?: Principal;
  section?: string | null;
  entityGroup?: string | null;
  entityId?: string | null;
  subjectUserId?: string | null;
  spaceId?: string | null;
  teamId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  meta?: Record<string, unknown>;
};

export async function writeAudit(event: AuditEvent): Promise<void> {
  try {
    const db = createServiceClient();
    const { error } = await db.from("audit_events").insert({
      actor_id: event.actorId,
      principal: event.principal ?? (event.actorId ? "user" : "system"),
      action: event.action,
      section: event.section ?? null,
      entity_group: event.entityGroup ?? null,
      entity_id: event.entityId ?? null,
      subject_user_id: event.subjectUserId ?? null,
      space_id: event.spaceId ?? null,
      team_id: event.teamId ?? null,
      ip: event.ip ?? null,
      user_agent: event.userAgent ?? null,
      meta: event.meta ?? {},
    });
    if (error) console.error("[audit] insert failed:", error.message);
  } catch (err) {
    console.error("[audit] write failed:", err);
  }
}

/** Request facts worth keeping with an event. */
export function requestFacts(headers: Headers): { ip: string | null; userAgent: string | null } {
  return {
    ip: headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: headers.get("user-agent"),
  };
}

/**
 * One row per request made under the dormant break-glass path (P12 Part 1's
 * TODO). Called by createUserClient(), which every route reaches.
 */
export function auditBreakGlass(actorId: string, path: string, headers: Headers): void {
  void writeAudit({
    action: "break_glass_request",
    actorId,
    principal: "break_glass",
    subjectUserId: actorId,
    meta: { path },
    ...requestFacts(headers),
  });
}

/**
 * Cross-user read: the actor read rows in spaces they do not own. One row
 * per request (not per row), naming the owners of the foreign spaces, so
 * "who has seen my data" can list it. `owners` maps space id → owner user
 * id (personal spaces) or team id (team spaces).
 */
export function auditCrossUserRead(input: {
  actorId: string;
  path: string;
  section: string | null;
  entityGroup: string | null;
  foreignSpaces: Array<{ spaceId: string; ownerUserId: string | null; teamId: string | null }>;
  headers: Headers;
}): void {
  const facts = requestFacts(input.headers);
  for (const s of input.foreignSpaces) {
    void writeAudit({
      action: "cross_user_read",
      actorId: input.actorId,
      section: input.section,
      entityGroup: input.entityGroup,
      subjectUserId: s.ownerUserId,
      spaceId: s.spaceId,
      teamId: s.teamId,
      meta: { path: input.path },
      ...facts,
    });
  }
}
