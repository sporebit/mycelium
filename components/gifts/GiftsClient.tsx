"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useApi } from "@/lib/data/useApi";
import { ticketFetch } from "@/components/tickets/pickers";
import { Pill } from "@/components/tickets/ContextEditor";
import { Mono } from "@/components/dashboard/Mono";
import { EntityForm } from "@/components/forms/EntityForm";
import { ENTITY_REGISTRY, emptyValues, type FieldErrors, type FieldValues } from "@/lib/capture/registry";
import { OCCASION_KIND_LABEL, OCCASION_KINDS, type GiftRow, type GiftStatus, type OccasionRow } from "@/lib/gifts/types";
import { fmtDay, GiftCard, giftFor } from "./GiftCard";
import { GiftSheet, type PersonOption } from "./GiftSheet";
import { BudgetLine, occasionFor, OccasionSheet, type OccasionWithTotals } from "./OccasionSheet";

const GIFT_DEF = ENTITY_REGISTRY.gift_idea;
const ADD_FIELDS = ["title", "for_person_id", "for_label", "reason", "url", "target_price", "needed_by"] as const;

type View = "occasion" | "person" | "all" | "given";
type PeopleApiRow = { id: string; display_name?: string | null; first_name?: string | null; last_name?: string | null };
type Similar = { id: string; title: string; score: number };

const input = "bg-surface-2 rounded-sm text-sm text-text-hi px-3 py-2 outline outline-1 outline-transparent focus:outline-glow-2";
const btn = "px-3 py-1.5 rounded-sm border border-text-hi text-xs text-text-mid hover:text-text-hi hover:bg-surface-2 font-[family-name:var(--font-mono)] tracking-[0.1em] disabled:opacity-50";

const OPEN: GiftStatus[] = ["idea", "shortlisted", "bought"];

function daysUntil(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((Date.UTC(y, m - 1, d) - today) / 86_400_000);
}

/**
 * /organisation/gifts (spec §10): by occasion (default), by person, all
 * ideas, given; search and status chips; the add form with the near-
 * duplicate warning; occasions added by hand; the export honouring the
 * filter. Owner-only: another member of the space sees their own, not Phil's.
 */
