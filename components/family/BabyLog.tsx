"use client";

/**
 * The baby log: one tap for a feed, a nappy, falling asleep, waking up.
 * Made for a phone held in one hand at three in the morning: big buttons,
 * no form, nothing to confirm. A tap can be undone for as long as its row
 * is on screen. Both parents see the same log within a few seconds.
 */
import { useState } from "react";
import { Label, Surface } from "@/components/ui";
import { ago, lasted, nextSide, span } from "@/lib/family/babylog";
import { useApi } from "@/lib/data/useApi";
import { send, timeLabel, type LogRow, type LogSummary, type Overview } from "./api";

type View = { rows: LogRow[]; summary: LogSummary };
const TAP = "min-h-[64px] rounded-v2-lg border border-hairline-strong bg-surface-1 px-3 text-base text-text-hi active:bg-surface-2 hover:bg-surface-2 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-glow";

const describe = (r: LogRow): string => {
  if (r.kind === "feed") {
    const how = r.detail.how === "bottle" ? "Bottle" : r.detail.how === "both" ? "Both sides" : r.detail.how === "left" ? "Left side" : r.detail.how === "right" ? "Right side" : "Feed";
    return typeof r.detail.ml === "number" ? `${how}, ${r.detail.ml} ml` : how;
  }
  if (r.kind === "nappy") return r.detail.what === "both" ? "Nappy, wet and dirty" : r.detail.what === "dirty" ? "Nappy, dirty" : "Nappy, wet";
  if (!r.ended_at) return "Asleep";
  return `Slept ${span(Math.round((Date.parse(r.ended_at) - Date.parse(r.started_at)) / 60_000))}`;
};

export function BabyLog({ family }: { family: Overview }) {
  const { data, mutate } = useApi<View>("/api/family/baby-log", { refreshInterval: 20_000 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ml, setMl] = useState("");
  const s = data?.summary;
  const who = (id: string | null) => family.members.find((m) => m.id === id)?.name ?? "";

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await mutate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not save. Try again.");
    } finally {
      setBusy(false);
    }
  };
  const tap = (body: Record<string, unknown>) => act(() => send("POST", "/api/family/baby-log", body));
  const side = nextSide(s?.last_feed?.how ?? null);

  return (
    <div className="flex flex-col gap-4" data-testid="baby-log">
      <Surface className="grid grid-cols-3 gap-2 p-4 text-center">
        <div>
          <Label>Last feed</Label>
          <p className="text-base text-text-hi sm:text-lg" data-testid="last-feed">{s?.last_feed ? ago(s.last_feed.minutes_ago) : "None yet"}</p>
          {s?.last_feed?.how ? <p className="text-xs text-text-lo">{s.last_feed.how}</p> : null}
        </div>
        <div>
          <Label>Last nappy</Label>
          <p className="text-base text-text-hi sm:text-lg">{s?.last_nappy ? ago(s.last_nappy.minutes_ago) : "None yet"}</p>
          {s?.last_nappy?.what ? <p className="text-xs text-text-lo">{s.last_nappy.what}</p> : null}
        </div>
        <div>
          <Label>Sleep</Label>
          <p className="text-base text-text-hi sm:text-lg">{s?.asleep ? `Asleep ${lasted(s.asleep.minutes)}` : "Awake"}</p>
          <p className="text-xs text-text-lo">{lasted(s?.today.sleep_minutes ?? 0)} today</p>
        </div>
      </Surface>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <button type="button" className={TAP} disabled={busy} onClick={() => void tap({ kind: "feed", how: side })}>
          Feed, {side}
        </button>
        <button type="button" className={TAP} disabled={busy} onClick={() => void tap({ kind: "feed", how: side === "left" ? "right" : "left" })}>
          Feed, {side === "left" ? "right" : "left"}
        </button>
        <div className="flex gap-1">
          <button
            type="button"
            className={`${TAP} min-w-0 flex-1`}
            disabled={busy}
            onClick={() => {
              void tap({ kind: "feed", how: "bottle", ...(ml.trim() ? { ml: Number(ml) } : {}) });
              setMl("");
            }}
          >
            Bottle
          </button>
          {/* optional: how much. Empty is fine; the tap still counts. */}
          <input
            aria-label="Millilitres in the bottle"
            inputMode="numeric"
            placeholder="ml"
            value={ml}
            onChange={(e) => setMl(e.target.value.replace(/\D/g, "").slice(0, 3))}
            className="w-14 rounded-v2-lg border border-hairline bg-surface-0 px-1 text-center text-sm text-text-hi placeholder:text-text-lo focus:border-glow focus:outline-none"
          />
        </div>
        {s?.asleep ? (
          <button type="button" className={`${TAP} border-glow`} disabled={busy} onClick={() => void act(() => send("PATCH", `/api/family/baby-log/${s.asleep!.id}`, { ended_at: "now" }))}>
            Awake
          </button>
        ) : (
          <button type="button" className={TAP} disabled={busy} onClick={() => void tap({ kind: "sleep" })}>
            Asleep
          </button>
        )}
        <button type="button" className={TAP} disabled={busy} onClick={() => void tap({ kind: "nappy", what: "wet" })}>
          Nappy, wet
        </button>
        <button type="button" className={TAP} disabled={busy} onClick={() => void tap({ kind: "nappy", what: "dirty" })}>
          Nappy, dirty
        </button>
        <button type="button" className={TAP} disabled={busy} onClick={() => void tap({ kind: "nappy", what: "both" })}>
          Nappy, both
        </button>
      </div>
      {error ? <p role="alert" className="text-sm text-v2-error">{error}</p> : null}

      <p className="text-sm text-text-mid" data-testid="baby-log-today">
        Today: {s?.today.feeds ?? 0} {s?.today.feeds === 1 ? "feed" : "feeds"}
        {s?.today.bottle_ml ? ` (${s.today.bottle_ml} ml by bottle)` : ""}, {s?.today.wet ?? 0} wet, {s?.today.dirty ?? 0} dirty.
      </p>

      <ul className="flex flex-col divide-y divide-hairline" aria-label="The last three days">
        {(data?.rows ?? []).slice(0, 60).map((r) => (
          <li key={r.id} className="flex items-center gap-3 py-2 text-sm">
            <span className="w-12 shrink-0 font-[family-name:var(--font-mono)] text-xs text-text-lo">{timeLabel(r.started_at)}</span>
            <span className="min-w-0 flex-1 text-text-hi">{describe(r)}</span>
            <span className="text-xs text-text-lo">{who(r.created_by)}</span>
            <button type="button" className="text-xs text-text-lo underline hover:text-text-hi" disabled={busy} aria-label={`Remove ${describe(r)} at ${timeLabel(r.started_at)}`} onClick={() => void act(() => send("DELETE", `/api/family/baby-log/${r.id}`))}>
              Undo
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
