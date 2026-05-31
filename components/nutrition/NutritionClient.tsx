"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Mono } from "@/components/dashboard/Mono";
import type {
  MealGroup,
  NutritionLog,
  NutritionTargets,
} from "@/lib/nutrition/types-v2";
import { DEFAULT_NUTRITION_TARGETS } from "@/lib/nutrition/types-v2";
import { localDateKey } from "@/lib/util/date";
import { MacroBar } from "./MacroBar";
import { MealGroupSection } from "./MealGroupSection";
import { FoodSearch } from "./FoodSearch";
import { NutrientDetailPanel } from "./NutrientDetailPanel";
import { NutritionHistory } from "./NutritionHistory";
import { FoodLibrary } from "./FoodLibrary";
import {
  QuickBarcodeLog,
  defaultGroupNameForTime,
} from "./QuickBarcodeLog";
import { useCurrentDevice } from "@/lib/hooks/useCurrentDevice";

type Tab = "today" | "history" | "library";

type Toast = { kind: "ok" | "error"; text: string } | null;

function shiftDate(dateKey: string, deltaDays: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return dt.toISOString().slice(0, 10);
}

function formatDate(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString("en-GB", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function NutritionClient() {
  const [tab, setTab] = useState<Tab>("today");
  const [date, setDate] = useState(() => localDateKey());
  const [logs, setLogs] = useState<NutritionLog[] | null>(null);
  const [mealGroups, setMealGroups] = useState<MealGroup[]>([]);
  const [burned, setBurned] = useState<number>(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [pendingGroupId, setPendingGroupId] = useState<string | null>(null);
  const [newGroupName, setNewGroupName] = useState("");
  const [toast, setToast] = useState<Toast>(null);
  const [quickScanOpen, setQuickScanOpen] = useState(false);
  const device = useCurrentDevice();
  const isMobile = device === "phone" || device === "tablet";
  const targets: NutritionTargets = DEFAULT_NUTRITION_TARGETS;

  const showToast = useCallback((kind: "ok" | "error", text: string) => {
    setToast({ kind, text });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(id);
  }, [toast]);

  // Meal groups load once
  useEffect(() => {
    let cancelled = false;
    fetch("/api/nutrition/meal-groups")
      .then((r) => r.json())
      .then((j: { meal_groups?: MealGroup[] }) => {
        if (cancelled) return;
        setMealGroups(Array.isArray(j.meal_groups) ? j.meal_groups : []);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // Logs + burned re-fetch on date change
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setLogs(null);
    });
    Promise.all([
      fetch(`/api/nutrition/logs?date=${encodeURIComponent(date)}`).then((r) => r.json()),
      fetch(`/api/nutrition/burned?date=${encodeURIComponent(date)}`).then((r) => r.json()),
    ])
      .then(
        ([logsRes, burnedRes]: [
          { logs?: NutritionLog[] },
          { burned?: number },
        ]) => {
          if (cancelled) return;
          setLogs(Array.isArray(logsRes.logs) ? logsRes.logs : []);
          setBurned(typeof burnedRes.burned === "number" ? burnedRes.burned : 0);
        },
      )
      .catch(() => !cancelled && setLogs([]));
    return () => {
      cancelled = true;
    };
  }, [date]);

  const totals = useMemo(() => {
    const out = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
    for (const l of logs ?? []) {
      out.kcal += l.kcal ?? 0;
      out.protein += l.protein_g ?? 0;
      out.carbs += l.carbs_g ?? 0;
      out.fat += l.fat_g ?? 0;
    }
    return out;
  }, [logs]);

  const logsByGroup = useMemo(() => {
    const map = new Map<string | null, NutritionLog[]>();
    for (const l of logs ?? []) {
      const key = l.meal_group_id;
      const list = map.get(key) ?? [];
      list.push(l);
      map.set(key, list);
    }
    return map;
  }, [logs]);

  function openAdd(groupId: string | null) {
    setPendingGroupId(groupId);
    setSearchOpen(true);
  }

  function handleLogged(log: NutritionLog) {
    setLogs((cur) => [...(cur ?? []), log]);
    showToast("ok", "Logged");
  }

  async function deleteLog(logId: string) {
    const prev = logs ?? [];
    setLogs((cur) => (cur ?? []).filter((l) => l.id !== logId));
    try {
      const r = await fetch(`/api/nutrition/logs/${logId}`, { method: "DELETE" });
      if (!r.ok) throw new Error("delete failed");
    } catch {
      setLogs(prev);
      showToast("error", "Delete failed");
    }
  }

  async function changeQuantity(logId: string, quantityG: number) {
    const prev = logs ?? [];
    // Optimistic: clear computed fields so the row shows quickly; the
    // server response replaces it with recomputed nutrients.
    setLogs((cur) =>
      (cur ?? []).map((l) =>
        l.id === logId ? { ...l, quantity_g: quantityG } : l,
      ),
    );
    try {
      const r = await fetch(`/api/nutrition/logs/${logId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity_g: quantityG }),
      });
      const j = (await r.json().catch(() => ({}))) as { log?: NutritionLog };
      if (!r.ok || !j.log) throw new Error("update failed");
      setLogs((cur) =>
        (cur ?? []).map((l) => (l.id === logId ? j.log! : l)),
      );
    } catch {
      setLogs(prev);
      showToast("error", "Update failed");
    }
  }

  async function addMealGroup() {
    const name = newGroupName.trim();
    if (!name) return;
    try {
      const r = await fetch("/api/nutrition/meal-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const j = (await r.json().catch(() => ({}))) as {
        meal_group?: MealGroup;
        error?: string;
      };
      if (!r.ok || !j.meal_group) {
        showToast("error", j.error ?? "Add failed");
        return;
      }
      setMealGroups((cur) => [...cur, j.meal_group!]);
      setNewGroupName("");
    } catch {
      showToast("error", "Add failed");
    }
  }

  async function renameMealGroup(groupId: string, name: string) {
    const prev = mealGroups;
    setMealGroups((cur) =>
      cur.map((g) => (g.id === groupId ? { ...g, name } : g)),
    );
    try {
      const r = await fetch(`/api/nutrition/meal-groups/${groupId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!r.ok) throw new Error("rename failed");
    } catch {
      setMealGroups(prev);
      showToast("error", "Rename failed");
    }
  }

  async function deleteMealGroup(groupId: string) {
    const prev = mealGroups;
    setMealGroups((cur) => cur.filter((g) => g.id !== groupId));
    // Existing logs become "Unassigned"
    setLogs((cur) =>
      (cur ?? []).map((l) =>
        l.meal_group_id === groupId ? { ...l, meal_group_id: null } : l,
      ),
    );
    try {
      const r = await fetch(`/api/nutrition/meal-groups/${groupId}`, {
        method: "DELETE",
      });
      if (!r.ok) throw new Error("delete failed");
    } catch {
      setMealGroups(prev);
      showToast("error", "Delete failed");
    }
  }

  const net = Math.max(0, Math.round(totals.kcal - burned));

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="font-[family-name:var(--font-display)] italic text-2xl text-text-0">
            Nutrition
          </h1>
          <div className="flex items-center gap-1">
            <TabBtn label="TODAY" active={tab === "today"} onClick={() => setTab("today")} />
            <TabBtn label="HISTORY" active={tab === "history"} onClick={() => setTab("history")} />
            <TabBtn label="MY FOODS" active={tab === "library"} onClick={() => setTab("library")} />
          </div>
        </div>
      </header>

      {tab === "today" && (
        <>
          {/* Date nav */}
          <div className="flex items-center justify-between rounded-md bg-ink-1 border border-ink-2 px-3 py-2">
            <button
              type="button"
              onClick={() => setDate((d) => shiftDate(d, -1))}
              className="text-[11px] uppercase tracking-[0.18em] text-ink-3 hover:text-ink-4 font-[family-name:var(--font-mono)]"
              aria-label="Previous day"
            >
              ← PREV
            </button>
            <div className="text-center">
              <div className="text-sm text-ink-4">{formatDate(date)}</div>
              {date !== localDateKey() && (
                <button
                  type="button"
                  onClick={() => setDate(localDateKey())}
                  className="text-[10px] uppercase tracking-[0.18em] text-accent hover:text-text-0 font-[family-name:var(--font-mono)]"
                >
                  TODAY
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setDate((d) => shiftDate(d, 1))}
              className="text-[11px] uppercase tracking-[0.18em] text-ink-3 hover:text-ink-4 font-[family-name:var(--font-mono)]"
              aria-label="Next day"
            >
              NEXT →
            </button>
          </div>

          {/* Summary */}
          <section className="rounded-md bg-ink-1 border border-ink-2 px-4 py-4 flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <Mono className="block text-3xl text-ink-4 tabular-nums">
                {Math.round(totals.kcal).toLocaleString()}{" "}
                <span className="text-ink-3 text-lg">
                  / {targets.kcal.toLocaleString()} kcal
                </span>
              </Mono>
              <div className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
                Eaten {Math.round(totals.kcal).toLocaleString()} · Burned{" "}
                {burned.toLocaleString()} · Net {net.toLocaleString()}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <MacroBar label="Protein" value={totals.protein} target={targets.protein} />
              <MacroBar label="Carbs" value={totals.carbs} target={targets.carbs} />
              <MacroBar label="Fat" value={totals.fat} target={targets.fat} />
            </div>
          </section>

          {/* Meal groups */}
          {logs === null ? (
            <ListSkeleton />
          ) : (
            <div className="flex flex-col gap-2.5">
              {mealGroups.map((g) => (
                <MealGroupSection
                  key={g.id}
                  group={g}
                  logs={logsByGroup.get(g.id) ?? []}
                  onAdd={openAdd}
                  onDelete={deleteLog}
                  onChangeQuantity={changeQuantity}
                  onRename={renameMealGroup}
                  onDeleteGroup={deleteMealGroup}
                />
              ))}
              {/* Unassigned bucket only when entries exist outside groups */}
              {(logsByGroup.get(null)?.length ?? 0) > 0 && (
                <MealGroupSection
                  key="__unassigned"
                  group={null}
                  logs={logsByGroup.get(null) ?? []}
                  onAdd={openAdd}
                  onDelete={deleteLog}
                  onChangeQuantity={changeQuantity}
                />
              )}
              {/* Add meal group */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  addMealGroup();
                }}
                className="flex items-center gap-2 px-3 py-2 rounded-md bg-ink-1 border border-dashed border-ink-2"
              >
                <span aria-hidden className="text-ink-3 text-base">+</span>
                <input
                  type="text"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="Add meal group (e.g. Pre-workout)"
                  className="flex-1 bg-transparent outline-none text-sm text-text-0 placeholder:text-ink-3"
                />
                <button
                  type="submit"
                  disabled={!newGroupName.trim()}
                  className="text-[10px] uppercase tracking-[0.18em] text-accent hover:text-text-0 disabled:opacity-40 disabled:cursor-not-allowed font-[family-name:var(--font-mono)]"
                >
                  ADD ↵
                </button>
              </form>
            </div>
          )}

          {logs !== null && (
            <NutrientDetailPanel logs={logs} targets={targets} />
          )}
        </>
      )}

      {tab === "history" && <NutritionHistory />}
      {tab === "library" && (
        <FoodLibrary onError={(m) => showToast("error", m)} />
      )}

      <FoodSearch
        open={searchOpen}
        date={date}
        mealGroups={mealGroups}
        defaultMealGroupId={pendingGroupId}
        initialTab={isMobile ? "scan" : "search"}
        autoLaunchScan={isMobile}
        onClose={() => setSearchOpen(false)}
        onLogged={handleLogged}
        onError={(m) => showToast(m.includes("Saved") ? "ok" : "error", m)}
      />

      <QuickBarcodeLog
        open={quickScanOpen}
        date={date}
        mealGroups={mealGroups}
        defaultMealGroupName={defaultGroupNameForTime()}
        onClose={() => setQuickScanOpen(false)}
        onLogged={handleLogged}
        onError={(m) => showToast("error", m)}
      />

      {/* Floating quick-scan button — always visible while the user is
          on the daily nutrition tab; hidden on history / library tabs
          where it'd be off-topic. */}
      {tab === "today" && (
        <button
          type="button"
          onClick={() => setQuickScanOpen(true)}
          aria-label="Scan a barcode to log food"
          title="Scan a barcode"
          className="fixed right-4 bottom-[calc(env(safe-area-inset-bottom,0px)+1rem)] md:right-6 md:bottom-6 z-[90] h-14 w-14 md:h-10 md:w-10 rounded-full bg-glow-2 text-ink-0 shadow-2xl hover:bg-glow-1 transition-colors flex items-center justify-center"
        >
          <FabCameraIcon />
        </button>
      )}

      {toast && (
        <div
          role="status"
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[120] px-4 py-2 rounded-md text-sm shadow-2xl font-[family-name:var(--font-mono)] ${
            toast.kind === "ok"
              ? "bg-ok/20 text-ok border border-ok/40"
              : "bg-danger/20 text-danger border border-danger/40"
          }`}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}

function FabCameraIcon() {
  return (
    <svg
      width={22}
      height={22}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 8a2 2 0 0 1 2-2h2l1.5-2h7L17 6h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

function TabBtn({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] rounded-md transition-colors ${
        active ? "bg-ink-2 text-ink-4" : "text-ink-3 hover:text-ink-4"
      }`}
    >
      {label}
    </button>
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-2.5">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="rounded-md bg-ink-1 border border-ink-2 px-3 py-3 animate-pulse"
        >
          <div className="h-3 w-24 rounded-md bg-ink-2" />
          <div className="h-4 w-full rounded-md bg-ink-2/70 mt-3" />
          <div className="h-4 w-3/4 rounded-md bg-ink-2/60 mt-2" />
        </div>
      ))}
    </div>
  );
}
