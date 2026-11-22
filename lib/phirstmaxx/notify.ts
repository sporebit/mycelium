/**
 * PhirstMaxx — telling a person something (spec §7 "Notifications").
 *
 * Every notification is first a pm_notifications row, so a missed push loses
 * nothing: the in-app list is the record and the push is a courtesy. Then it
 * is delivered one of two ways:
 *
 *   counts: false   a partner's answer, or something the person started
 *                   themselves ("Saved", "What's this place called?"). Goes
 *                   straight to their push subscriptions, and to Telegram for
 *                   the instance owner when push did not reach them. Never
 *                   weighed against the three-a-day interruption budget.
 *   counts: true    the app's own idea: an engine proposal, a research
 *                   result, a leave-by reminder. Goes through interrupt(),
 *                   which weighs it against the budget and the quiet hours.
 *
 * Delivery runs as the recipient (withUser), because subscriptions and the
 * interruption ledger are theirs; the row itself is written as the caller,
 * who shares the space. A failed delivery is logged, never thrown: the row
 * is already there.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { interrupt } from "@/lib/nudges/interrupt";
import { sendToUser } from "@/lib/push";
import { PHIL_AUTH_UID } from "@/lib/system/identity";
import { withUser } from "@/lib/system/withUser";
import { sendToPhil } from "@/lib/tickets/notify";

export type NotifyInput = {
  kind: string;
  title: string;
  body?: string;
  url?: string;
  plan_id?: string;
  thing_id?: string;
  drop_id?: string;
  /** True when the app started it (weighed against the budget); false for a partner's answer or a reply to the person's own action. */
  counts: boolean;
};

export type PmNotification = {
  id: string;
  person_id: string;
  kind: string;
  title: string;
  body: string | null;
  url: string | null;
  plan_id: string | null;
  thing_id: string | null;
  drop_id: string | null;
  sent_via: string | null;
  read_at: string | null;
  created_at: string;
};

export type NotifyResult = { id: string | null; sent_via: string | null };

const COLS = "id, person_id, kind, title, body, url, plan_id, thing_id, drop_id, sent_via, read_at, created_at";

function absolute(url: string): string {
  if (/^https?:\/\//.test(url)) return url;
  const base = process.env.PUBLIC_BASE_URL?.startsWith("https://") ? process.env.PUBLIC_BASE_URL : "https://mycelium.sporebit.com";
  return `${base}${url.startsWith("/") ? "" : "/"}${url}`;
}

/** Push, then Telegram for the owner; no budget. Returns the channel that took it, or null. */
async function deliverDirect(personId: string, input: NotifyInput): Promise<string | null> {
  return withUser(personId, async (rdb) => {
    try {
      const res = await sendToUser(rdb, { title: input.title, body: input.body ?? "", url: input.url });
      if (res.sent > 0) return "push";
    } catch (err) {
      console.error("[phirstmaxx/notify] push failed:", err);
    }
    if (personId === PHIL_AUTH_UID) {
      const text = [input.title, input.body, input.url ? absolute(input.url) : null].filter(Boolean).join("\n");
      try {
        if (await sendToPhil(text)) return "telegram";
      } catch (err) {
        console.error("[phirstmaxx/notify] telegram failed:", err);
      }
    }
    return null;
  });
}

/** Through the interruption budget. Returns the channel, or null when it was held back or nothing could take it. */
async function deliverWeighed(personId: string, input: NotifyInput, now: Date): Promise<string | null> {
  return withUser(personId, async (rdb) => {
    const r = await interrupt(rdb, personId, { kind: `phirstmaxx.${input.kind}`, origin: "app", title: input.title, body: input.body, url: input.url }, now);
    return r.sent ? r.channel : null;
  });
}

/**
 * Write the row, then deliver. `db` is the caller's client (a member of the
 * space). Never throws for a delivery failure; throws only when the row
 * itself could not be written.
 */
export async function notifyPerson(db: SupabaseClient, spaceId: string, personId: string, input: NotifyInput, now: Date = new Date()): Promise<NotifyResult> {
  const row = {
    space_id: spaceId,
    person_id: personId,
    kind: input.kind,
    title: input.title.slice(0, 200),
    body: input.body?.slice(0, 1000) ?? null,
    url: input.url ?? null,
    plan_id: input.plan_id ?? null,
    thing_id: input.thing_id ?? null,
    drop_id: input.drop_id ?? null,
  };
  const ins = await db.from("pm_notifications").insert(row).select("id").single();
  if (ins.error) throw new Error(`pm_notifications: ${ins.error.message}`);
  const id = (ins.data as { id: string }).id;

  let via: string | null = null;
  try {
    via = input.counts ? await deliverWeighed(personId, input, now) : await deliverDirect(personId, input);
  } catch (err) {
    console.error("[phirstmaxx/notify] delivery failed:", err instanceof Error ? err.message : err);
  }
  if (via) await db.from("pm_notifications").update({ sent_via: via }).eq("id", id);
  return { id, sent_via: via };
}

/** The same message to several people; one row each. */
export async function notifyPeople(db: SupabaseClient, spaceId: string, personIds: readonly string[], input: NotifyInput, now: Date = new Date()): Promise<NotifyResult[]> {
  const out: NotifyResult[] = [];
  for (const pid of new Set(personIds)) {
    try {
      out.push(await notifyPerson(db, spaceId, pid, input, now));
    } catch (err) {
      console.error(`[phirstmaxx/notify] ${pid}:`, err instanceof Error ? err.message : err);
      out.push({ id: null, sent_via: null });
    }
  }
  return out;
}

export async function listNotifications(db: SupabaseClient, spaceId: string, personId: string, opts: { unreadOnly?: boolean; limit?: number } = {}): Promise<PmNotification[]> {
  let q = db.from("pm_notifications").select(COLS).eq("space_id", spaceId).eq("person_id", personId).order("created_at", { ascending: false }).limit(Math.min(200, Math.max(1, opts.limit ?? 50)));
  if (opts.unreadOnly) q = q.is("read_at", null);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as PmNotification[];
}

/** Mark the person's own rows read; ids from another person are ignored by the filter. Returns how many changed. */
export async function markRead(db: SupabaseClient, spaceId: string, personId: string, ids: readonly string[], now: Date = new Date()): Promise<number> {
  const list = [...new Set(ids)].filter((id) => typeof id === "string" && id.length > 0).slice(0, 200);
  if (list.length === 0) return 0;
  const { data, error } = await db.from("pm_notifications").update({ read_at: now.toISOString() }).eq("space_id", spaceId).eq("person_id", personId).in("id", list).is("read_at", null).select("id");
  if (error) throw new Error(error.message);
  return (data ?? []).length;
}
