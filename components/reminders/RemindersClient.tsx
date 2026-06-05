"use client";

import { useCallback, useEffect, useState } from "react";

type Reminder = {
  id: string;
  user_id: string;
  message: string;
  due_at: string;
  recurrence: string | null;
  sent_at: string | null;
  cancelled: boolean;
  created_at: string;
};

function londonToUTC(dateStr: string, timeStr: string): string {
  const dtStr = `${dateStr}T${timeStr}:00`;
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/London",
    timeZoneName: "shortOffset",
  });
  const parts = fmt.formatToParts(new Date());
  const tzPart = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const m = tzPart.match(/GMT([+-]?\d+)?/);
  const offsetH = m?.[1] ? parseInt(m[1]) : 0;
  const d = new Date(dtStr + "Z");
  d.setUTCHours(d.getUTCHours() - offsetH);
  return d.toISOString();
}

const londonFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function formatLondon(iso: string): string {
  return londonFmt.format(new Date(iso));
}

function toLondonDateStr(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
  return parts;
}

function toLondonTimeStr(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
  return parts;
}

function nowLondonDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function nowLondonTime(): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

export function RemindersClient() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [msg, setMsg] = useState("");
  const [date, setDate] = useState(() => nowLondonDate());
  const [time, setTime] = useState(() => nowLondonTime());
  const [recurrence, setRecurrence] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editMsg, setEditMsg] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editTime, setEditTime] = useState("");
  const [editRecurrence, setEditRecurrence] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchReminders = useCallback(async () => {
    try {
      const res = await fetch("/api/reminders");
      if (!res.ok) throw new Error("fetch failed");
      const j = (await res.json()) as { reminders: Reminder[] };
      setReminders(j.reminders);
      setError(null);
    } catch {
      setError("Failed to load reminders");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReminders();
  }, [fetchReminders]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!msg.trim() || !date || !time) return;
    setSubmitting(true);
    try {
      const due_at = londonToUTC(date, time);
      const res = await fetch("/api/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: msg.trim(),
          due_at,
          recurrence: recurrence || null,
        }),
      });
      if (!res.ok) throw new Error("create failed");
      setMsg("");
      setDate(nowLondonDate());
      setTime(nowLondonTime());
      setRecurrence("");
      await fetchReminders();
    } catch {
      setError("Failed to create reminder");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    setReminders((prev) => prev.filter((r) => r.id !== id));
    try {
      const res = await fetch(`/api/reminders/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
    } catch {
      await fetchReminders();
    }
  }

  function startEdit(r: Reminder) {
    setEditingId(r.id);
    setEditMsg(r.message);
    setEditDate(toLondonDateStr(r.due_at));
    setEditTime(toLondonTimeStr(r.due_at));
    setEditRecurrence(r.recurrence ?? "");
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function handleSaveEdit(id: string) {
    if (!editMsg.trim() || !editDate || !editTime) return;
    setSaving(true);
    try {
      const due_at = londonToUTC(editDate, editTime);
      const res = await fetch(`/api/reminders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: editMsg.trim(),
          due_at,
          recurrence: editRecurrence || null,
        }),
      });
      if (!res.ok) throw new Error("update failed");
      setEditingId(null);
      await fetchReminders();
    } catch {
      setError("Failed to update reminder");
    } finally {
      setSaving(false);
    }
  }

  const now = Date.now();
  const cutoff = now - FOURTEEN_DAYS_MS;

  const upcoming = reminders.filter(
    (r) => !r.sent_at && !r.recurrence,
  );
  const recurring = reminders.filter(
    (r) => r.recurrence && !r.cancelled,
  );
  const fired = reminders
    .filter((r) => r.sent_at && new Date(r.sent_at).getTime() > cutoff)
    .sort(
      (a, b) =>
        new Date(b.sent_at!).getTime() - new Date(a.sent_at!).getTime(),
    );

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6">
      <h1 className="font-[family-name:var(--font-display)] italic text-2xl text-text-0">
        Reminders
      </h1>

      {/* Add form */}
      <form
        onSubmit={handleAdd}
        className="bg-ink-1 border border-ink-2 rounded-md p-4 flex flex-col gap-3"
      >
        <label className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] mb-1 block">
          New reminder
        </label>
        <input
          type="text"
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          placeholder="Reminder message"
          className="w-full rounded-md bg-ink-0 border border-ink-2 px-3 py-2 text-sm text-ink-4 placeholder:text-ink-3/60 focus:outline-none focus:border-accent/60 font-[family-name:var(--font-display)]"
        />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] mb-1 block">
              Date
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-md bg-ink-0 border border-ink-2 px-3 py-2 text-sm text-ink-4 focus:outline-none focus:border-accent/60 font-[family-name:var(--font-display)]"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] mb-1 block">
              Time
            </label>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full rounded-md bg-ink-0 border border-ink-2 px-3 py-2 text-sm text-ink-4 focus:outline-none focus:border-accent/60 font-[family-name:var(--font-display)]"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] mb-1 block">
              Repeat
            </label>
            <select
              value={recurrence}
              onChange={(e) => setRecurrence(e.target.value)}
              className="w-full rounded-md bg-ink-0 border border-ink-2 px-3 py-2 text-sm text-ink-4 focus:outline-none focus:border-accent/60 font-[family-name:var(--font-display)]"
            >
              <option value="">None</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={submitting || !msg.trim()}
              className="w-full bg-accent/15 border border-accent/40 text-accent hover:bg-accent/25 text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] uppercase px-4 py-2 rounded-md disabled:opacity-40"
            >
              {submitting ? "Adding..." : "Add"}
            </button>
          </div>
        </div>
      </form>

      {error && (
        <div className="text-sm text-danger font-[family-name:var(--font-mono)]">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
          Loading...
        </div>
      ) : (
        <>
          {/* Upcoming */}
          <Section title="Upcoming">
            {upcoming.length === 0 ? (
              <Empty>No upcoming reminders</Empty>
            ) : (
              upcoming.map((r) => (
                <ReminderRow
                  key={r.id}
                  reminder={r}
                  editing={editingId === r.id}
                  editMsg={editMsg}
                  editDate={editDate}
                  editTime={editTime}
                  editRecurrence={editRecurrence}
                  saving={saving}
                  onEditMsg={setEditMsg}
                  onEditDate={setEditDate}
                  onEditTime={setEditTime}
                  onEditRecurrence={setEditRecurrence}
                  onStartEdit={() => startEdit(r)}
                  onCancelEdit={cancelEdit}
                  onSaveEdit={() => handleSaveEdit(r.id)}
                  onDelete={() => handleDelete(r.id)}
                  timeLabel={formatLondon(r.due_at)}
                />
              ))
            )}
          </Section>

          {/* Recurring */}
          <Section title="Recurring">
            {recurring.length === 0 ? (
              <Empty>No recurring reminders</Empty>
            ) : (
              recurring.map((r) => (
                <ReminderRow
                  key={r.id}
                  reminder={r}
                  editing={editingId === r.id}
                  editMsg={editMsg}
                  editDate={editDate}
                  editTime={editTime}
                  editRecurrence={editRecurrence}
                  saving={saving}
                  onEditMsg={setEditMsg}
                  onEditDate={setEditDate}
                  onEditTime={setEditTime}
                  onEditRecurrence={setEditRecurrence}
                  onStartEdit={() => startEdit(r)}
                  onCancelEdit={cancelEdit}
                  onSaveEdit={() => handleSaveEdit(r.id)}
                  onDelete={() => handleDelete(r.id)}
                  timeLabel={formatLondon(r.due_at)}
                />
              ))
            )}
          </Section>

          {/* Recently fired */}
          <Section title="Recently fired">
            {fired.length === 0 ? (
              <Empty>No recently fired reminders</Empty>
            ) : (
              fired.map((r) => (
                <ReminderRow
                  key={r.id}
                  reminder={r}
                  editing={editingId === r.id}
                  editMsg={editMsg}
                  editDate={editDate}
                  editTime={editTime}
                  editRecurrence={editRecurrence}
                  saving={saving}
                  onEditMsg={setEditMsg}
                  onEditDate={setEditDate}
                  onEditTime={setEditTime}
                  onEditRecurrence={setEditRecurrence}
                  onStartEdit={() => startEdit(r)}
                  onCancelEdit={cancelEdit}
                  onSaveEdit={() => handleSaveEdit(r.id)}
                  onDelete={() => handleDelete(r.id)}
                  timeLabel={
                    r.sent_at
                      ? `Fired ${formatLondon(r.sent_at)}`
                      : formatLondon(r.due_at)
                  }
                />
              ))
            )}
          </Section>
        </>
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] mb-2">
        {title}
      </h2>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
      {children}
    </p>
  );
}

