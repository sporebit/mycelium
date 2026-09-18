"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useApi } from "@/lib/data/useApi";
import { ticketFetch } from "@/components/tickets/pickers";
import { Pill } from "@/components/tickets/ContextEditor";
import type { QuoteRow } from "@/lib/quotes/server";
import { QuoteCard, quotePersonName } from "./QuoteCard";
import { QuoteSheet, type PersonOption } from "./QuoteSheet";

type View = "list" | "person" | "month";
type PeopleApiRow = { id: string; display_name?: string | null; first_name?: string | null; last_name?: string | null };

function monthKey(iso: string): string {
  return iso.slice(0, 7);
}
function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

const input = "bg-ink-2 rounded-sm text-sm text-text-0 px-3 py-2 outline outline-1 outline-transparent focus:outline-glow-2";
const btn = "px-3 py-1.5 rounded-sm border border-ink-4 text-xs text-text-1 hover:text-text-0 hover:bg-ink-2 font-[family-name:var(--font-mono)] tracking-[0.1em] disabled:opacity-50";

/**
 * /organisation/quotes (spec §7): newest first; search, person chips (incl.
 * Mine), Merch toggle, list / by person / by month; the Sheet detail; the
 * export honouring the current filter; a manual add.
 */
export function QuotesClient() {
  const sp = useSearchParams();
  const [q, setQ] = useState("");
  const [person, setPerson] = useState<string>(() => sp.get("person") ?? ""); // "" | "mine" | person id
  const [merch, setMerch] = useState(false);
  const [view, setView] = useState<View>("list");
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [addDraft, setAddDraft] = useState({ text: "", who: "__me", context: "" });
  const [addErr, setAddErr] = useState<string | null>(null);
  const [dupes, setDupes] = useState<Array<{ id: string; text: string; score: number }>>([]);

  const params = new URLSearchParams();
  if (q.trim()) params.set("q", q.trim());
  if (person) params.set("person", person);
  if (merch) params.set("merch", "1");
  const key = `/api/quotes${params.toString() ? `?${params}` : ""}`;
  const { data, mutate } = useApi<{ quotes: QuoteRow[] }>(key);
  const { data: peopleData } = useApi<{ people: PeopleApiRow[] }>("/api/people");
  const people: PersonOption[] = (peopleData?.people ?? []).map((p) => ({
    id: p.id,
    name: (p.display_name?.trim() || [p.first_name, p.last_name].filter(Boolean).join(" ").trim()) || "(unnamed)",
  }));
  const quotes = data?.quotes ?? [];
  const open = quotes.find((x) => x.id === openId) ?? null;

  // Person chips: the people who have quotes in the unfiltered set would need
  // another fetch; use the people that appear in the current list plus the
  // selected one so the chip never vanishes under you.
  const chipPeople = new Map<string, string>();
  for (const r of quotes) if (r.said_by_person_id) chipPeople.set(r.said_by_person_id, quotePersonName(r) ?? "person");
  if (person && person !== "mine" && !chipPeople.has(person)) chipPeople.set(person, people.find((p) => p.id === person)?.name ?? "person");

  const replace = (row: QuoteRow) => void mutate((cur) => (cur ? { quotes: cur.quotes.map((x) => (x.id === row.id ? row : x)) } : cur), { revalidate: false });
  const remove = (id: string) => void mutate((cur) => (cur ? { quotes: cur.quotes.filter((x) => x.id !== id) } : cur), { revalidate: false });
  const toggleMerch = async (row: QuoteRow) => {
    replace({ ...row, merch: !row.merch });
    try {
      const r = await ticketFetch<{ quote: QuoteRow }>(`/api/quotes/${row.id}`, { method: "PATCH", body: { merch: !row.merch } });
      replace(r.quote);
    } catch {
      replace(row);
    }
  };

  const add = async (force = false) => {
    setAddErr(null);
    const text = addDraft.text.trim();
    if (!text) return;
    try {
      const res = await fetch("/api/quotes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text,
          is_own: addDraft.who === "__me",
          said_by_person_id: addDraft.who === "__me" || addDraft.who === "" ? null : addDraft.who,
          context: addDraft.context || null,
          force,
        }),
      });
      const j = (await res.json()) as { quote?: QuoteRow; error?: string; similar?: Array<{ id: string; text: string; score: number }> };
      if (res.status === 409 && j.similar) {
        setDupes(j.similar);
        return;
      }
      if (!res.ok || !j.quote) throw new Error(j.error ?? `${res.status}`);
      setAdding(false);
      setAddDraft({ text: "", who: "__me", context: "" });
      setDupes([]);
      await mutate();
    } catch (e) {
      setAddErr(e instanceof Error ? e.message : "failed");
    }
  };

  const exportHref = `/api/quotes/export?format=csv${merch ? "&merch=1" : ""}${person ? `&person=${encodeURIComponent(person)}` : ""}`;

  const groups: Array<{ key: string; label: string; rows: QuoteRow[] }> = [];
  if (view === "list") groups.push({ key: "all", label: "", rows: quotes });
  else if (view === "month") {
    const m = new Map<string, QuoteRow[]>();
    for (const r of quotes) {
      const k = monthKey(r.said_at ?? r.created_at);
      m.set(k, [...(m.get(k) ?? []), r]);
    }
    for (const k of Array.from(m.keys()).sort().reverse()) groups.push({ key: k, label: monthLabel(k), rows: m.get(k)! });
  } else {
    const m = new Map<string, { label: string; rows: QuoteRow[] }>();
    for (const r of quotes) {
      const k = r.is_own ? "__me" : (r.said_by_person_id ?? "__unknown");
      const label = r.is_own ? "Me" : (quotePersonName(r) ?? "Unknown speaker");
      const g = m.get(k) ?? { label, rows: [] };
      g.rows.push(r);
      m.set(k, g);
    }
    for (const [k, g] of Array.from(m.entries()).sort((a, b) => b[1].rows.length - a[1].rows.length)) groups.push({ key: k, label: `${g.label} · ${g.rows.length}`, rows: g.rows });
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h1 className="text-lg font-semibold text-text-0">Quotes</h1>
        <div className="flex items-center gap-2">
          <a href={exportHref} className={btn}>
            EXPORT
          </a>
          <button type="button" className={btn} onClick={() => setAdding((v) => !v)}>
            {adding ? "CLOSE" : "+ ADD"}
          </button>
        </div>
      </div>

      {adding && (
        <div className="rounded-md bg-ink-1 p-4 flex flex-col gap-3">
          <textarea rows={2} value={addDraft.text} onChange={(e) => setAddDraft({ ...addDraft, text: e.target.value })} placeholder="The quote, as said" className={`${input} w-full resize-y`} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <select value={addDraft.who} onChange={(e) => setAddDraft({ ...addDraft, who: e.target.value })} className={input}>
              <option value="__me">Me</option>
              <option value="">Unknown</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <input value={addDraft.context} onChange={(e) => setAddDraft({ ...addDraft, context: e.target.value })} placeholder="context (optional)" className={input} />
          </div>
          {dupes.length > 0 && (
            <div className="rounded-sm border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-text-1 flex flex-col gap-1">
              <div className="text-warn">Looks like a quote you already have:</div>
              {dupes.map((d) => (
                <div key={d.id}>
                  “{d.text}” <span className="text-text-2">({Math.round(d.score * 100)}%)</span>
                </div>
              ))}
              <div className="flex gap-2 pt-1">
                <button type="button" className={btn} onClick={() => void add(true)}>
                  ADD ANYWAY
                </button>
                <button type="button" className={btn} onClick={() => setDupes([])}>
                  CANCEL
                </button>
              </div>
            </div>
          )}
          <div className="flex items-center gap-2">
            <button type="button" className={btn} onClick={() => void add(false)} disabled={!addDraft.text.trim()}>
              SAVE
            </button>
            {addErr && <span className="text-xs text-error">{addErr}</span>}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search quotes…" className={`${input} w-full`} />
        <div className="flex flex-wrap items-center gap-1.5">
          <Pill active={person === ""} onClick={() => setPerson("")}>
            All
          </Pill>
          <Pill active={person === "mine"} onClick={() => setPerson(person === "mine" ? "" : "mine")}>
            Mine
          </Pill>
          {Array.from(chipPeople.entries()).map(([id, name]) => (
            <Pill key={id} active={person === id} onClick={() => setPerson(person === id ? "" : id)}>
              {name}
            </Pill>
          ))}
          <span className="flex-1" />
          <Pill active={merch} onClick={() => setMerch((v) => !v)} tone="accent">
            Merch
          </Pill>
          <select value={view} onChange={(e) => setView(e.target.value as View)} className="rounded-sm bg-ink-2 px-2 py-1 text-xs text-text-0">
            <option value="list">List</option>
            <option value="person">By person</option>
            <option value="month">By month</option>
          </select>
        </div>
      </div>

      {!data ? (
        <div className="text-sm text-ink-3 italic">Loading…</div>
      ) : quotes.length === 0 ? (
        <div className="text-sm text-ink-3 italic">No quotes yet. Say “quote from Jake: …” to the bot, or add one.</div>
      ) : (
        groups.map((g) => (
          <section key={g.key} className="flex flex-col gap-2">
            {g.label && <div className="card-eyebrow pt-2">{g.label}</div>}
            {g.rows.map((r) => (
              <QuoteCard key={r.id} q={r} onOpen={(x) => setOpenId(x.id)} onToggleMerch={(x) => void toggleMerch(x)} showPerson={view !== "person"} />
            ))}
          </section>
        ))
      )}

      <QuoteSheet quote={open} people={people} onClose={() => setOpenId(null)} onChanged={replace} onDeleted={remove} />
    </div>
  );
}
