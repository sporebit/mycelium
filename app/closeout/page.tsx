import { Shell } from "@/components/dashboard/Shell";
import { Closeout } from "@/components/daily/Closeout";
import { dailySettings } from "@/lib/daily/settings";
import { createUserClient } from "@/lib/supabase/user";

export const dynamic = "force-dynamic";

/** The weekly close-out: a forty-five-minute box, the week's fill, one quiet section raised, the month's measures. */
export default async function CloseoutPage() {
  let chime = true;
  try {
    chime = (await dailySettings(await createUserClient())).chime;
  } catch {
    /* defaults */
  }
  return (
    <Shell>
      <Closeout chime={chime} />
    </Shell>
  );
}
