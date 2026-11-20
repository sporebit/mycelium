import { createUserClient } from "@/lib/supabase/user";
import { DraggableCardGrid } from "@/components/dashboard/DraggableCardGrid";
import { sectionCards } from "@/lib/nav/cards";

async function fetchHealthSummary() {
  const supabase = await createUserClient();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

  const [weightRes, painRes, gutRes, listsRes] = await Promise.all([
    supabase
      .from("body_metrics")
      .select("weight, date")
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("exercise_pain_logs")
      .select("*", { count: "exact", head: true })
      .gte("created_at", thirtyDaysAgo),
    supabase
      .from("gut_health_logs")
      .select("logged_at, bristol_type")
      .order("logged_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("shopping_lists").select("items"),
  ]);

  const latestWeight = weightRes.data as { weight: number; date: string } | null;
  const painCount = painRes.count ?? 0;
  const lastGut = gutRes.data as { logged_at: string; bristol_type: number } | null;

  const lists = (listsRes.data ?? []) as { items: unknown[] }[];
  const activeListCount = lists.length;
  let uncheckedItems = 0;
  for (const list of lists) {
    const items = (list.items ?? []) as Record<string, unknown>[];
    uncheckedItems += items.filter((i) => !("checked" in i) || !i.checked).length;
  }

  return { latestWeight, painCount, lastGut, activeListCount, uncheckedItems };
}

export default async function HealthOverviewPage() {
  const { latestWeight, painCount, lastGut, activeListCount, uncheckedItems } =
    await fetchHealthSummary();

  // Every Health page in the sidebar gets a box (lib/nav/cards.ts); these
  // four carry a live figure, and Body Metrics lives under Fitness.
  const CARDS = sectionCards("health", { custom: [
    {
      key: "body",
      label: "Body Metrics",
      href: "/fitness/body",
      description: "Weight, measurements, body composition over time.",
      detail: latestWeight
        ? `${latestWeight.weight} kg — ${new Date(latestWeight.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
        : "No entries yet",
    },
    {
      key: "pain",
      label: "Pain Tracking",
      href: "/health/pain",
      description: "Standalone pain logs + recent session pain notes.",
      detail:
        painCount > 0
          ? `${painCount} log${painCount === 1 ? "" : "s"} in last 30 days`
          : "No recent logs",
    },
    {
      key: "gut_health",
      label: "Gut Health",
      href: "/health/gut-health",
      description: "Bristol Scale daily log with 30-day overview strip.",
      detail: lastGut
        ? `Last: Type ${lastGut.bristol_type} — ${new Date(lastGut.logged_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
        : "No entries yet",
    },
    {
      key: "shopping_lists",
      label: "Shopping Lists",
      href: "/health/shopping-lists",
      description: "Shareable lists with voice capture and Telegram sync.",
      detail:
        activeListCount > 0
          ? `${activeListCount} list${activeListCount === 1 ? "" : "s"}, ${uncheckedItems} unchecked`
          : "No lists yet",
    },
  ] });

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="font-[family-name:var(--font-display)] italic text-2xl text-text-hi">
          Health
        </h1>
        <p className="text-sm text-text-lo italic font-[family-name:var(--font-display)]">
          Bodies tracked across nutrition, metrics, and pain.
        </p>
      </header>

      <DraggableCardGrid section="health" cards={CARDS} />
    </div>
  );
}
