import { Shell } from "@/components/dashboard/Shell";
import { CloseDay } from "@/components/daily/CloseDay";
import { dailySettings } from "@/lib/daily/settings";
import { createUserClient } from "@/lib/supabase/user";

export const dynamic = "force-dynamic";

/** The evening close: what got done, then one card per thing still open. */
export default async function ClosePage() {
  let chime = true;
  try {
    chime = (await dailySettings(await createUserClient())).chime;
  } catch {
    /* defaults */
  }
  return (
    <Shell>
      <CloseDay chime={chime} />
    </Shell>
  );
}
