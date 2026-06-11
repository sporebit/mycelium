"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { WorkoutEditor } from "./WorkoutEditor";
import { Panel } from "@/components/dashboard/Panel";
import { Mono } from "@/components/dashboard/Mono";
import { KIND_LABEL } from "@/lib/fitness/workouts";
import type { WorkoutDetail, WorkoutSessionSummary } from "@/lib/fitness/workouts";

export function WorkoutDetailClient({ id }: { id: string }) {
  const [workout, setWorkout] = useState<WorkoutDetail | null>(null);
  const [sessions, setSessions] = useState<WorkoutSessionSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/workouts/${id}`);
      if (!r.ok) {
        setError(`Couldn't load (${r.status})`);
        return;
      }
      const j = (await r.json()) as {
        workout?: WorkoutDetail;
        sessions?: WorkoutSessionSummary[];
      };
      setWorkout(j.workout ?? null);
      setSessions(j.sessions ?? []);
    } catch {
      setError("Couldn't load");
    }
  }, [id]);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  async function patchWorkout(patch: Partial<WorkoutDetail>) {
    if (!workout) return;
    setWorkout({ ...workout, ...patch });
    await fetch(`/api/workouts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  }

  const stats = useMemo(() => {
    if (sessions.length === 0) return null;
    const totalSessions = sessions.length;
    const lastPerformed = sessions[0]?.date ?? null;
    const bestVolume = Math.max(...sessions.map((s) => s.total_volume_kg));
    // Streak: consecutive weeks with at least one session
    const weekSet = new Set<string>();
    for (const s of sessions) {
      const d = new Date(s.date);
      const y = d.getFullYear();
      const w = Math.ceil(
        ((d.getTime() - new Date(y, 0, 1).getTime()) / 86400000 + 1) / 7,
      );
      weekSet.add(`${y}-W${w}`);
    }
    const sorted = [...weekSet].sort().reverse();
    let streak = 0;
    for (let i = 0; i < sorted.length; i++) {
      if (i === 0) { streak = 1; continue; }
      const [py, pw] = sorted[i - 1].split("-W").map(Number);
      const [cy, cw] = sorted[i].split("-W").map(Number);
      if ((py === cy && pw - cw === 1) || (py - cy === 1 && cw >= 52 && pw <= 1)) {
        streak++;
      } else break;
    }
    return { totalSessions, lastPerformed, bestVolume, streak };
  }, [sessions]);

  const chartData = useMemo(
    () =>
      [...sessions]
        .reverse()
        .map((s) => ({
          date: s.date,
          volume: Math.round(s.total_volume_kg),
          sets: s.set_count,
        })),
    [sessions],
  );

  if (error) {
    return (
      <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-danger font-[family-name:var(--font-mono)]">
        ⚠ {error}
      </div>
    );
  }
  if (!workout) {
    return (
      <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-12 text-center">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/fitness/workouts"
        className="self-start text-[11px] uppercase tracking-[0.18em] text-ink-3 hover:text-ink-4 font-[family-name:var(--font-mono)]"
      >
        ← ALL WORKOUTS
      </Link>

      <header>
        <h1 className="text-2xl text-text-0 font-[family-name:var(--font-display)] italic">
          {workout.name}
        </h1>
        <div className="flex items-center gap-2 mt-1">
          {workout.default_kind && (
            <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] px-2 py-0.5 rounded border border-ink-2">
              {KIND_LABEL[workout.default_kind]}
            </span>
          )}
          {workout.notes && (
            <span className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
              {workout.notes}
            </span>
          )}
        </div>
      </header>

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Panel borderless>
            <div className="text-center">
              <div className="text-xl text-text-0 font-[family-name:var(--font-mono)] tabular-nums">
                {stats.totalSessions}
              </div>
              <Mono className="text-[10px] text-ink-3">SESSIONS</Mono>
            </div>
          </Panel>
          <Panel borderless>
            <div className="text-center">
              <div className="text-xl text-text-0 font-[family-name:var(--font-mono)] tabular-nums">
                {stats.lastPerformed ?? "—"}
              </div>
              <Mono className="text-[10px] text-ink-3">LAST PERFORMED</Mono>
            </div>
          </Panel>
          <Panel borderless>
            <div className="text-center">
              <div className="text-xl text-text-0 font-[family-name:var(--font-mono)] tabular-nums">
                {stats.bestVolume > 0 ? `${Math.round(stats.bestVolume)}kg` : "—"}
              </div>
              <Mono className="text-[10px] text-ink-3">BEST VOLUME</Mono>
            </div>
          </Panel>
          <Panel borderless>
            <div className="text-center">
              <div className="text-xl text-text-0 font-[family-name:var(--font-mono)] tabular-nums">
                {stats.streak}w
              </div>
              <Mono className="text-[10px] text-ink-3">STREAK</Mono>
            </div>
          </Panel>
        </div>
      )}

      {chartData.length >= 2 && (
        <Panel title="Volume over time" topRight={<Mono>KG</Mono>}>
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
                <Line
                  type="monotone"
                  dataKey="volume"
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

      <WorkoutEditor workout={workout} onPatchWorkout={patchWorkout} />

      {sessions.length > 0 && (
        <Panel title="Session history" topRight={<Mono>{sessions.length}</Mono>}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] border-b border-ink-2">
                  <th className="text-left py-2 pr-3">Date</th>
                  <th className="text-right py-2 px-3">Sets</th>
                  <th className="text-right py-2 px-3">Volume</th>
                  <th className="text-right py-2 pl-3">Duration</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.session_id} className="border-b border-ink-2">
                    <td className="py-2 pr-3 text-ink-4">{s.date}</td>
                    <td className="text-right py-2 px-3">
                      <Mono className="text-ink-3">{s.set_count}</Mono>
                    </td>
                    <td className="text-right py-2 px-3">
                      <Mono className="text-ink-4">
                        {s.total_volume_kg > 0
                          ? `${Math.round(s.total_volume_kg)}kg`
                          : "—"}
                      </Mono>
                    </td>
                    <td className="text-right py-2 pl-3">
                      <Mono className="text-ink-3">
                        {s.duration_minutes != null
                          ? `${s.duration_minutes}min`
                          : "—"}
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
