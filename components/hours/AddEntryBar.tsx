"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui";
import { parseDuration } from "@/lib/hours/calc";
import { INPUT_SM } from "./kit";
import { useEntryMutations } from "./useEntryMutations";

/**
 * Fast add (spec §5: "speed of entry matters more than anything else"):
 * one line on a wide screen, a 2×2 grid on the phone. Enter in any field
 * adds. The date stays for the next entry; everything else clears and the
 * cursor returns to Time. `defaultDate` follows the spec: the date of the
 * last entry made, else today. Leave Time empty to add an open backlog item.
 */
export function AddEntryBar({ defaultDate, catchAll }: { defaultDate: string; catchAll: string[] }) {
  const { add } = useEntryMutations();
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState("");
  const [description, setDescription] = useState("");
  const [ticket, setTicket] = useState("");
  const [logged, setLogged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const touched = useRef(false);
  const timeRef = useRef<HTMLInputElement>(null);

  // Follow the default until the person picks a date themselves.
  useEffect(() => {
    if (!touched.current) setDate(defaultDate);
  }, [defaultDate]);

  const minutes = time.trim() === "" ? null : parseDuration(time);
  const timeBad = time.trim() !== "" && minutes === null;
  const canAdd = !busy && !timeBad && (minutes !== null || description.trim() !== "" || ticket.trim() !== "");

  const submit = async () => {
    if (!canAdd) return;
    setBusy(true);
    setErr(null);
    const ok = await add({ entry_date: date || null, minutes, description: description.trim(), ticket: ticket.trim(), logged });
    setBusy(false);
    if (!ok) {
      setErr("Not saved. Check the fields and try again.");
      return;
    }
    setTime("");
    setDescription("");
    setTicket("");
    setLogged(false);
    timeRef.current?.focus();
  };

  const onKey = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void submit();
    }
  };

  return (
    <div className="rounded-v2-lg border border-dashed border-hairline-strong bg-surface-1 p-3 flex flex-col gap-2">
      <div className="grid grid-cols-2 sm:grid-cols-[9.5rem_6rem_1fr_11rem_auto] gap-2 items-center">
        <input
          aria-label="Date"
          type="date"
          value={date}
          onChange={(e) => {
            touched.current = true;
            setDate(e.target.value);
          }}
          onKeyDown={onKey}
          className={INPUT_SM}
        />
        <input
          ref={timeRef}
          aria-label="Time spent"
          placeholder="0:45"
          inputMode="decimal"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          onKeyDown={onKey}
          className={`${INPUT_SM} font-[family-name:var(--font-mono)] ${timeBad ? "border-v2-error" : ""}`}
        />
        <input
          aria-label="Description"
          placeholder="What you did"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={onKey}
          className={`${INPUT_SM} col-span-2 sm:col-span-1`}
          autoComplete="off"
        />
        <input
          aria-label="Ticket"
          placeholder="ABC-123 or URL"
          list="hours-catch-all"
          value={ticket}
          onChange={(e) => setTicket(e.target.value)}
          onKeyDown={onKey}
          className={`${INPUT_SM} font-[family-name:var(--font-mono)]`}
          autoComplete="off"
        />
        <div className="flex items-center gap-2 justify-end">
          <label className="flex items-center gap-1.5 text-xs text-text-mid whitespace-nowrap select-none">
            <input type="checkbox" checked={logged} onChange={(e) => setLogged(e.target.checked)} onKeyDown={onKey} />
            Logged
          </label>
          <Button size="sm" variant="primary" disabled={!canAdd} loading={busy} onClick={() => void submit()}>
            ADD
          </Button>
        </div>
      </div>
      {catchAll.length > 0 && (
        <datalist id="hours-catch-all">
          {catchAll.map((k) => (
            <option key={k} value={k} />
          ))}
        </datalist>
      )}
      <div className="flex items-baseline justify-between gap-3 text-[11px] text-text-lo">
        <span>{timeBad ? <span className="text-v2-error">Time: 0:45, 45, 1.5h or 1h 30m, up to 24:00.</span> : "Enter adds. Leave Time empty for an open backlog item."}</span>
        {err && <span className="text-v2-error">{err}</span>}
      </div>
    </div>
  );
}
