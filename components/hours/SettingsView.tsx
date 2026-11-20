"use client";

import Link from "next/link";
import { useState } from "react";
import { mutate as globalMutate } from "swr";
import { Button, Label } from "@/components/ui";
import { apiWrite, jsonBody, reportApiError } from "@/lib/data/apiWrite";
import { fmtHm, reviewDate, tradeOffTable } from "@/lib/hours/calc";
import { ABSENCE_TYPES, type AbsenceType, type HoursAbsence, type HoursBankHoliday, type HoursSettings } from "@/lib/hours/types";
import { ImportCard } from "./ImportCard";
import { Card, Field, INPUT, INPUT_SM, dateLabel } from "./kit";
import { HOURS_BASE } from "./HoursTabs";
import { HOURS_BUNDLE_KEY, useHoursBundle } from "./useHours";

/**
 * Settings (spec §5): targets and the checkpoint (with the trade-off table),
 * absences, bank holidays (gov.uk refresh), the ticket base URL and
 * catch-all tickets, the Friday block-out text, export and import. Old
 * weeks are reached through the Log's week picker.
 */
export function SettingsView() {
  const { bundle, index, isLoading, mutate } = useHoursBundle();
  if (isLoading || !index || !bundle) return <div className="text-sm text-text-lo">Loading…</div>;
  const refresh = () => Promise.all([mutate(), globalMutate(HOURS_BUNDLE_KEY)]);
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-text-hi">Settings</h1>
      <TargetsCard settings={bundle.settings} onSaved={refresh} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <AbsencesCard absences={bundle.absences} stdDay={index.settings.stdDay} onChanged={refresh} />
        <HolidaysCard holidays={bundle.bankHolidays} onChanged={refresh} />
      </div>
      <TicketsCard settings={bundle.settings} onSaved={refresh} />
      <BlockOutCard settings={bundle.settings} onSaved={refresh} />
      <ExportCard />
      <ImportCard />
      <p className="text-xs text-text-lo">
        Old weeks: open the <Link href={`${HOURS_BASE}/log`} className="text-glow hover:underline">Log</Link> and pick “Week of…”. The rules are on the{" "}
        <Link href={`${HOURS_BASE}/rules`} className="text-glow hover:underline">Rules</Link> page.
      </p>
    </div>
  );
}

async function patchSettings(body: Record<string, unknown>): Promise<boolean> {
  try {
    await apiWrite("/api/hours/settings", { method: "PATCH", ...jsonBody(body) });
    return true;
  } catch (e) {
    reportApiError(e, "Settings not saved");
    return false;
  }
}

