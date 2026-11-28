"use client";

/**
 * The day's state and actions for a Home view: Done and Not now through
 * the daily-loop route the phone's focus card uses, Not today on a nudge,
 * and the week and lifetime counts moving with each Done. Specimen plate
 * and the Field shell's tiles both draw from this, so neither repeats the
 * API calls. A view adds only its own moment through `onDone` (the plate's
 * new growth); the chime is played here, honouring the person's setting.
 */
import { useCallback, useState } from "react";
import { playChime } from "@/components/daily/chime";
import type { HomeData, HomeItem } from "@/lib/home/contract";

export function useHomeDay(data: HomeData, { chime = true, onDone }: { chime?: boolean; onDone?: (item: HomeItem) => void } = {}) {
  const [items, setItems] = useState<HomeItem[]>(data.items);
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [weekCount, setWeekCount] = useState(data.week.count);
  const [lifetime, setLifetime] = useState(data.lifetime.count);
  const [notes, setNotes] = useState(data.nudges);

  const notToday = async (id: string) => {
    // One tap, no reason asked, nobody told (research rule 30). The note goes at once; if the save fails it comes back.
    const before = notes;
    setNotes((list) => list.filter((n) => n.id !== id));
    const res = await fetch(`/api/nudges/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "not_today" }) }).catch(() => null);
    if (!res?.ok) setNotes(before);
  };

  const act = useCallback(
    async (item: HomeItem, action: "done" | "not_now") => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(`/api/daily/items/${item.item_id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) });
        if (!res.ok) throw new Error("not saved");
        if (action === "done") {
          setItems((list) => list.map((i) => (i.item_id === item.item_id ? { ...i, state: "done" } : i)));
          setWeekCount((n) => n + 1);
          setLifetime((n) => n + 1);
          onDone?.(item);
          if (chime) playChime(item.is_win);
          // Stay on it: the finished item holds the centre until another is chosen.
          setPicked(item.item_id);
        } else {
          setGone((s) => new Set(s).add(item.item_id));
          setPicked(null);
        }
      } catch {
        setError("That did not save. Nothing was changed; try again.");
      } finally {
        setBusy(false);
      }
    },
    [chime, onDone],
  );

  const shown = items.filter((i) => !gone.has(i.item_id));
  return { items, shown, picked, setPicked, busy, error, weekCount, lifetime, notes, notToday, act };
}
