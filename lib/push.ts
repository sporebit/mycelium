import webpush from "web-push";
import { createServerClient } from "@/lib/supabase/server";

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY ?? "";
const VAPID_SUBJECT = `mailto:${process.env.USER_EMAIL ?? "noreply@example.com"}`;

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  icon?: string;
};

type SubRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

export async function upsertSubscription(
  supabase: ReturnType<typeof createServerClient>,
  uid: string,
  sub: { endpoint: string; p256dh: string; auth: string; userAgent?: string },
) {
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: uid,
      endpoint: sub.endpoint,
      p256dh: sub.p256dh,
      auth: sub.auth,
      user_agent: sub.userAgent ?? null,
    },
    { onConflict: "endpoint" },
  );
  return { ok: !error, error: error?.message };
}

export async function sendToUser(
  supabase: ReturnType<typeof createServerClient>,
  uid: string,
  payload: PushPayload,
): Promise<{ sent: number; pruned: number }> {
  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", uid);

  if (!subs || subs.length === 0) return { sent: 0, pruned: 0 };

  let sent = 0;
  const dead: string[] = [];

  for (const row of subs as SubRow[]) {
    try {
      await webpush.sendNotification(
        {
          endpoint: row.endpoint,
          keys: { p256dh: row.p256dh, auth: row.auth },
        },
        JSON.stringify(payload),
      );
      sent++;
    } catch (err: unknown) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        dead.push(row.id);
      }
    }
  }

  if (dead.length > 0) {
    await supabase.from("push_subscriptions").delete().in("id", dead);
  }

  return { sent, pruned: dead.length };
}