function TargetsCard({ settings, onSaved }: { settings: HoursSettings | null; onSaved: () => Promise<unknown> }) {
  const [target, setTarget] = useState(fmtHm(settings?.contracted_minutes_per_week ?? 2250));
  const [stdDay, setStdDay] = useState(fmtHm(settings?.standard_day_minutes ?? 450));
  const [threshold, setThreshold] = useState(fmtHm(settings?.checkpoint_threshold_minutes ?? 1500));
  const [label, setLabel] = useState(settings?.checkpoint_label ?? "Wednesday 13:00");
  const [start, setStart] = useState(settings?.tracking_start ?? "");
  const [weeks, setWeeks] = useState(String(settings?.review_length_weeks ?? 6));
  const [wedBefore, setWedBefore] = useState(fmtHm(settings?.wed_minutes_before_1300 ?? 210));
  const [wedAfter, setWedAfter] = useState(fmtHm(settings?.wed_minutes_after_1300 ?? 300));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setBusy(true);
    const ok = await patchSettings({
      contracted_minutes_per_week: target,
      standard_day_minutes: stdDay,
      checkpoint_threshold_minutes: threshold,
      checkpoint_label: label,
      tracking_start: start,
      review_length_weeks: Number(weeks),
      wed_minutes_before_1300: wedBefore,
      wed_minutes_after_1300: wedAfter,
    });
    if (ok) await onSaved();
    setBusy(false);
    setSaved(ok);
  };

  const resolved = {
    target: minutesOrZero(target, 2250),
    stdDay: minutesOrZero(stdDay, 450),
    threshold: minutesOrZero(threshold, 1500),
    checkpointLabel: label,
    trackingStart: start || "2026-01-05",
    reviewWeeks: Number(weeks) || 6,
    wedBefore: minutesOrZero(wedBefore, 210),
    wedAfter: minutesOrZero(wedAfter, 300),
    ticketBaseUrl: "",
  };
  const rows = tradeOffTable(resolved, [1200, 1350, resolved.threshold].filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b));

  return (
    <Card title="Targets and checkpoint" aside={start ? `review ${dateLabel(reviewDate(resolved), true)}` : undefined}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Field label="Weekly target (Mon–Thu)">
          <input value={target} onChange={(e) => setTarget(e.target.value)} className={`${INPUT_SM} font-[family-name:var(--font-mono)]`} />
        </Field>
        <Field label="Standard day (credit)">
          <input value={stdDay} onChange={(e) => setStdDay(e.target.value)} className={`${INPUT_SM} font-[family-name:var(--font-mono)]`} />
        </Field>
        <Field label="Checkpoint threshold">
          <input value={threshold} onChange={(e) => setThreshold(e.target.value)} className={`${INPUT_SM} font-[family-name:var(--font-mono)]`} />
        </Field>
        <Field label="Checkpoint label">
          <input value={label} onChange={(e) => setLabel(e.target.value)} className={INPUT_SM} />
        </Field>
        <Field label="Tracking start">
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={INPUT_SM} />
        </Field>
        <Field label="Review after (weeks)">
          <input type="number" min={1} max={104} value={weeks} onChange={(e) => setWeeks(e.target.value)} className={`${INPUT_SM} font-[family-name:var(--font-mono)]`} />
        </Field>
        <Field label="Wed before 13:00 (assumed)">
          <input value={wedBefore} onChange={(e) => setWedBefore(e.target.value)} className={`${INPUT_SM} font-[family-name:var(--font-mono)]`} />
        </Field>
        <Field label="Wed after 13:00 (assumed)">
          <input value={wedAfter} onChange={(e) => setWedAfter(e.target.value)} className={`${INPUT_SM} font-[family-name:var(--font-mono)]`} />
        </Field>
      </div>
      <div className="flex items-center gap-3">
        <Button size="sm" variant="primary" loading={busy} onClick={() => void save()}>
          SAVE
        </Button>
        {saved && <span className="text-xs text-ok">Saved.</span>}
        <span className="text-xs text-text-lo">Durations as h:mm. Surplus is lost; nothing here stores a figure.</span>
      </div>
      <div>
        <Label>Checkpoint trade-off — what each threshold asks of Mon, Tue and Thu, given the Wednesday assumptions</Label>
        <table className="mt-1 text-sm tabular-nums font-[family-name:var(--font-mono)]">
          <thead>
            <tr className="text-[11px] uppercase tracking-[0.08em] text-text-lo">
              <th className="px-2 py-1 text-left">Threshold</th>
              <th className="px-2 py-1 text-right">Mon</th>
              <th className="px-2 py-1 text-right">Tue</th>
              <th className="px-2 py-1 text-right">Wed</th>
              <th className="px-2 py-1 text-right">Thu</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.threshold} className={r.threshold === resolved.threshold ? "text-text-hi" : "text-text-mid"}>
                <td className="px-2 py-1 text-left">{fmtHm(r.threshold)}</td>
                <td className="px-2 py-1 text-right">{fmtHm(r.mon)}</td>
                <td className="px-2 py-1 text-right">{fmtHm(r.tue)}</td>
                <td className="px-2 py-1 text-right">{fmtHm(r.wed)}</td>
                <td className={`px-2 py-1 text-right ${r.thu < 0 ? "text-v2-error" : ""}`}>{fmtHm(r.thu)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function minutesOrZero(text: string, fallback: number): number {
  const m = text.trim().match(/^(\d{1,4}):(\d{1,2})$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  const n = Number(text.trim());
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function AbsencesCard({ absences, stdDay, onChanged }: { absences: HoursAbsence[]; stdDay: number; onChanged: () => Promise<unknown> }) {
  const [date, setDate] = useState("");
  const [type, setType] = useState<AbsenceType>("Annual leave");
  const [minutes, setMinutes] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const sorted = absences.slice().sort((a, b) => b.absence_date.localeCompare(a.absence_date));

  const add = async () => {
    if (!date) return;
    setBusy(true);
    try {
      await apiWrite("/api/hours/absences", { method: "POST", ...jsonBody({ absence_date: date, type, minutes: minutes || undefined, note }) });
      setDate("");
      setMinutes("");
      setNote("");
      await onChanged();
    } catch (e) {
      reportApiError(e, "Absence not saved");
    } finally {
      setBusy(false);
    }
  };
  const del = async (a: HoursAbsence) => {
    if (!window.confirm(`Remove the ${a.type.toLowerCase()} on ${a.absence_date}?`)) return;
    try {
      await apiWrite(`/api/hours/absences/${a.id}`, { method: "DELETE" });
      await onChanged();
    } catch (e) {
      reportApiError(e, "Could not remove the absence");
    }
  };

  return (
    <Card title="Absences" aside={`credit a standard day (${fmtHm(stdDay)}) unless minutes are given`}>
      <div className="grid grid-cols-2 gap-2">
        <input aria-label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={INPUT_SM} />
        <select aria-label="Type" value={type} onChange={(e) => setType(e.target.value as AbsenceType)} className={INPUT_SM}>
          {ABSENCE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <input aria-label="Minutes" placeholder={`${fmtHm(stdDay)} (default)`} value={minutes} onChange={(e) => setMinutes(e.target.value)} className={`${INPUT_SM} font-[family-name:var(--font-mono)]`} />
        <div className="flex gap-2">
          <input aria-label="Note" placeholder="note" value={note} onChange={(e) => setNote(e.target.value)} className={INPUT_SM} />
          <Button size="sm" variant="primary" disabled={!date} loading={busy} onClick={() => void add()}>
            ADD
          </Button>
        </div>
      </div>
      {sorted.length === 0 ? (
        <div className="text-xs text-text-lo">None recorded.</div>
      ) : (
        <ul className="flex flex-col divide-y divide-hairline text-sm max-h-64 overflow-y-auto">
          {sorted.map((a) => (
            <li key={a.id} className="flex items-center gap-3 py-1.5">
              <span className="font-[family-name:var(--font-mono)] text-text-hi">{dateLabel(a.absence_date, true)}</span>
              <span className="text-text-mid">{a.type}</span>
              <span className="font-[family-name:var(--font-mono)] text-text-mid">{fmtHm(a.minutes)}</span>
              {a.note && <span className="text-xs text-text-lo truncate">{a.note}</span>}
              <button type="button" onClick={() => void del(a)} className="ml-auto text-xs text-text-lo hover:text-v2-error">
                remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function HolidaysCard({ holidays, onChanged }: { holidays: HoursBankHoliday[]; onChanged: () => Promise<unknown> }) {
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<"add" | "refresh" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const sorted = holidays.slice().sort((a, b) => b.holiday_date.localeCompare(a.holiday_date));

  const add = async () => {
    if (!date) return;
    setBusy("add");
    try {
      await apiWrite("/api/hours/bank-holidays", { method: "POST", ...jsonBody({ holiday_date: date, name }) });
      setDate("");
      setName("");
      await onChanged();
    } catch (e) {
      reportApiError(e, "Bank holiday not saved");
    } finally {
      setBusy(null);
    }
  };
  const refresh = async () => {
    setBusy("refresh");
    setMsg(null);
    try {
      const r = await apiWrite<{ added: number; total: number }>("/api/hours/bank-holidays/refresh", { method: "POST" });
      setMsg(r.added === 0 ? "Already up to date with gov.uk." : `Added ${r.added} from gov.uk.`);
      await onChanged();
    } catch (e) {
      reportApiError(e, "gov.uk refresh failed");
    } finally {
      setBusy(null);
    }
  };
  const del = async (h: HoursBankHoliday) => {
    if (!window.confirm(`Remove ${h.name || h.holiday_date}?`)) return;
    try {
      await apiWrite(`/api/hours/bank-holidays/${h.id}`, { method: "DELETE" });
      await onChanged();
    } catch (e) {
      reportApiError(e, "Could not remove the bank holiday");
    }
  };

  return (
    <Card
      title="Bank holidays"
      aside={
        <Button size="sm" loading={busy === "refresh"} disabled={busy !== null} onClick={() => void refresh()}>
          REFRESH FROM GOV.UK
        </Button>
      }
    >
      <div className="flex gap-2">
        <input aria-label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${INPUT_SM} w-40`} />
        <input aria-label="Name" placeholder="name" value={name} onChange={(e) => setName(e.target.value)} className={INPUT_SM} />
        <Button size="sm" variant="primary" disabled={!date} loading={busy === "add"} onClick={() => void add()}>
          ADD
        </Button>
      </div>
      {msg && <div className="text-xs text-text-mid">{msg}</div>}
      <ul className="flex flex-col divide-y divide-hairline text-sm max-h-64 overflow-y-auto">
        {sorted.map((h) => (
          <li key={h.id} className="flex items-center gap-3 py-1.5">
            <span className="font-[family-name:var(--font-mono)] text-text-hi">{dateLabel(h.holiday_date, true)}</span>
            <span className="text-text-mid truncate">{h.name}</span>
            <button type="button" onClick={() => void del(h)} className="ml-auto text-xs text-text-lo hover:text-v2-error">
              remove
            </button>
          </li>
        ))}
      </ul>
      <div className="text-[11px] text-text-lo">England and Wales. Each credits a standard day.</div>
    </Card>
  );
}

function TicketsCard({ settings, onSaved }: { settings: HoursSettings | null; onSaved: () => Promise<unknown> }) {
  const [base, setBase] = useState(settings?.ticket_base_url ?? "");
  const [catchAll, setCatchAll] = useState((settings?.catch_all_tickets ?? []).map((t) => `${t.key}${t.purpose ? ` — ${t.purpose}` : ""}`).join("\n"));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const save = async () => {
    setBusy(true);
    const list = catchAll
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [key, ...rest] = l.split(/\s+[—–-]\s+/);
        return { key: key.trim(), purpose: rest.join(" — ").trim() };
      });
    const ok = await patchSettings({ ticket_base_url: base, catch_all_tickets: list });
    if (ok) await onSaved();
    setBusy(false);
    setSaved(ok);
  };
  return (
    <Card title="Tickets" aside="keys link to base URL + key; a pasted URL is kept as typed (D3)">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Ticket base URL">
          <input value={base} onChange={(e) => setBase(e.target.value)} placeholder="https://yourcompany.atlassian.net/browse" className={`${INPUT} font-[family-name:var(--font-mono)]`} />
        </Field>
        <Field label="Catch-all tickets (one per line: KEY — purpose)">
          <textarea value={catchAll} onChange={(e) => setCatchAll(e.target.value)} rows={3} className={`${INPUT} font-[family-name:var(--font-mono)]`} />
        </Field>
      </div>
      <div className="flex items-center gap-3">
        <Button size="sm" variant="primary" loading={busy} onClick={() => void save()}>
          SAVE
        </Button>
        {saved && <span className="text-xs text-ok">Saved.</span>}
        <span className="text-xs text-text-lo">Catch-all keys are offered as suggestions in the Log&apos;s Ticket field.</span>
      </div>
    </Card>
  );
}

function BlockOutCard({ settings, onSaved }: { settings: HoursSettings | null; onSaved: () => Promise<unknown> }) {
  const [to, setTo] = useState((settings?.block_out_recipients ?? []).join("\n"));
  const [subject, setSubject] = useState(settings?.block_out_subject_template ?? "");
  const [body, setBody] = useState((settings?.block_out_body_lines ?? []).join("\n"));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const save = async () => {
    setBusy(true);
    const ok = await patchSettings({ block_out_recipients: to, block_out_subject_template: subject, block_out_body_lines: body });
    if (ok) await onSaved();
    setBusy(false);
    setSaved(ok);
  };
  return (
    <Card title="Friday block-out" aside="opened from the Dashboard as an email draft and a calendar file; nothing is sent by Mycelium (O3)">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label="Recipients (one per line)">
          <textarea value={to} onChange={(e) => setTo(e.target.value)} rows={5} className={`${INPUT} font-[family-name:var(--font-mono)] text-xs`} />
        </Field>
        <Field label="Subject — {dd/mm/yyyy} becomes the Friday" className="md:col-span-2">
          <input value={subject} onChange={(e) => setSubject(e.target.value)} className={INPUT} />
          <textarea aria-label="Body" value={body} onChange={(e) => setBody(e.target.value)} rows={4} className={`${INPUT} mt-2`} />
        </Field>
      </div>
      <div className="flex items-center gap-3">
        <Button size="sm" variant="primary" loading={busy} onClick={() => void save()}>
          SAVE
        </Button>
        {saved && <span className="text-xs text-ok">Saved.</span>}
      </div>
    </Card>
  );
}

function ExportCard() {
  return (
    <Card title="Export" aside="for evidence and backup — the database stays the master (§6)">
      <div className="flex flex-wrap items-center gap-2">
        <a href="/api/hours/export?format=xlsx" className="inline-flex">
          <Button size="sm" variant="primary" type="button">
            DOWNLOAD .XLSX
          </Button>
        </a>
        <a href="/api/hours/export?format=json" className="inline-flex">
          <Button size="sm" type="button">
            DOWNLOAD .JSON BACKUP
          </Button>
        </a>
        <span className="text-xs text-text-lo">
          Tabs: Log, Absences, Bank Holidays, Settings, Weekly History. Every Log row carries its Entry ID so a re-import upserts.
        </span>
      </div>
    </Card>
  );
}
