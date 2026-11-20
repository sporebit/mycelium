import { headers } from "next/headers";
import { Shell } from "@/components/dashboard/Shell";
import { FocusCard } from "@/components/daily/FocusCard";
import { PRINCIPAL_USER_HEADER } from "@/lib/auth/gate";
import { ensurePlan } from "@/lib/daily/server";
import { dailySettings } from "@/lib/daily/settings";
import { type TodayView, viewOf } from "@/lib/daily/view";
import { createUserClient } from "@/lib/supabase/user";

export const dynamic = "force-dynamic";

/**
 * Today: one card. The page arrives with the card already in it, so opening
 * the app after any gap shows the next thing at once and never a backlog
 * (research rules 2 and 3). If the server-side read fails the card loads
 * itself in the browser instead of the page failing.
 */
export default async function TodayPage() {
  let initial: TodayView | null = null;
  let chime = true;
  try {
    const uid = (await headers()).get(PRINCIPAL_USER_HEADER);
    if (uid) {
      const db = await createUserClient();
      const settings = await dailySettings(db);
      chime = settings.chime;
      initial = await viewOf(db, await ensurePlan(db, uid, undefined, { freeMinutes: settings.free_minutes }));
    }
  } catch (err) {
    console.error("[today]", err);
  }
  return (
    <Shell>
      <FocusCard initial={initial} chime={chime} />
    </Shell>
  );
}
