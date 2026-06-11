"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Panel } from "@/components/dashboard/Panel";
import { Mono } from "@/components/dashboard/Mono";
import { MuscleMapSvg } from "./MuscleMap";
import { MUSCLE_GROUP_LABEL, type MuscleGroup } from "@/lib/fitness/muscle-map";
import type { ExerciseSetRow } from "@/app/api/fitness/exercises/[slug]/route";

type ExerciseDetail = {
  name: string;
  slug: string;
  muscle_group: MuscleGroup;
  muscles: string[];
  secondary_muscles: string[];
  pr_weight: number | null;
  pr_date: string | null;
  total_sets: number;
  first_date: string | null;
  session_count: number;
  session_top_weights: { date: string; weight: number }[];
  sets: ExerciseSetRow[];
};

export function ExerciseDetailClient({ slug }: { slug: string }) {
  const [data, setData] = useState<ExerciseDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/fitness/exercises/${slug}`)
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json();
      })
      .then((d: ExerciseDetail) => setData(d))
      .catch(() => setError("Exercise not found"));
  }, [slug]);

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.session_top_weights
      .filter((s) => s.weight > 0)
      .reverse()
      .map((s) => ({ date: s.date, weight: s.weight }));
  }, [data]);

  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <Link
          href="/fitness/exercises"
          className="self-start text-[11px] uppercase tracking-[0.18em] text-ink-3 hover:text-ink-4 font-[family-name:var(--font-mono)]"
        >
          ← ALL EXERCISES
        </Link>
        <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-danger font-[family-name:var(--font-mono)]">
          ⚠ {error}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-12 text-center">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <Link
        href="/fitness/exercises"
        className="self-start text-[11px] uppercase tracking-[0.18em] text-ink-3 hover:text-ink-4 font-[family-name:var(--font-mono)]"
      >
        ← ALL EXERCISES
      </Link>

      <header>
        <h1 className="text-2xl text-text-0 font-[family-name:var(--font-display)] italic">
          {data.name}
        </h1>
        <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] mt-1 inline-block px-2 py-0.5 rounded border border-ink-2">
          {MUSCLE_GROUP_LABEL[data.muscle_group] ?? data.muscle_group}
        </span>
      </header>

      {/* GIF placeholder */}
      <div className="rounded-lg bg-ink-0/40 border border-ink-2 flex items-center justify-center" style={{ height: 240 }}>
        <span className="text-[11px] text-ink-3 font-[family-name:var(--font-mono)] uppercase">
          Animation coming soon
        </span>
      </div>

      {/* Muscle diagram */}
      {(data.muscles.length > 0 || data.secondary_muscles.length > 0) && (
        <Panel title="Target muscles">
          <MuscleMapSvg
            primaryMuscles={data.muscles}
            secondaryMuscles={data.secondary_muscles}
            height={200}
          />
        </Panel>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Panel borderless>
          <div className="text-center">
            <div className="text-xl text-text-0 font-[family-name:var(--font-mono)] tabular-nums">
              {data.pr_weight ? `${data.pr_weight}kg` : "—"}
            </div>
            <Mono className="text-[10px] text-ink-3">PERSONAL BEST</Mono>
          </div>
        </Panel>
        <Panel borderless>
          <div className="text-center">
            <div className="text-xl text-text-0 font-[family-name:var(--font-mono)] tabular-nums">
              {data.total_sets}
            </div>
            <Mono className="text-[10px] text-ink-3">TOTAL SETS</Mono>
          </div>
        </Panel>
        <Panel borderless>
          <div className="text-center">
            <div className="text-xl text-text-0 font-[family-name:var(--font-mono)] tabular-nums">
              {data.first_date ?? "—"}
            </div>
            <Mono className="text-[10px] text-ink-3">FIRST LOGGED</Mono>
          </div>
        </Panel>
      </div>

      {/* Progression chart */}
      {chartData.length >= 2 && (
        <Panel title="Top set weight" topRight={<Mono>KG</Mono>}>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartData}
                margin={{ top: 12, right: 12, bottom: 8, left: 0 }}
              >
                <CartesianGrid stroke="var(--ink-2)" strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: "var(--ink-3)" }}
                  tickFormatter={(d: string) => d.slice(5)}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "var(--ink-3)" }}
                  width={40}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--ink-1)",
                    border: "1px solid var(--ink-2)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                {data.pr_weight && (
                  <ReferenceLine
                    y={data.pr_weight}
                    stroke="var(--glow-0)"
                    strokeDasharray="4 4"
                    strokeOpacity={0.4}
                  />
                )}
                <Line
                  type="monotone"
                  dataKey="weight"
                  stroke="var(--glow-0)"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "var(--glow-0)" }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      )}

      {/* All logged sets */}
      {data.sets.length > 0 && (
        <Panel title="All logged sets" topRight={<Mono>{data.sets.length}</Mono>}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] border-b border-ink-2">
                  <th className="text-left py-2 pr-3">Date</th>
                  <th className="text-left py-2 px-3">Session</th>
                  <th className="text-right py-2 px-3">Set</th>
                  <th className="text-right py-2 px-3">Reps</th>
                  <th className="text-right py-2 pl-3">Weight</th>
                </tr>
              </thead>
              <tbody>
                {data.sets.map((s, i) => (
                  <tr key={i} className="border-b border-ink-2">
                    <td className="py-2 pr-3 text-ink-4">{s.date}</td>
                    <td className="py-2 px-3 text-ink-3 truncate max-w-[120px]">
                      {s.session_name ?? "—"}
                    </td>
                    <td className="text-right py-2 px-3">
                      <Mono className="text-ink-3">{s.set_number}</Mono>
                    </td>
                    <td className="text-right py-2 px-3">
                      <Mono className="text-ink-4">{s.reps ?? "—"}</Mono>
                    </td>
                    <td className="text-right py-2 pl-3">
                      <Mono className="text-ink-4">
                        {s.weight ? `${s.weight}${s.unit ? ` ${s.unit}` : "kg"}` : "—"}
                      </Mono>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}
