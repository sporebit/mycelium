"use client";
// DRAFT: No trigger-likelihood scoring. Separate mental-clarity surface planned.

import { useState } from "react";

type BristolType = 1 | 2 | 3 | 4 | 5 | 6 | 7;

type GutEntry = {
  id: string;
  bristol: BristolType;
  note: string;
  timestamp: string;
};

const BRISTOL_LABELS: Record<BristolType, string> = {
  1: "Hard lumps",
  2: "Lumpy sausage",
  3: "Cracked sausage",
  4: "Smooth snake",
  5: "Soft blobs",
  6: "Mushy, fluffy",
  7: "Watery, liquid",
};

const SAMPLE_ENTRIES: GutEntry[] = [
  { id: "g1", bristol: 4, note: "Normal, after morning coffee", timestamp: "2026-06-05T08:30:00" },
  { id: "g2", bristol: 3, note: "", timestamp: "2026-06-04T07:45:00" },
  { id: "g3", bristol: 5, note: "Slight discomfort after curry last night", timestamp: "2026-06-03T09:10:00" },
  { id: "g4", bristol: 4, note: "Good, hydrated well yesterday", timestamp: "2026-06-02T08:00:00" },
  { id: "g5", bristol: 6, note: "Stomach upset, possible dairy reaction", timestamp: "2026-06-01T10:20:00" },
];

const inputClass =
  "w-full rounded-md bg-ink-0 border border-ink-2 px-3 py-2 text-sm text-ink-4 placeholder:text-ink-3/60 focus:outline-none focus:border-accent/60 font-[family-name:var(--font-display)]";
const labelClass =
  "text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] mb-1 block";

function formatTimestamp(ts: string): string {
  try {
    return new Date(ts).toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return ts;
  }
}

function bristolColor(b: BristolType): string {
  if (b <= 2) return "border-warn/40 text-warn bg-warn/10";
  if (b <= 5) return "border-ok/40 text-ok bg-ok/10";
  return "border-warn/40 text-warn bg-warn/10";
}

export function GutHealthClient() {
  const [entries, setEntries] = useState<GutEntry[]>(SAMPLE_ENTRIES);
  const [selectedBristol, setSelectedBristol] = useState<BristolType | null>(null);
  const [note, setNote] = useState("");

  function handleLog() {
    if (!selectedBristol) return;
    const entry: GutEntry = {
      id: `g${Date.now()}`,
      bristol: selectedBristol,
      note,
      timestamp: new Date().toISOString(),
    };
    setEntries((prev) => [entry, ...prev]);
    setSelectedBristol(null);
    setNote("");
  }

  return (
    <div className="flex flex-col gap-6 max-w-[700px]">
      <header>
        <h1 className="font-[family-name:var(--font-display)] italic text-2xl text-text-0">
          Gut Health
        </h1>
        <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] mt-1">
          Daily stool and stomach log.
        </p>
      </header>

      {/* Log form */}
      <section className="bg-ink-1 border border-ink-2 rounded-2xl p-4 flex flex-col gap-4">
        <h2 className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
          New Entry
        </h2>

        <div>
          <label className={labelClass}>Bristol Stool Scale</label>
          <div className="flex gap-1 flex-wrap">
            {([1, 2, 3, 4, 5, 6, 7] as BristolType[]).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setSelectedBristol(n)}
                title={BRISTOL_LABELS[n]}
                className={`w-10 h-10 rounded-md text-sm font-[family-name:var(--font-mono)] tabular-nums border transition-colors ${
                  selectedBristol === n
                    ? "bg-accent/15 border-accent/50 text-accent"
                    : "bg-ink-0 border-ink-2 text-ink-3 hover:text-ink-4 hover:border-ink-3"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          {selectedBristol && (
            <span className="text-xs text-ink-3 italic font-[family-name:var(--font-display)] mt-1 block">
              Type {selectedBristol}: {BRISTOL_LABELS[selectedBristol]}
            </span>
          )}
        </div>

        <div>
          <label className={labelClass}>Stomach Feel / Notes</label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Any discomfort, triggers, etc."
            className={inputClass}
          />
        </div>

        <button
          type="button"
          onClick={handleLog}
          disabled={!selectedBristol}
          className="self-start bg-accent/15 border border-accent/40 text-accent hover:bg-accent/25 disabled:opacity-40 disabled:cursor-not-allowed text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] uppercase px-4 py-2 rounded-md transition-colors"
        >
          Log Entry
        </button>
      </section>

      {/* Timeline */}
      <section>
        <h2 className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] mb-3">
          Timeline
        </h2>
        {entries.length === 0 ? (
          <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-4 text-center">
            No entries yet.
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {entries.map((e) => (
              <li
                key={e.id}
                className="bg-ink-1 border border-ink-2 rounded-md p-3 flex items-start gap-3"
              >
                <span
                  className={`text-[10px] uppercase tracking-[0.15em] font-[family-name:var(--font-mono)] px-1.5 py-0.5 rounded-md border shrink-0 ${bristolColor(e.bristol)}`}
                >
                  Type {e.bristol}
                </span>
                <div className="flex-1 min-w-0">
                  {e.note && (
                    <p className="text-sm text-ink-4">{e.note}</p>
                  )}
                  <span className="font-[family-name:var(--font-mono)] tabular-nums text-[10px] text-ink-3 mt-0.5 block">
                    {formatTimestamp(e.timestamp)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
