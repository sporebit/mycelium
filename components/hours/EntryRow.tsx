"use client";

import { useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui";
import { entryState, fmtHm, parseDuration } from "@/lib/hours/calc";
import type { HoursEntry } from "@/lib/hours/types";
import { Field, INPUT_SM, StateDot, TicketLink } from "./kit";
import { useEntryMutations } from "./useEntryMutations";

/**
 * One Log row (spec §5, §7: Date, Time Spent, Description, Ticket, Logged —
 * no visible id, no status column). Click the row to edit it in place; the
 * Logged tick and the ticket link work without opening it. `showDate` is
 * for lists that are not grouped by day (Backlog, search results).
 */
export function EntryRow({ entry, baseUrl, showDate = false, startOpen = false }: { entry: HoursEntry; baseUrl: string; showDate?: boolean; startOpen?: boolean }) {
  const { patch } = useEntryMutations();
  const [editing, setEditing] = useState(startOpen);
  const state = entryState(entry);
  const pending = entry.id.startsWith("tmp-");

  if (editing) return <EntryEditor entry={entry} onClose={() => setEditing(false)} />;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => !pending && setEditing(true)}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !pending) {
          e.preventDefault();
          setEditing(true);
        }
      }}
      className={`group grid grid-cols-[auto_4.5rem_1fr_auto] sm:grid-cols-[auto_4.5rem_1fr_11rem_auto] items-center gap-x-3 gap-y-0.5 px-2 py-1.5 rounded-v2-md hover:bg-surface-1 cursor-pointer ${pending ? "opacity-60" : ""}`}
    >
      <StateDot state={state} />
      <span className={`font-[family-name:var(--font-mono)] tabular-nums text-sm text-right ${entry.minutes === null ? "text-text-lo" : "text-text-hi"}`}>
        {entry.minutes === null ? (entry.estimate_minutes !== null ? `~${fmtHm(entry.estimate_minutes)}` : "open") : fmtHm(entry.minutes)}
      </span>
      <span className="min-w-0 truncate text-sm text-text-hi">
        {showDate && entry.entry_date && <span className="text-text-lo mr-2 font-[family-name:var(--font-mono)] text-xs">{entry.entry_date}</span>}
        {entry.description || <span className="text-v2-error/80 italic">no description</span>}
      </span>
      <span className="hidden sm:block min-w-0 truncate text-sm">
        <TicketLink raw={entry.ticket_raw} baseUrl={baseUrl} />
      </span>
      <label
        className="flex items-center gap-1.5 text-[11px] text-text-lo select-none justify-self-end"
        onClick={(e) => e.stopPropagation()}
        title="Ticked when this time is also in Jira"
      >
        <input type="checkbox" checked={entry.logged} disabled={pending} onChange={(e) => void patch(entry.id, { logged: e.target.checked })} />
        <span className="hidden sm:inline">Logged</span>
      </label>
      <span className="sm:hidden col-start-3 col-span-2 text-xs">
        <TicketLink raw={entry.ticket_raw} baseUrl={baseUrl} />
      </span>
    </div>
  );
}

/** In-place editor: the same five fields plus Estimate, with Save, Cancel and Delete. */
export function EntryEditor({ entry, onClose }: { entry: HoursEntry; onClose: () => void }) {
  const { patch, remove } = useEntryMutations();
  const [date, setDate] = useState(entry.entry_date ?? "");
  const [time, setTime] = useState(entry.minutes === null ? "" : fmtHm(entry.minutes));
  const [estimate, setEstimate] = useState(entry.estimate_minutes === null ? "" : fmtHm(entry.estimate_minutes));
  const [description, setDescription] = useState(entry.description);
  const [ticket, setTicket] = useState(entry.ticket_raw);
  const [logged, setLogged] = useState(entry.logged);
  const [busy, setBusy] = useState<"save" | "delete" | null>(null);

  const minutes = time.trim() === "" ? null : parseDuration(time);
  const estimateMinutes = estimate.trim() === "" ? null : parseDuration(estimate);
  const timeBad = time.trim() !== "" && minutes === null;
  const estimateBad = estimate.trim() !== "" && estimateMinutes === null;
  const empty = minutes === null && description.trim() === "" && ticket.trim() === "";
  const canSave = busy === null && !timeBad && !estimateBad && !empty;

  const save = async () => {
    if (!canSave) return;
    setBusy("save");
    const ok = await patch(entry.id, {
      entry_date: date || null,
      minutes,
      estimate_minutes: estimateMinutes,
      description: description.trim(),
      ticket: ticket.trim(),
      logged,
    });
    setBusy(null);
    if (ok) onClose();
  };

  const del = async () => {
    if (!window.confirm("Delete this entry?")) return;
    setBusy("delete");
    const ok = await remove(entry.id);
    setBusy(null);
    if (ok) onClose();
  };

  const onKey = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void save();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div className="rounded-v2-md border border-glow-dim bg-surface-1 p-3 flex flex-col gap-2" onKeyDown={onKey}>
      <div className="grid grid-cols-2 sm:grid-cols-[9.5rem_6rem_6rem_1fr] gap-2">
        <Field label="Date">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={INPUT_SM} />
        </Field>
        <Field label="Time spent">
          <input
            autoFocus
            value={time}
            placeholder="open"
            inputMode="decimal"
            onChange={(e) => setTime(e.target.value)}
            className={`${INPUT_SM} font-[family-name:var(--font-mono)] ${timeBad ? "border-v2-error" : ""}`}
          />
        </Field>
        <Field label="Estimate">
          <input
            value={estimate}
            placeholder="—"
            inputMode="decimal"
            onChange={(e) => setEstimate(e.target.value)}
            className={`${INPUT_SM} font-[family-name:var(--font-mono)] ${estimateBad ? "border-v2-error" : ""}`}
          />
        </Field>
        <Field label="Description" className="col-span-2 sm:col-span-1">
          <input value={description} onChange={(e) => setDescription(e.target.value)} className={INPUT_SM} />
        </Field>
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
        <Field label="Ticket">
          <input value={ticket} placeholder="ABC-123 or URL" onChange={(e) => setTicket(e.target.value)} className={`${INPUT_SM} font-[family-name:var(--font-mono)]`} />
        </Field>
        <label className="flex items-center gap-1.5 text-xs text-text-mid pb-2 select-none">
          <input type="checkbox" checked={logged} onChange={(e) => setLogged(e.target.checked)} />
          Logged
        </label>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="danger" loading={busy === "delete"} disabled={busy !== null} onClick={() => void del()}>
          DELETE
        </Button>
        <span className="mr-auto text-[11px] text-text-lo">{empty ? "An entry needs a time, a description or a ticket." : "Enter saves · Esc cancels"}</span>
        <Button size="sm" disabled={busy !== null} onClick={onClose}>
          CANCEL
        </Button>
        <Button size="sm" variant="primary" loading={busy === "save"} disabled={!canSave} onClick={() => void save()}>
          SAVE
        </Button>
      </div>
    </div>
  );
}
