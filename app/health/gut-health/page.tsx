"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type GutEntry = {
  id: string;
  logged_at: string;
  bristol_type: number;
  time_of_day: string | null;
  felt_finished: boolean | null;
  wipe_type: string | null;
  discomfort: number | null;
  blood: boolean;
  urgent: boolean;
  notes: string | null;
};

const BRISTOL = [
  { type: 1, name: "Separate hard lumps", icon: "●●●", color: "#f59e0b" },
  { type: 2, name: "Lumpy sausage", icon: "▬●", color: "#f59e0b" },
  { type: 3, name: "Cracked sausage", icon: "▬≈", color: "#22c55e" },
  { type: 4, name: "Smooth sausage", icon: "▬▬", color: "#22c55e" },
  { type: 5, name: "Soft blobs", icon: "◉◉", color: "#3b82f6" },
  { type: 6, name: "Fluffy pieces", icon: "≋≋", color: "#3b82f6" },
  { type: 7, name: "Watery", icon: "〰", color: "#3b82f6" },
];

const BRISTOL_HEALTH: Record<number, string> = {
  1: "Severe constipation",
  2: "Mild constipation",
  3: "Normal",
  4: "Ideal",
  5: "Lacking fibre",
  6: "Mild diarrhoea",
  7: "Severe diarrhoea",
};

const TOD_LABELS: Record<string, string> = {
  morning: "Morning",
  midday: "Midday",
  afternoon: "Afternoon",
  evening: "Evening",
  night: "Night",
};

const WIPE_LABELS: Record<string, string> = {
  clean: "Clean",
  few_wipes: "Few wipes",
  many_wipes: "Many wipes",
  skid_marks: "Skid marks",
};

function bristolColor(type: number): string {
  if (type <= 2) return "#f59e0b";
  if (type <= 4) return "#22c55e";
  return "#3b82f6";
}

