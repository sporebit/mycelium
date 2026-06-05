"use client";

import { useEffect, useState } from "react";
import { Mono } from "@/components/dashboard/Mono";

type SupplementLog = { id: string; supplement_id: string; taken_at: string };

type Supplement = {
  id: string;
  name: string;
  brand: string | null;
  dose: string;
  form: string;
  schedule: string | null;
  notes: string | null;
  active: boolean;
  today_logs: SupplementLog[];
};

const FORMS = ["capsule", "tablet", "powder", "liquid", "gummy", "spray"] as const;

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function SupplementsClient() {
  const [supplements, setSupplements] = useState<Supplement[] | null>(null);
  const [logging, setLogging] = useState<Set<string>>(new Set());
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/supplements")
      .then((r) => r.json())
      .then((j: { supplements?: Supplement[] }) => {
        if (!cancelled) setSupplements(j.supplements ?? []);
      })
      .catch(() => {
        if (!cancelled) setSupplements([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setError(null), 3000);
    return () => clearTimeout(id);
  }, [error]);

  async function markTaken(suppId: string) {
    if (logging.has(suppId)) return;
    setLogging((s) => new Set(s).add(suppId));
    try {
      const res = await fetch(`/api/supplements/${suppId}/log`, {
        method: "POST",
      });
      if (!res.ok) {
        setError("Failed to log dose");
        return;
      }
      const { log } = (await res.json()) as { log: SupplementLog };
      setSupplements(
        (prev) =>
          prev?.map((s) =>
            s.id === suppId
              ? { ...s, today_logs: [log, ...s.today_logs] }
              : s,
          ) ?? null,
      );
    } catch {
      setError("Network error");
    } finally {
      setLogging((s) => {
        const next = new Set(s);
        next.delete(suppId);
        return next;
      });
    }
  }

  async function undoLog(suppId: string, logId: string) {
    try {
      const res = await fetch(`/api/supplements/${suppId}/log/${logId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setError("Failed to undo");
        return;
      }
      setSupplements(
        (prev) =>
          prev?.map((s) =>
            s.id === suppId
              ? { ...s, today_logs: s.today_logs.filter((l) => l.id !== logId) }
              : s,
          ) ?? null,
      );
    } catch {
      setError("Network error");
    }
  }

  async function deactivate(suppId: string) {
    try {
      const res = await fetch(`/api/supplements/${suppId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: false }),
      });
      if (!res.ok) {
        setError("Failed to deactivate");
        return;
      }
      setSupplements((prev) => prev?.filter((s) => s.id !== suppId) ?? null);
    } catch {
      setError("Network error");
    }
  }

  async function addSupplement(form: {
    name: string;
    dose: string;
    brand: string;
    form: string;
    schedule: string;
  }) {
    try {
      const res = await fetch("/api/supplements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        setError("Failed to add");
        return;
      }
      const { supplement } = (await res.json()) as { supplement: Supplement };
      setSupplements((prev) =>
        prev ? [...prev, supplement].sort((a, b) => a.name.localeCompare(b.name)) : [supplement],
      );
      setShowAdd(false);
    } catch {
      setError("Network error");
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-[family-name:var(--font-display)] italic text-2xl text-text-0">
            Supplements
          </h1>
          <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
            Active supplements and daily dose tracking.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAdd((v) => !v)}
          className="px-3 py-1.5 rounded-md bg-accent/15 border border-accent/40 text-accent hover:bg-accent/25 text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] transition-colors shrink-0"
        >
          {showAdd ? "CANCEL" : "+ ADD"}
        </button>
      </header>

      {error && (
        <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-danger font-[family-name:var(--font-mono)]">
          ⚠ {error}
        </div>
      )}

      {showAdd && <AddForm onSubmit={addSupplement} />}

      {supplements === null ? (
        <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-6 text-center">
          Loading…
        </div>
      ) : supplements.length === 0 ? (
        <div className="rounded-md bg-ink-1 p-6 text-center text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
          No active supplements. Tap + ADD to get started.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {supplements.map((s) => (
            <SupplementRow
              key={s.id}
              supplement={s}
              isLogging={logging.has(s.id)}
              onMarkTaken={() => markTaken(s.id)}
              onUndoLog={(logId) => undoLog(s.id, logId)}
              onDeactivate={() => deactivate(s.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function SupplementRow({
  supplement: s,
  isLogging,
  onMarkTaken,
  onUndoLog,
  onDeactivate,
}: {
  supplement: Supplement;
  isLogging: boolean;
  onMarkTaken: () => void;
  onUndoLog: (logId: string) => void;
  onDeactivate: () => void;
}) {
  const takenCount = s.today_logs.length;

  return (
    <li className="rounded-md bg-ink-1 border border-ink-2 p-3 flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm text-ink-4 font-medium truncate">
              {s.name}
            </span>
            {s.brand && (
              <span className="text-[10px] text-ink-3 uppercase tracking-[0.12em] font-[family-name:var(--font-mono)] shrink-0">
                {s.brand}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <Mono className="text-[11px] text-ink-3">{s.dose}</Mono>
            <span className="text-[10px] text-ink-3 uppercase tracking-[0.12em] font-[family-name:var(--font-mono)]">
              {s.form}
            </span>
            {s.schedule && (
              <>
                <span className="text-ink-2">·</span>
                <span className="text-[10px] text-ink-3 italic font-[family-name:var(--font-display)]">
                  {s.schedule}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onMarkTaken}
            disabled={isLogging}
            className="px-3 py-1.5 rounded-md bg-ok/15 border border-ok/40 text-ok hover:bg-ok/25 disabled:opacity-40 disabled:cursor-not-allowed text-[11px] font-[family-name:var(--font-mono)] tracking-[0.12em] transition-colors"
          >
            {isLogging ? "…" : "TAKEN"}
          </button>
          <button
            type="button"
            onClick={onDeactivate}
            title="Deactivate supplement"
            className="p-1.5 rounded-md text-ink-3 hover:text-danger hover:bg-danger/10 transition-colors"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {takenCount > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <Mono className="text-[10px] text-ok/70">
            ✓ {takenCount}× today
          </Mono>
          {s.today_logs.map((log) => (
            <button
              key={log.id}
              type="button"
              onClick={() => onUndoLog(log.id)}
              title="Undo this dose"
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-ink-2/60 text-[10px] text-ink-3 hover:text-danger hover:bg-danger/10 font-[family-name:var(--font-mono)] transition-colors"
            >
              {relativeTime(log.taken_at)}
              <span className="text-[9px]">✕</span>
            </button>
          ))}
        </div>
      )}
    </li>
  );
}

function AddForm({
  onSubmit,
}: {
  onSubmit: (f: {
    name: string;
    dose: string;
    brand: string;
    form: string;
    schedule: string;
  }) => void;
}) {
  const [name, setName] = useState("");
  const [dose, setDose] = useState("");
  const [brand, setBrand] = useState("");
  const [form, setForm] = useState("capsule");
  const [schedule, setSchedule] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !dose.trim()) return;
    onSubmit({ name, dose, brand, form, schedule });
  }

  const inputClass =
    "w-full rounded-md bg-ink-0 border border-ink-2 px-3 py-2 text-sm text-ink-4 placeholder:text-ink-3/60 focus:outline-none focus:border-accent/60 font-[family-name:var(--font-display)]";
  const labelClass =
    "text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] mb-1 block";

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-md bg-ink-1 border border-ink-2 p-4 flex flex-col gap-3"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Vitamin D3"
            className={inputClass}
            required
          />
        </div>
        <div>
          <label className={labelClass}>Dose *</label>
          <input
            type="text"
            value={dose}
            onChange={(e) => setDose(e.target.value)}
            placeholder="4000 IU"
            className={inputClass}
            required
          />
        </div>
        <div>
          <label className={labelClass}>Brand</label>
          <input
            type="text"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            placeholder="Solgar"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Form</label>
          <select
            value={form}
            onChange={(e) => setForm(e.target.value)}
            className={inputClass}
          >
            {FORMS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className={labelClass}>Schedule</label>
        <input
          type="text"
          value={schedule}
          onChange={(e) => setSchedule(e.target.value)}
          placeholder="morning + evening"
          className={inputClass}
        />
      </div>
      <button
        type="submit"
        disabled={!name.trim() || !dose.trim()}
        className="self-start px-4 py-2 rounded-md bg-accent/15 border border-accent/40 text-accent hover:bg-accent/25 disabled:opacity-40 disabled:cursor-not-allowed text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] transition-colors"
      >
        ADD SUPPLEMENT
      </button>
    </form>
  );
}
