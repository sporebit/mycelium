"use client";

import { useEffect, useMemo, useState } from "react";
import { Panel } from "@/components/dashboard/Panel";
import { Mono } from "@/components/dashboard/Mono";
import { localDateKey } from "@/lib/util/date";
import { formatWeightInUnit } from "@/lib/fitness/units";
import type { BodyMetric, WeightUnit } from "@/lib/fitness/types";

type Toast = { kind: "success" | "error"; text: string } | null;

const UNITS: WeightUnit[] = ["kg", "lbs", "stone"];

function fmtNum(n: number | null, suffix = "", decimals = 1): string {
  if (n === null || !Number.isFinite(n)) return "—";
  return `${n.toFixed(decimals)}${suffix}`;
}

export function BodyMetricsView() {
  const [entries, setEntries] = useState<BodyMetric[] | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [saving, setSaving] = useState(false);

  const today = useMemo(() => localDateKey(), []);
  const [date, setDate] = useState<string>(today);
  const [weight, setWeight] = useState<string>("");
  const [unit, setUnit] = useState<WeightUnit>("kg");
  const [bodyFat, setBodyFat] = useState<string>("");
  const [muscle, setMuscle] = useState<string>("");
  const [waist, setWaist] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  async function load() {
    const res = await fetch("/api/body-metrics?days=30", { cache: "no-store" });
    if (res.ok) {
      const j = (await res.json()) as { entries?: BodyMetric[] };
      setEntries(Array.isArray(j.entries) ? j.entries : []);
    } else setEntries([]);
  }

  useEffect(() => {
    let mounted = true;
    (async () => {
      const res = await fetch("/api/body-metrics?days=30", { cache: "no-store" });
      if (!mounted) return;
      if (res.ok) {
        const j = (await res.json()) as { entries?: BodyMetric[] };
        if (mounted) setEntries(Array.isArray(j.entries) ? j.entries : []);
      } else if (mounted) setEntries([]);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(id);
  }, [toast]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/body-metrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          weight: weight ? Number(weight) : null,
          weight_unit: unit,
          body_fat_pct: bodyFat ? Number(bodyFat) : null,
          muscle_mass_kg: muscle ? Number(muscle) : null,
          waist_cm: waist ? Number(waist) : null,
          notes: notes.trim() || null,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        setToast({ kind: "error", text: j.error ?? "Save failed" });
        return;
      }
      setToast({ kind: "success", text: "✓ Saved" });
      setWeight("");
      setBodyFat("");
      setMuscle("");
      setWaist("");
      setNotes("");
      await load();
    } catch (err) {
      setToast({ kind: "error", text: err instanceof Error ? err.message : "Save error" });
    } finally {
      setSaving(false);
    }
  }

  // Simple sparkline of weight (in kg, converting from logged unit if needed).
  const weightSpark = useMemo(() => {
    if (!entries || entries.length < 2) return null;
    const points = [...entries]
      .reverse()
      .map((e) => {
        const w = e.weight;
        if (w === null) return null;
        // Convert to kg for plotting consistency.
        if (e.weight_unit === "kg") return w;
        if (e.weight_unit === "lbs") return w * 0.453592;
        if (e.weight_unit === "stone") return w * 6.35029;
        return w;
      })
      .filter((x): x is number => x !== null);
    if (points.length < 2) return null;
    const min = Math.min(...points);
    const max = Math.max(...points);
    const range = max - min || 1;
    const stepX = 200 / (points.length - 1);
    const path = points
      .map((p, i) => {
        const x = i * stepX;
        const y = 44 - ((p - min) / range) * 36 - 4;
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
    return { path, min, max };
  }, [entries]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl italic font-[family-name:var(--font-display)] text-ink-4">
        Body metrics
      </h1>

      <Panel title="Log entry">
        <form onSubmit={save} className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <label className="flex flex-col gap-1 col-span-2 sm:col-span-1">
            <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
              Date
            </span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-ink-0/40 border border-ink-2 rounded-md text-sm text-ink-4 px-2 py-1.5 outline-none focus:border-ink-3"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
              Weight
            </span>
            <input
              type="number"
              step="0.1"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder="84.2"
              className="bg-ink-0/40 border border-ink-2 rounded-md text-sm text-ink-4 px-2 py-1.5 outline-none focus:border-ink-3 font-[family-name:var(--font-mono)] tabular-nums"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
              Unit
            </span>
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value as WeightUnit)}
              className="bg-ink-0/40 border border-ink-2 rounded-md text-sm text-ink-4 px-2 py-1.5 outline-none focus:border-ink-3"
            >
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
              Body fat %
            </span>
            <input
              type="number"
              step="0.1"
              value={bodyFat}
              onChange={(e) => setBodyFat(e.target.value)}
              placeholder="18.5"
              className="bg-ink-0/40 border border-ink-2 rounded-md text-sm text-ink-4 px-2 py-1.5 outline-none focus:border-ink-3 font-[family-name:var(--font-mono)] tabular-nums"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
              Muscle (kg)
            </span>
            <input
              type="number"
              step="0.1"
              value={muscle}
              onChange={(e) => setMuscle(e.target.value)}
              placeholder="40.0"
              className="bg-ink-0/40 border border-ink-2 rounded-md text-sm text-ink-4 px-2 py-1.5 outline-none focus:border-ink-3 font-[family-name:var(--font-mono)] tabular-nums"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
              Waist (cm)
            </span>
            <input
              type="number"
              step="0.1"
              value={waist}
              onChange={(e) => setWaist(e.target.value)}
              placeholder="86"
              className="bg-ink-0/40 border border-ink-2 rounded-md text-sm text-ink-4 px-2 py-1.5 outline-none focus:border-ink-3 font-[family-name:var(--font-mono)] tabular-nums"
            />
          </label>
          <label className="flex flex-col gap-1 col-span-2 sm:col-span-4">
            <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
              Notes
            </span>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="optional"
              className="bg-ink-0/40 border border-ink-2 rounded-md text-sm text-ink-4 px-2 py-1.5 outline-none focus:border-ink-3"
            />
          </label>
          <div className="col-span-2 sm:col-span-4 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="px-3 py-1.5 rounded-md bg-accent/15 border border-accent/40 text-accent disabled:opacity-40 disabled:cursor-not-allowed hover:bg-accent/25 transition-colors text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em]"
            >
              {saving ? "SAVING…" : "SAVE"}
            </button>
          </div>
        </form>
      </Panel>

      {weightSpark && (
        <Panel title="Weight (last 30 days)" topRight={<Mono>KG</Mono>}>
          <div className="relative h-12 rounded-lg border border-ink-2 bg-ink-0/40 overflow-hidden">
            <svg
              viewBox="0 0 200 48"
              preserveAspectRatio="none"
              className="absolute inset-0 h-full w-full"
            >
              <path
                d={weightSpark.path}
                fill="none"
                stroke="var(--color-accent)"
                strokeWidth="1.2"
              />
            </svg>
            <div className="absolute right-2 top-1 text-[10px] text-ink-3 font-[family-name:var(--font-mono)]">
              {weightSpark.min.toFixed(1)} – {weightSpark.max.toFixed(1)}
            </div>
          </div>
        </Panel>
      )}

      <Panel title="History" topRight={<Mono>{entries?.length ?? 0}</Mono>}>
        {entries === null ? (
          <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-4 text-center">
            Loading…
          </div>
        ) : entries.length === 0 ? (
          <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
            No entries yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] border-b border-ink-2">
                  <th className="text-left py-2 pr-3">Date</th>
                  <th className="text-right py-2 px-3">Weight</th>
                  <th className="text-right py-2 px-3">BF%</th>
                  <th className="text-right py-2 px-3">Muscle</th>
                  <th className="text-right py-2 pl-3">Waist</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-b border-ink-2">
                    <td className="py-2 pr-3 text-ink-4">{e.date}</td>
                    <td className="text-right py-2 px-3">
                      <Mono className="text-ink-4">
                        {e.weight !== null
                          ? formatWeightInUnit(e.weight, e.weight_unit)
                          : "—"}
                      </Mono>
                    </td>
                    <td className="text-right py-2 px-3">
                      <Mono className="text-ink-3">
                        {fmtNum(e.body_fat_pct, "%")}
                      </Mono>
                    </td>
                    <td className="text-right py-2 px-3">
                      <Mono className="text-ink-3">
                        {fmtNum(e.muscle_mass_kg, "kg")}
                      </Mono>
                    </td>
                    <td className="text-right py-2 pl-3">
                      <Mono className="text-ink-3">
                        {fmtNum(e.waist_cm, "cm", 0)}
                      </Mono>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {toast && (
        <div
          role="status"
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] px-4 py-2 rounded-md text-sm shadow-2xl font-[family-name:var(--font-mono)] ${
            toast.kind === "success"
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