export function GiftsClient() {
  const sp = useSearchParams();
  const [view, setView] = useState<View>(() => (sp.get("person") ? "person" : "occasion"));
  const [q, setQ] = useState("");
  const [person, setPerson] = useState<string>(() => sp.get("person") ?? "");
  const [statuses, setStatuses] = useState<GiftStatus[]>([]);
  const [openId, setOpenId] = useState<string | null>(() => sp.get("focus"));
  const [openOccasionId, setOpenOccasionId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [addingOccasion, setAddingOccasion] = useState(false);
  const [addDraft, setAddDraft] = useState<FieldValues>(() => emptyValues(GIFT_DEF, { for_person_id: sp.get("person") ?? "" }));
  const [addErrors, setAddErrors] = useState<FieldErrors>({});
  const [addErr, setAddErr] = useState<string | null>(null);
  const [dupes, setDupes] = useState<Similar[]>([]);
  const [occDraft, setOccDraft] = useState({ name: "", kind: "other", person_id: "", occurs_on: "", recurrence: "none", budget: "" });
  const [occErr, setOccErr] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const params = new URLSearchParams();
  if (q.trim()) params.set("q", q.trim());
  if (person) params.set("person", person);
  if (view === "given") params.set("status", "given");
  else if (statuses.length) params.set("status", statuses.join(","));
  const key = `/api/gifts${params.toString() ? `?${params}` : ""}`;
  const { data, mutate } = useApi<{ gifts: GiftRow[] }>(key);
  const { data: occData, mutate: mutateOcc } = useApi<{ occasions: OccasionWithTotals[]; today: string }>("/api/gift-occasions?totals=1");
  const { data: peopleData } = useApi<{ people: PeopleApiRow[] }>("/api/people");
  const people: PersonOption[] = (peopleData?.people ?? []).map((p) => ({
    id: p.id,
    name: (p.display_name?.trim() || [p.first_name, p.last_name].filter(Boolean).join(" ").trim()) || "(unnamed)",
  }));
  const gifts = data?.gifts ?? [];
  const occasions = occData?.occasions ?? [];
  const open = gifts.find((x) => x.id === openId) ?? null;
  const openOccasion = occasions.find((o) => o.id === openOccasionId) ?? null;

  const replace = (row: GiftRow) => {
    void mutate((cur) => (cur ? { ...cur, gifts: cur.gifts.map((x) => (x.id === row.id ? row : x)) } : cur), { revalidate: false });
    void mutateOcc();
  };
  const remove = (id: string) => {
    void mutate((cur) => (cur ? { ...cur, gifts: cur.gifts.filter((x) => x.id !== id) } : cur), { revalidate: false });
    void mutateOcc();
  };
  const replaceOccasion = (row: OccasionRow) => void mutateOcc((cur) => (cur ? { ...cur, occasions: cur.occasions.map((x) => (x.id === row.id ? { ...x, ...row } : x)) } : cur), { revalidate: false });
  const removeOccasion = (id: string) => {
    void mutateOcc((cur) => (cur ? { ...cur, occasions: cur.occasions.filter((x) => x.id !== id) } : cur), { revalidate: false });
    void mutate();
  };

  const add = async (force = false) => {
    setAddErr(null);
    const errors = GIFT_DEF.validate(addDraft);
    setAddErrors(errors);
    if (Object.keys(errors).length) return;
    try {
      const res = await fetch("/api/gifts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(GIFT_DEF.toPostBody!({ ...addDraft, force })) });
      const j = (await res.json()) as { gift?: GiftRow; error?: string; similar?: Similar[] };
      if (res.status === 409 && j.similar) {
        setDupes(j.similar);
        return;
      }
      if (!res.ok || !j.gift) throw new Error(j.error ?? `${res.status}`);
      setAdding(false);
      setAddDraft(emptyValues(GIFT_DEF, {}));
      setDupes([]);
      await mutate();
    } catch (e) {
      setAddErr(e instanceof Error ? e.message : "failed");
    }
  };
  const addOccasion = async () => {
    setOccErr(null);
    try {
      await ticketFetch("/api/gift-occasions", {
        method: "POST",
        body: { name: occDraft.name, kind: occDraft.kind, person_id: occDraft.person_id || null, occurs_on: occDraft.occurs_on, recurrence: occDraft.recurrence, budget: occDraft.budget.trim() === "" ? null : Number(occDraft.budget) },
      });
      setAddingOccasion(false);
      setOccDraft({ name: "", kind: "other", person_id: "", occurs_on: "", recurrence: "none", budget: "" });
      await mutateOcc();
    } catch (e) {
      setOccErr(e instanceof Error ? e.message : "failed");
    }
  };
  const sync = async () => {
    setSyncing(true);
    try {
      await ticketFetch("/api/gift-occasions/sync", { method: "POST" });
      await mutateOcc();
    } finally {
      setSyncing(false);
    }
  };

  const exportHref = `/api/gifts/export?format=csv${person ? `&person=${encodeURIComponent(person)}` : ""}${view === "given" ? "&status=given" : statuses.length ? `&status=${statuses.join(",")}` : ""}`;
  const toggleStatus = (s: GiftStatus) => setStatuses((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  // chips: people in the current list plus the selected one
  const chipPeople = new Map<string, string>();
  for (const r of gifts) if (r.for_person_id) chipPeople.set(r.for_person_id, giftFor(r) ?? "person");
  if (person && !chipPeople.has(person)) chipPeople.set(person, people.find((p) => p.id === person)?.name ?? "person");

  const noOccasions = occData && occasions.length === 0;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h1 className="text-lg font-semibold text-text-hi">Gifts</h1>
        <div className="flex items-center gap-2">
          <a href={exportHref} className={btn}>
            EXPORT
          </a>
          <button type="button" className={btn} onClick={() => setAddingOccasion((v) => !v)}>
            {addingOccasion ? "CLOSE" : "+ OCCASION"}
          </button>
          <button type="button" className={btn} onClick={() => setAdding((v) => !v)}>
            {adding ? "CLOSE" : "+ IDEA"}
          </button>
        </div>
      </div>

      {adding && (
        <div className="rounded-md bg-surface-1 p-4 flex flex-col gap-3" data-testid="gift-add">
          <EntityForm def={GIFT_DEF} only={ADD_FIELDS} values={addDraft} onChange={setAddDraft} errors={addErrors} autoFocus onSubmit={() => void add(false)} />
          {dupes.length > 0 && (
            <div className="rounded-sm border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-text-mid flex flex-col gap-1" data-testid="gift-dupes">
              <div className="text-warn">Looks like an idea you already have for them:</div>
              {dupes.map((d) => (
                <div key={d.id}>
                  {d.title} <span className="text-text-lo">({Math.round(d.score * 100)}%)</span>
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
            <button type="button" className={btn} onClick={() => void add(false)} disabled={!String(addDraft.title ?? "").trim()}>
              SAVE
            </button>
            {addErr && <span className="text-xs text-error">{addErr}</span>}
          </div>
        </div>
      )}

      {addingOccasion && (
        <div className="rounded-md bg-surface-1 p-4 flex flex-col gap-3" data-testid="occasion-add">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input value={occDraft.name} onChange={(e) => setOccDraft({ ...occDraft, name: e.target.value })} placeholder="Name (Dan's wedding)" className={`${input} sm:col-span-2`} autoFocus />
            <select value={occDraft.kind} onChange={(e) => setOccDraft({ ...occDraft, kind: e.target.value })} className={input}>
              {OCCASION_KINDS.map((k) => (
                <option key={k} value={k}>
                  {OCCASION_KIND_LABEL[k]}
                </option>
              ))}
            </select>
            <input type="date" value={occDraft.occurs_on} onChange={(e) => setOccDraft({ ...occDraft, occurs_on: e.target.value })} className={input} aria-label="Date" />
            <select value={occDraft.person_id} onChange={(e) => setOccDraft({ ...occDraft, person_id: e.target.value })} className={input}>
              <option value="">— shared / nobody —</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <select value={occDraft.recurrence} onChange={(e) => setOccDraft({ ...occDraft, recurrence: e.target.value })} className={input}>
                <option value="none">One-off</option>
                <option value="annual">Every year</option>
              </select>
              <input type="number" min={0} value={occDraft.budget} onChange={(e) => setOccDraft({ ...occDraft, budget: e.target.value })} placeholder="Budget" className={`${input} w-24`} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className={btn} onClick={() => void addOccasion()} disabled={!occDraft.name.trim() || !occDraft.occurs_on}>
              SAVE
            </button>
            {occErr && <span className="text-xs text-error">{occErr}</span>}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search gift ideas…" className={`${input} w-full`} />
        <div className="flex flex-wrap items-center gap-1.5">
          <Pill active={person === ""} onClick={() => setPerson("")}>
            Everyone
          </Pill>
          {Array.from(chipPeople.entries()).map(([id, name]) => (
            <Pill key={id} active={person === id} onClick={() => setPerson(person === id ? "" : id)}>
              {name}
            </Pill>
          ))}
          <span className="flex-1" />
          {view !== "given" &&
            OPEN.map((s) => (
              <Pill key={s} active={statuses.includes(s)} onClick={() => toggleStatus(s)} tone="accent">
                {s}
              </Pill>
            ))}
          <select value={view} onChange={(e) => setView(e.target.value as View)} className="rounded-sm bg-surface-2 px-2 py-1 text-xs text-text-hi" aria-label="View">
            <option value="occasion">By occasion</option>
            <option value="person">By person</option>
            <option value="all">All ideas</option>
            <option value="given">Given</option>
          </select>
        </div>
      </div>

      {view === "occasion" && noOccasions && (
        <div className="rounded-sm border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-text-mid flex items-center gap-2 flex-wrap" data-testid="no-occasions">
          <span className="text-warn">No upcoming occasions.</span>
          <span>Birthdays come from People once a date of birth is set; Christmas and Valentine&apos;s are added for you.</span>
          <button type="button" className={btn} onClick={() => void sync()} disabled={syncing}>
            {syncing ? "…" : "REFRESH OCCASIONS"}
          </button>
        </div>
      )}

      {!data ? (
        <div className="text-sm text-text-lo italic">Loading…</div>
      ) : view === "occasion" ? (
        <OccasionGroups gifts={gifts} occasions={occasions} person={person} onOpen={(g) => setOpenId(g.id)} onOpenOccasion={(o) => setOpenOccasionId(o.id)} />
      ) : gifts.length === 0 ? (
        <div className="text-sm text-text-lo italic">{view === "given" ? "Nothing given yet." : "No gift ideas yet. Say “gift idea for Jake: …” to the bot, or add one."}</div>
      ) : view === "person" ? (
        <PersonGroups gifts={gifts} onOpen={(g) => setOpenId(g.id)} />
      ) : (
        <section className="flex flex-col gap-2">
          {gifts.map((g) => (
            <GiftCard key={g.id} g={g} onOpen={(x) => setOpenId(x.id)} />
          ))}
        </section>
      )}

      <GiftSheet gift={open} people={people} occasions={occasions} onClose={() => setOpenId(null)} onChanged={replace} onDeleted={remove} />
      <OccasionSheet occasion={openOccasion} people={people} onClose={() => setOpenOccasionId(null)} onChanged={replaceOccasion} onDeleted={removeOccasion} />
    </div>
  );
}

function OccasionGroups({ gifts, occasions, person, onOpen, onOpenOccasion }: { gifts: GiftRow[]; occasions: OccasionWithTotals[]; person: string; onOpen: (g: GiftRow) => void; onOpenOccasion: (o: OccasionWithTotals) => void }) {
  const byOcc = new Map<string, GiftRow[]>();
  const loose: GiftRow[] = [];
  for (const g of gifts) {
    if (g.occasion_id) byOcc.set(g.occasion_id, [...(byOcc.get(g.occasion_id) ?? []), g]);
    else loose.push(g);
  }
  const shown = occasions.filter((o) => !person || o.person_id === person || byOcc.has(o.id));
  return (
    <div className="flex flex-col gap-4">
      {shown.map((o) => {
        const rows = byOcc.get(o.id) ?? [];
        const left = daysUntil(o.occurs_on);
        const who = occasionFor(o);
        return (
          <section key={o.id} className="flex flex-col gap-2" data-testid="occasion-group">
            <button type="button" onClick={() => onOpenOccasion(o)} className="text-left flex items-baseline gap-2 flex-wrap pt-2">
              <span className="card-eyebrow">{o.name}</span>
              <Mono className="text-[10px] text-text-lo">
                {fmtDay(o.occurs_on)} · {left === 0 ? "today" : left === 1 ? "tomorrow" : `in ${left} days`}
                {who && o.kind !== "birthday" ? ` · ${who}` : ""}
              </Mono>
              {rows.length === 0 && <span className="text-[11px] text-warn">nothing yet</span>}
            </button>
            {o.totals && <BudgetLine t={o.totals} />}
            {rows.map((g) => (
              <GiftCard key={g.id} g={g} onOpen={onOpen} showOccasion={false} />
            ))}
          </section>
        );
      })}
      {loose.length > 0 && (
        <section className="flex flex-col gap-2">
          <div className="card-eyebrow pt-2">No occasion</div>
          {loose.map((g) => (
            <GiftCard key={g.id} g={g} onOpen={onOpen} />
          ))}
        </section>
      )}
    </div>
  );
}

function PersonGroups({ gifts, onOpen }: { gifts: GiftRow[]; onOpen: (g: GiftRow) => void }) {
  const m = new Map<string, { label: string; rows: GiftRow[] }>();
  for (const r of gifts) {
    const k = r.for_person_id ?? (r.for_label ? `label:${r.for_label.toLowerCase()}` : "__nobody");
    const g = m.get(k) ?? { label: giftFor(r) ?? "Nobody yet", rows: [] };
    g.rows.push(r);
    m.set(k, g);
  }
  return (
    <div className="flex flex-col gap-4">
      {Array.from(m.entries())
        .sort((a, b) => b[1].rows.length - a[1].rows.length)
        .map(([k, g]) => (
          <section key={k} className="flex flex-col gap-2">
            <div className="card-eyebrow pt-2">
              {g.label} · {g.rows.length}
            </div>
            {g.rows.map((r) => (
              <GiftCard key={r.id} g={r} onOpen={onOpen} showPerson={false} />
            ))}
          </section>
        ))}
    </div>
  );
}
