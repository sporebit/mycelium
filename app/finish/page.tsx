import { headers } from "next/headers";
import { Shell } from "@/components/dashboard/Shell";
import { FinishLine } from "@/components/daily/FinishLine";
import { PRINCIPAL_USER_HEADER } from "@/lib/auth/gate";
import type { FinishItem } from "@/lib/daily/finish";
import { finishLineFor } from "@/lib/daily/finishServer";
import { dailySettings } from "@/lib/daily/settings";
import { createUserClient } from "@/lib/supabase/user";

export const dynamic = "force-dynamic";

/**
 * /finish — the finish line (research rule 22): at most three things that
 * are nearly done, with what is left on each and three exits. If the
 * server-side read fails the view loads itself in the browser instead of
 * the page failing.
 */
export default async function FinishPage() {
  let initial: FinishItem[] | null = null;
  let chime = true;
  try {
    const uid = (await headers()).get(PRINCIPAL_USER_HEADER);
    if (uid) {
      const db = await createUserClient();
      chime = (await dailySettings(db)).chime;
      initial = await finishLineFor(db, uid);
    }
  } catch (err) {
    console.error("[finish]", err);
  }
  return (
    <Shell>
      <FinishLine initial={initial} chime={chime} />
    </Shell>
  );
}
