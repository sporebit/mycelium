import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { auditListRead } from "@/lib/system/readAudit";
import { localDateKey } from "@/lib/util/date";

export const runtime = "nodejs";

const SLOT_ORDER = [
  "wake",
  "breakfast",
  "midday",
  "dinner",
  "before_bed",
  "any_time",
] as const;

const SLOT_LABELS: Record<string, string> = {
  wake: "Wake",
  breakfast: "Breakfast",
  midday: "Midday",
  dinner: "Dinner",
  before_bed: "Before Bed",
  any_time: "Any Time",
};

export async function GET(req: NextRequest) {
  const date =
    new URL(req.url).searchParams.get("date") ?? localDateKey();

  try {
    const supabase = await createUserClient();

    const [{ data: supplements, error: sErr }, { data: logs, error: lErr }] =
      await Promise.all([
        supabase
          .from("supplements")
          .select(
            "id, name, dose, form, brand, timing_slot, fasted, with_food, timing_notes, space_id"
          )
          .eq("active", true)
          .order("name"),
        supabase
          .from("supplement_logs")
          .select("id, supplement_id, timing_slot, taken_at")
          .eq("date", date)
          .order("taken_at", { ascending: false }),
      ]);

    if (sErr) throw sErr;
    if (lErr) throw lErr;
    auditListRead(req, supplements, "health", "supplements");

    const logMap = new Map<string, { id: string; taken_at: string }>();
    for (const l of logs ?? []) {
      if (!logMap.has(l.supplement_id)) {
        logMap.set(l.supplement_id, { id: l.id, taken_at: l.taken_at });
      }
    }

    const slots = SLOT_ORDER.map((slot) => {
      const items = (supplements ?? [])
        .filter((s) => (s.timing_slot ?? "any_time") === slot)
        .map((s) => ({
          id: s.id,
          name: s.name,
          dose: s.dose,
          form: s.form,
          brand: s.brand as string | null,
          fasted: s.fasted as boolean,
          with_food: s.with_food as boolean,
          timing_notes: s.timing_notes as string | null,
          log: logMap.get(s.id) ?? null,
        }));
      return { slot, label: SLOT_LABELS[slot], items };
    }).filter((s) => s.items.length > 0);

    const total = (supplements ?? []).length;
    const taken = logMap.size;

    return NextResponse.json({ date, slots, progress: { taken, total } });
  } catch (err) {
    console.error("[/api/supplements/daily GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