function ReminderRow({
  reminder,
  editing,
  editMsg,
  editDate,
  editTime,
  editRecurrence,
  saving,
  onEditMsg,
  onEditDate,
  onEditTime,
  onEditRecurrence,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  timeLabel,
}: {
  reminder: Reminder;
  editing: boolean;
  editMsg: string;
  editDate: string;
  editTime: string;
  editRecurrence: string;
  saving: boolean;
  onEditMsg: (v: string) => void;
  onEditDate: (v: string) => void;
  onEditTime: (v: string) => void;
  onEditRecurrence: (v: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onDelete: () => void;
  timeLabel: string;
}) {
  if (editing) {
    return (
      <div className="bg-ink-1 border border-ink-2 rounded-md p-3 flex flex-col gap-2">
        <input
          type="text"
          value={editMsg}
          onChange={(e) => onEditMsg(e.target.value)}
          className="w-full rounded-md bg-ink-0 border border-ink-2 px-3 py-2 text-sm text-ink-4 placeholder:text-ink-3/60 focus:outline-none focus:border-accent/60 font-[family-name:var(--font-display)]"
        />
        <div className="grid grid-cols-3 gap-2">
          <input
            type="date"
            value={editDate}
            onChange={(e) => onEditDate(e.target.value)}
            className="w-full rounded-md bg-ink-0 border border-ink-2 px-3 py-2 text-sm text-ink-4 focus:outline-none focus:border-accent/60 font-[family-name:var(--font-display)]"
          />
          <input
            type="time"
            value={editTime}
            onChange={(e) => onEditTime(e.target.value)}
            className="w-full rounded-md bg-ink-0 border border-ink-2 px-3 py-2 text-sm text-ink-4 focus:outline-none focus:border-accent/60 font-[family-name:var(--font-display)]"
          />
          <select
            value={editRecurrence}
            onChange={(e) => onEditRecurrence(e.target.value)}
            className="w-full rounded-md bg-ink-0 border border-ink-2 px-3 py-2 text-sm text-ink-4 focus:outline-none focus:border-accent/60 font-[family-name:var(--font-display)]"
          >
            <option value="">None</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onCancelEdit}
            className="text-ink-3 hover:text-ink-4 text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] uppercase px-2 py-1 rounded-md"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSaveEdit}
            disabled={saving}
            className="bg-accent/15 border border-accent/40 text-accent hover:bg-accent/25 text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] uppercase px-4 py-2 rounded-md disabled:opacity-40"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-ink-1 border border-ink-2 rounded-md p-3 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="text-sm text-text-0 truncate">{reminder.message}</div>
        <div className="flex items-center gap-2 mt-1">
          <span className="font-[family-name:var(--font-mono)] tabular-nums text-ink-4 text-[11px]">
            {timeLabel}
          </span>
          {reminder.recurrence && (
            <span className="text-[10px] uppercase tracking-[0.15em] font-[family-name:var(--font-mono)] px-1.5 py-0.5 rounded-md border border-accent/30 bg-accent/10 text-accent">
              {reminder.recurrence}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={onStartEdit}
          className="text-ink-3 hover:text-ink-4 text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] uppercase px-2 py-1 rounded-md"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="text-danger hover:bg-danger/10 text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] uppercase px-2 py-1 rounded-md"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