function discomfortColor(val: number): string {
  if (val <= 3) return "#22c55e";
  if (val <= 6) return "#f59e0b";
  return "#ef4444";
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

function dateKey(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

export default function GutHealthPage() {
  const [entries, setEntries] = useState<GutEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const [bristolType, setBristolType] = useState(4);
  const [timeOfDay, setTimeOfDay] = useState("morning");
  const [feltFinished, setFeltFinished] = useState<boolean | null>(null);
  const [wipeType, setWipeType] = useState("");
  const [discomfort, setDiscomfort] = useState(0);
  const [blood, setBlood] = useState(false);
  const [urgent, setUrgent] = useState(false);
  const [notes, setNotes] = useState("");

  const [bristolOpen, setBristolOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    try { return localStorage.getItem("gut_bristol_chart_open") === "true"; } catch { return false; }
  });

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/health/gut-health");
      const data = await res.json();
      setEntries(data.entries ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function resetForm() {
    setBristolType(4);
    setTimeOfDay("morning");
    setFeltFinished(null);
    setWipeType("");
    setDiscomfort(0);
    setBlood(false);
    setUrgent(false);
    setNotes("");
  }

  function startEdit(entry: GutEntry) {
    setEditingId(entry.id);
    setBristolType(entry.bristol_type);
    setTimeOfDay(entry.time_of_day || "morning");
    setFeltFinished(entry.felt_finished);
    setWipeType(entry.wipe_type || "");
    setDiscomfort(entry.discomfort ?? 0);
    setBlood(entry.blood);
    setUrgent(entry.urgent);
    setNotes(entry.notes || "");
    setShowModal(true);
  }

  function closeModal() {
    resetForm();
    setEditingId(null);
    setShowModal(false);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const payload = {
        bristol_type: bristolType,
        time_of_day: timeOfDay,
        felt_finished: feltFinished,
        wipe_type: wipeType || null,
        discomfort,
        blood,
        urgent,
        notes: notes.trim() || null,
      };

      const url = editingId
        ? `/api/health/gut-health/${editingId}`
        : "/api/health/gut-health";
      const method = editingId ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        closeModal();
        load();
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/health/gut-health/${id}`, { method: "DELETE" });
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  function requestDelete(id: string) {
    if (confirmDelete === id) {
      handleDelete(id);
      setConfirmDelete(null);
      return;
    }
    setConfirmDelete(id);
    setTimeout(() => {
      setConfirmDelete((prev) => (prev === id ? null : prev));
    }, 3000);
  }

  const overviewDots = useMemo(() => {
    const days: { date: string; avg: number | null }[] = [];
    const now = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dk = d.toISOString().slice(0, 10);
      const dayEntries = entries.filter((e) => dateKey(e.logged_at) === dk);
      const avg = dayEntries.length > 0
        ? dayEntries.reduce((s, e) => s + e.bristol_type, 0) / dayEntries.length
        : null;
      days.push({ date: dk, avg });
    }
    return days;
  }, [entries]);

  const grouped = useMemo(() => {
    const map = new Map<string, GutEntry[]>();
    for (const e of entries) {
      const dk = dateKey(e.logged_at);
      if (!map.has(dk)) map.set(dk, []);
      map.get(dk)!.push(e);
    }
    return Array.from(map.entries());
  }, [entries]);

  if (loading) {
    return (
      <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-20 text-center">
        Loading…
      </p>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg text-text-0 font-[family-name:var(--font-display)] italic">
          Gut Health
        </h1>
        <button
          onClick={() => setShowModal(true)}
          className="px-3 py-1.5 rounded-md bg-accent/15 border border-accent/40 text-accent text-[10px] font-[family-name:var(--font-mono)] tracking-[0.18em] hover:bg-accent/25 transition-colors"
        >
          LOG ENTRY
        </button>
      </div>

      {/* 30-day overview strip */}
      <div className="mb-6 p-4 rounded-xl border border-ink-2 bg-ink-1">
        <p className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.15em] mb-3">
          30-DAY OVERVIEW
        </p>
        <div className="flex items-center gap-1">
          {overviewDots.map((d) => (
            <div
              key={d.date}
              title={`${d.date}${d.avg !== null ? ` — avg type ${d.avg.toFixed(1)}` : ""}`}
              className="h-3 w-3 rounded-full shrink-0 transition-colors"
              style={{
                backgroundColor: d.avg !== null ? bristolColor(Math.round(d.avg)) : "var(--color-ink-2)",
                opacity: d.avg !== null ? 1 : 0.4,
              }}
            />
          ))}
        </div>
        <div className="flex items-center gap-4 mt-2 text-[9px] font-[family-name:var(--font-mono)] text-ink-3">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: "#f59e0b" }} /> Hard (1-2)</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: "#22c55e" }} /> Normal (3-4)</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: "#3b82f6" }} /> Loose (5-7)</span>
        </div>
      </div>

      {/* Entries grouped by date */}
      {entries.length === 0 ? (
        <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] text-center py-12">
          No entries yet. Log your first one.
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {grouped.map(([date, dayEntries]) => (
            <div key={date}>
              <p className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.15em] mb-2">
                {formatDate(dayEntries[0].logged_at).toUpperCase()}
              </p>
              <div className="flex flex-col gap-2">
                {dayEntries.map((e) => {
                  const b = BRISTOL[e.bristol_type - 1];
                  const isConfirming = confirmDelete === e.id;
                  return (
                    <div
                      key={e.id}
                      className="p-3 rounded-xl border border-ink-2 bg-ink-1 group"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <div
                            className="h-10 w-10 rounded-lg flex items-center justify-center text-lg shrink-0"
                            style={{ backgroundColor: `${b.color}20`, color: b.color }}
                          >
                            {b.icon}
                          </div>
                          <div>
                            <p className="text-sm text-ink-4 font-[family-name:var(--font-display)]">
                              Type {b.type}: {b.name}
                            </p>
                            <p className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)]">
                              {e.time_of_day ? TOD_LABELS[e.time_of_day] : ""}{e.time_of_day ? " · " : ""}{formatTime(e.logged_at)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {e.discomfort !== null && e.discomfort > 0 && (
                            <span
                              className="text-sm font-[family-name:var(--font-mono)] font-bold"
                              style={{ color: discomfortColor(e.discomfort) }}
                            >
                              Discomfort {e.discomfort}/10
                            </span>
                          )}
                          <button
                            onClick={() => startEdit(e)}
                            className="opacity-100 md:opacity-0 md:group-hover:opacity-100 text-ink-3 hover:text-accent text-xs transition-opacity"
                            title="Edit"
                          >
                            ✎
                          </button>
                          <button
                            onClick={() => requestDelete(e.id)}
                            className={`text-xs transition-all ${
                              isConfirming
                                ? "text-danger text-[10px] font-[family-name:var(--font-mono)]"
                                : "opacity-100 md:opacity-0 md:group-hover:opacity-100 text-ink-3 hover:text-danger"
                            }`}
                          >
                            {isConfirming ? "Tap again" : "✕"}
                          </button>
                        </div>
                      </div>

                      {/* Flags row */}
                      {(e.urgent || e.blood || e.felt_finished) && (
                        <div className="flex items-center gap-2 mt-2 text-[10px] font-[family-name:var(--font-mono)]">
                          {e.urgent && <span className="text-danger">{"🚨"} Urgent</span>}
                          {e.blood && <span className="text-danger">{"🩸"} Blood</span>}
                          {e.felt_finished && <span className="text-ok">{"✓"} Felt finished</span>}
                        </div>
                      )}

                      {/* Wipe type + notes */}
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        {e.wipe_type && (
                          <span className="px-2 py-0.5 rounded-full bg-ink-2 text-ink-3 text-[10px] font-[family-name:var(--font-mono)]">
                            {WIPE_LABELS[e.wipe_type] ?? e.wipe_type}
                          </span>
                        )}
                        {e.notes && (
                          <span className="text-xs text-ink-3 italic font-[family-name:var(--font-display)] truncate max-w-[300px]">
                            {e.notes}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Log entry modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-ink-0 border border-ink-2 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
            <h2 className="text-lg text-text-0 font-[family-name:var(--font-display)] italic mb-4">
              {editingId ? "Edit Entry" : "Log Entry"}
            </h2>

            {/* Bristol type selector */}
            <p className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.15em] mb-2">
              BRISTOL TYPE
            </p>
            <div className="grid grid-cols-7 gap-1 mb-2">
              {BRISTOL.map((b) => (
                <button
                  key={b.type}
                  onClick={() => setBristolType(b.type)}
                  className={`flex flex-col items-center gap-1 p-2 rounded-lg border transition-colors ${
                    bristolType === b.type
                      ? "border-accent bg-accent/10"
                      : "border-ink-2 hover:border-ink-3"
                  }`}
                >
                  <span className="text-lg" style={{ color: b.color }}>{b.icon}</span>
                  <span className="text-[9px] text-ink-3 font-[family-name:var(--font-mono)]">{b.type}</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-ink-4 font-[family-name:var(--font-display)] mb-2">
              {BRISTOL[bristolType - 1].name}
            </p>

            {/* Bristol chart reference */}
            <button
              onClick={() => {
                const next = !bristolOpen;
                setBristolOpen(next);
                try { localStorage.setItem("gut_bristol_chart_open", String(next)); } catch { /* noop */ }
              }}
              className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.1em] mb-2 hover:text-ink-4 transition-colors flex items-center gap-1"
            >
              {bristolOpen ? "▾" : "▸"} What do these mean?
            </button>
            {bristolOpen && (
              <div className="mb-4 rounded-lg border border-ink-2 bg-ink-1/50 p-3">
                {BRISTOL.map((b) => (
                  <div key={b.type} className="flex items-center gap-3 py-1">
                    <span className="text-base shrink-0 w-8 text-center" style={{ color: b.color }}>{b.icon}</span>
                    <span className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] shrink-0 w-3">{b.type}</span>
                    <span className="text-xs text-ink-4 font-[family-name:var(--font-display)] shrink-0">{b.name}</span>
                    <span className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)]">&mdash; {BRISTOL_HEALTH[b.type]}</span>
                  </div>
                ))}
              </div>
            )}
            {!bristolOpen && <div className="mb-2" />}

            {/* Time of day */}
            <p className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.15em] mb-2">
              TIME OF DAY
            </p>
            <div className="flex flex-wrap gap-1 mb-4">
              {Object.entries(TOD_LABELS).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setTimeOfDay(val)}
                  className={`px-3 py-1.5 rounded-md text-[10px] font-[family-name:var(--font-mono)] tracking-[0.1em] border transition-colors ${
                    timeOfDay === val
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-ink-2 text-ink-3 hover:border-ink-3"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Felt finished */}
            <p className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.15em] mb-2">
              FELT FINISHED?
            </p>
            <div className="flex gap-1 mb-4">
              {([
                [true, "Yes"],
                [false, "No"],
                [null, "Unsure"],
              ] as [boolean | null, string][]).map(([val, label]) => (
                <button
                  key={label}
                  onClick={() => setFeltFinished(val)}
                  className={`px-3 py-1.5 rounded-md text-[10px] font-[family-name:var(--font-mono)] tracking-[0.1em] border transition-colors ${
                    feltFinished === val
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-ink-2 text-ink-3 hover:border-ink-3"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Wipe type */}
            <p className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.15em] mb-2">
              HOW DID IT WIPE?
            </p>
            <div className="flex flex-wrap gap-1 mb-4">
              {Object.entries(WIPE_LABELS).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setWipeType(wipeType === val ? "" : val)}
                  className={`px-3 py-1.5 rounded-md text-[10px] font-[family-name:var(--font-mono)] tracking-[0.1em] border transition-colors ${
                    wipeType === val
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-ink-2 text-ink-3 hover:border-ink-3"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Discomfort slider */}
            <p className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.15em] mb-2">
              DISCOMFORT: <span style={{ color: discomfortColor(discomfort) }}>{discomfort}/10</span>
            </p>
            <input
              type="range"
              min={0}
              max={10}
              value={discomfort}
              onChange={(e) => setDiscomfort(Number(e.target.value))}
              className="w-full mb-4 accent-[var(--color-accent)]"
            />

            {/* Blood / Urgent toggles */}
            <div className="flex items-center gap-4 mb-4">
              <label className="flex items-center gap-2 text-xs text-ink-4 font-[family-name:var(--font-mono)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={blood}
                  onChange={(e) => setBlood(e.target.checked)}
                  className="accent-[var(--color-danger)]"
                />
                {"🩸"} Blood
              </label>
              <label className="flex items-center gap-2 text-xs text-ink-4 font-[family-name:var(--font-mono)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={urgent}
                  onChange={(e) => setUrgent(e.target.checked)}
                  className="accent-[var(--color-danger)]"
                />
                {"🚨"} Urgent
              </label>
            </div>

            {/* Notes */}
            <p className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.15em] mb-2">
              NOTES
            </p>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full bg-ink-0/40 border border-ink-2 rounded-md text-sm text-ink-4 px-3 py-2 outline-none focus:border-ink-3 placeholder:text-ink-3 resize-y mb-4"
              placeholder="Anything else to note…"
            />

            {/* Actions */}
            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={closeModal}
                className="px-3 py-1.5 rounded-md border border-ink-2 text-ink-3 hover:text-ink-4 hover:border-ink-3 text-[10px] font-[family-name:var(--font-mono)] tracking-[0.18em] transition-colors"
              >
                CANCEL
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-1.5 rounded-md bg-accent/15 border border-accent/40 text-accent text-[10px] font-[family-name:var(--font-mono)] tracking-[0.18em] hover:bg-accent/25 disabled:opacity-40 transition-colors"
              >
                {saving ? "SAVING…" : "SAVE"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
