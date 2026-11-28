import { headers } from "next/headers";
import { Shell } from "@/components/dashboard/Shell";
import { OperatorZone } from "@/components/dashboard/OperatorZone";
import { TodayHeader } from "@/components/dashboard/today/TodayHeader";
import { DashboardSwitcher } from "@/components/dashboard/today/DashboardSwitcher";
import { LoopLinks } from "@/components/daily/LoopLinks";
import { FocusCard } from "@/components/daily/FocusCard";
import { GoneQuiet } from "@/components/dashboard/GoneQuiet";
import { HomeView } from "@/components/home/HomeView";
import { defaultViewForShell } from "@/components/home/registry";
import { PRINCIPAL_USER_HEADER } from "@/lib/auth/gate";
import { createUserClient } from "@/lib/supabase/user";
import { dailySettings } from "@/lib/daily/settings";
import type { HomeData } from "@/lib/home/contract";
import { loadHome } from "@/lib/home/data";
import { getUiPrefs, shellOf, type ShellChoice } from "@/lib/settings/uiPrefs";
import {
  buildHeadlineContext,
  matchHeadlines,
  type HeadlineCandidate,
} from "@/lib/dashboard/headlines";

/**
 * Home. Two shells live side by side behind the switch in Settings →
 * Appearance (claude/ui-direction.md):
 *
 *   classic  the dashboard, as it has been.
 *   new      on desktop, the registered Home view (Specimen plate) fed by
 *            the Home data contract; on a phone, the single next-thing
 *            card. If Home's data cannot be loaded the card loads itself
 *            in the browser instead of the page failing.
 *   field    the same, with the tile grid as the desktop view
 *            (components/home/TilesView.tsx) and the same phone card.
 */
export default async function DashboardPage() {
  let shell: ShellChoice = "classic";
  let supabase: Awaited<ReturnType<typeof createUserClient>> | null = null;
  try {
    supabase = await createUserClient();
    shell = shellOf((await getUiPrefs(supabase)).shell);
  } catch (err) {
    console.error("[home/prefs]", err);
  }

  if ((shell === "new" || shell === "field") && supabase) {
    let data: HomeData | null = null;
    let chime = true;
    try {
      const uid = (await headers()).get(PRINCIPAL_USER_HEADER);
      if (uid) {
        chime = (await dailySettings(supabase)).chime;
        data = await loadHome(supabase, uid);
      }
    } catch (err) {
      console.error("[home/new]", err);
    }
    return (
      <Shell active="HOME" bleed>
        {data ? (
          <div className="hidden lg:block">
            <HomeView data={data} view={defaultViewForShell(shell)} chime={chime} />
          </div>
        ) : null}
        <div className={data ? "lg:hidden" : undefined}>
          <FocusCard initial={data?.today ?? null} chime={chime} />
        </div>
      </Shell>
    );
  }

  let candidates: HeadlineCandidate[] = [];
  try {
    if (supabase) candidates = matchHeadlines(await buildHeadlineContext(supabase));
  } catch (err) {
    console.error("[dashboard/headlines]", err);
  }

  return (
    <Shell active="HOME">
      <OperatorZone candidates={candidates} />
      <LoopLinks />
      <GoneQuiet />
      <TodayHeader />
      <DashboardSwitcher />
    </Shell>
  );
}
