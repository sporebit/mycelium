"use client";

/**
 * Household admin: the documents and warranties you would otherwise hunt
 * for, and the bins. A warranty or document can carry its file and the
 * date it runs out; a bin carries the day it is collected and how often,
 * and the page says when the next one is.
 */
import { useRef, useState } from "react";
import { Button, Label } from "@/components/ui";
import { useApi } from "@/lib/data/useApi";
import { INPUT, dayLabel, dayLabelYear, send, type HouseholdItem } from "./api";

const KINDS: Array<{ value: HouseholdItem["kind"]; label: string }> = [
  { value: "document", label: "Document" },
  { value: "warranty", label: "Warranty" },
  { value: "bin", label: "Bin" },
  { value: "other", label: "Other" },
];
const SECTIONS: Array<{ kind: HouseholdItem["kind"]; title: string }> = [
  { kind: "bin", title: "Bins" },
  { kind: "document", title: "Documents" },
  { kind: "warranty", title: "Warranties" },
  { kind: "other", title: "Other" },
];

export function Household() {
  const { data, mutate } = useApi<{ items: HouseholdItem[]; today: string }>("/api/family/household");
  const [kind, setKind] = useState<HouseholdItem["kind"]>("document");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [every, setEvery] = useState("2");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      if (!title.trim()) throw new Error("Give it a name.");
      if (kind === "bin") {
        if (!date) throw new Error("Pick any day this bin is collected on.");
        const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
        await send("POST", "/api/family/household", { kind, title, schedule: { weekday, every_weeks: Number(every), anchor_on: date } });
      } else {
        const f = file.current?.files?.[0];
        if (f) {
          const form = new FormData();
          form.set("kind", kind);
          form.set("title", title);
          if (date) form.set("expires_on", date);
          form.set("file", f);
          await send("POST", "/api/family/household", form);
        } else await send("POST", "/api/family/household", { kind, title, ...(date ? { expires_on: date } : {}) });
      }
      setTitle("");
      setDate("");
      if (file.current) file.current.value = "";
      await mutate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not save. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-5" data-testid="family-household">
      <form
        className="flex flex-col gap-2 rounded-v2-lg border border-hairline bg-surface-1 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <div className="flex flex-wrap gap-2">
          <select aria-label="What it is" className={`${INPUT} pr-8`} value={kind} onChange={(e) => setKind(e.target.value as HouseholdItem["kind"])}>
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
          <input className={`${INPUT} min-w-[12rem] flex-1`} aria-label="Its name" placeholder={kind === "bin" ? "Recycling" : kind === "warranty" ? "Washing machine" : "Boiler service record"} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-text-mid">
            {kind === "bin" ? "A day it is collected" : "Runs out on"}
            <input type="date" className={INPUT} value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          {kind === "bin" ? (
            <label className="flex items-center gap-2 text-xs text-text-mid">
              every
              <select aria-label="How often" className={`${INPUT} pr-8`} value={every} onChange={(e) => setEvery(e.target.value)}>
                <option value="1">week</option>
                <option value="2">2 weeks</option>
                <option value="3">3 weeks</option>
                <option value="4">4 weeks</option>
              </select>
            </label>
          ) : (
            <input ref={file} type="file" aria-label="Its file" accept="image/*,application/pdf" className="max-w-full text-xs text-text-mid file:mr-2 file:rounded-v2-md file:border file:border-hairline file:bg-surface-0 file:px-3 file:py-1.5 file:text-text-hi" />
          )}
          <Button type="submit" variant="primary" loading={busy} className="ml-auto">
            Add
          </Button>
        </div>
        {error ? <p role="alert" className="text-sm text-v2-error">{error}</p> : null}
      </form>

      {data && data.items.length === 0 ? <p className="text-sm text-text-mid">Nothing here yet. The bins are a good first thing to add.</p> : null}
      {SECTIONS.map((s) => {
        const items = (data?.items ?? []).filter((i) => i.kind === s.kind);
        if (items.length === 0) return null;
        return (
          <section key={s.kind} aria-label={s.title}>
            <Label>{s.title}</Label>
            <ul className="mt-1 flex flex-col divide-y divide-hairline">
              {items.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm" data-testid="household-item">
                  <span className="min-w-0 flex-1 text-text-hi">{i.title}</span>
                  {i.next_on ? <span className="text-xs text-text-mid">{i.next_on === data?.today ? "Today" : `Next: ${dayLabel(i.next_on)}`}</span> : null}
                  {i.expires_on ? <span className="text-xs text-text-mid">{i.expires_on < (data?.today ?? "") ? "Ran out" : "Runs out"} {dayLabelYear(i.expires_on)}</span> : null}
                  {i.has_file ? (
                    <a href={`/api/family/household/${i.id}/media`} target="_blank" rel="noreferrer" className="text-xs text-glow-2 hover:underline">
                      Open
                    </a>
                  ) : null}
                  <button
                    type="button"
                    className="text-xs text-text-lo underline hover:text-text-hi"
                    aria-label={`Remove ${i.title}`}
                    onClick={() => {
                      if (!window.confirm(`Remove "${i.title}" for everyone?`)) return;
                      void send("DELETE", `/api/family/household/${i.id}`)
                        .then(() => mutate())
                        .catch((e: Error) => setError(e.message));
                    }}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
