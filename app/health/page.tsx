import { createServerClient } from "@/lib/supabase/server";
import { DraggableCardGrid, type DraggableCard } from "@/components/dashboard/DraggableCardGrid";

async function fetchHealthSummary() {
  const supabase = createServerClient();
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

  const CARDS: DraggableCard[] = [
    {
      key: "nutrition",
      label: "Nutrition",
      href: "/health/nutrition",
      description: "Daily macros, meal groups, barcode scan, foods library.",
    },
    {
      key: "body",
      label: "Body Metrics",
      href: "/health/body",
      description: "Weight, measurements, body composition over time.",
      detail: latestWeight
        ? `${latestWeight.weight} kg — ${new Date(latestWeight.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
        : "No entries yet",
    },
    {
      key: "supplements",
      label: "Supplements",
      href: "/health/supplements",
      description: "Active supplement stack with one-tap dose logging.",
    },
    {
      key: "pain",
      label: "Pain Tracking",
      href: "/fitness/body",
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
      key: "blood_tests",
      label: "Blood Tests",
      href: "/health/blood-tests",
      description: "Markers, ranges, and trends across sessions.",
    },
    {
      key: "vision",
      label: "Vision",
      href: "/health/eye-prescription",
      description: "Eye prescriptions and contact lens history.",
    },
    {
      key: "recipes",
      label: "Recipes",
      href: "/health/recipes",
      description: "Recipe library with vision scan, meal planner, and shopping lists.",
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
  ];

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="font-[family-name:var(--font-display)] italic text-2xl text-text-0">
          Health
        </h1>
        <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
          Bodies tracked across nutrition, metrics, and pain.
        </p>
      </header>

      <DraggableCardGrid section="health" cards={CARDS} />
    </div>
  );
}
