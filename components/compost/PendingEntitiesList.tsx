"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Mono } from "@/components/dashboard/Mono";
import { FACT_KINDS } from "@/lib/daylog/extraction";

type EntityType = "person" | "project" | "workout" | "food" | "daylog_person_link" | "daylog_new_person" | "daylog_fact" | "daylog_place";

type PendingEntity = {
  id: string;
  capture_id: string | null;
  entity_type: EntityType;
  entity_name: string;
  additional_data: Record<string, unknown> | null;
  created_at: string;
  capture?: {
    id: string;
    raw_text: string | null;
    source: string;
    created_at: string;
  } | null;
};

type PersonLite = {
  id: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
};
type PlaceLite = { id: string; name: string };
type Option = { id: string; label: string };
type ResolveExtra = { link_to_id?: string; text?: string; kind?: string };

function personLabel(p: PersonLite): string {
  if (p.display_name) return p.display_name;
  return [p.first_name, p.last_name].filter(Boolean).join(" ") || p.id;
}

function relativeDate(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = ms / 60_000;
  if (m < 1) return "just now";
  if (m < 60) return `${Math.floor(m)}m ago`;
  const h = m / 60;
  if (h < 24) return `${Math.floor(h)}h ago`;
  const d = h / 24;
  if (d < 14) return `${Math.floor(d)}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const TYPE_LABEL: Record<EntityType, string> = {
  person: "person",
  project: "project",
  workout: "workout",
  food: "food",
  daylog_person_link: "was there",
  daylog_new_person: "new person",
  daylog_fact: "fact",
  daylog_place: "place",
};
/** People before places before facts: a fact's subject should exist by the time it is approved. */
const TYPE_ORDER: Record<EntityType, number> = { person: 0, project: 0, workout: 0, food: 0, daylog_person_link: 1, daylog_new_person: 2, daylog_place: 3, daylog_fact: 4 };
const isDaylog = (t: EntityType) => t.startsWith("daylog_");
/** Approvable exactly as proposed, with no decision to make. */
const isRoutine = (p: PendingEntity) => p.entity_type === "daylog_person_link" || p.entity_type === "daylog_fact";
const ad = (p: PendingEntity, k: string): string | null => {
  const v = p.additional_data?.[k];
  return typeof v === "string" && v.trim() ? v : null;
};

const smallBtn = "px-2 py-1 rounded-md disabled:opacity-40 text-[10px] uppercase tracking-[0.18em] font-[family-name:var(--font-mono)]";
const primaryBtn = `${smallBtn} bg-accent/15 border border-accent/40 text-accent hover:bg-accent/25`;
const quietBtn = `${smallBtn} bg-ink-0/40 border border-ink-2 hover:border-ink-3 text-ink-3 hover:text-ink-4`;
const rejectBtn = `${smallBtn} text-ink-3 hover:text-danger`;

/**
 * Tab body for /organisation/captures/review's "NEW ENTITIES" view. Two
 * sources feed it: a capture that mentioned a name we couldn't resolve
 * (CREATE / LINK / REJECT), and the day log, which queues everything it
 * learned at close — who was there, new people, places, facts — so nothing
 * reaches People unreviewed (daylog spec decision 17). Day-log items are
 * grouped by day; `?day=<day id>` narrows to one.
 */
export function PendingEntitiesList({ dayId }: { dayId?: string | null }) {
  const [pending, setPending] = useState<PendingEntity[] | null>(null);
  const [people, setPeople] = useState<PersonLite[]>([]);
  const [places, setPlaces] = useState<PlaceLite[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [pRes, peopleRes, placesRes] = await Promise.all([
        fetch(`/api/pending-entities${dayId ? `?day_id=${encodeURIComponent(dayId)}` : ""}`, { cache: "no-store" }),
        fetch("/api/people?limit=500", { cache: "no-store" }),
        fetch("/api/places", { cache: "no-store" }),
      ]);
      const pj = (await pRes.json().catch(() => ({}))) as {
        pending?: PendingEntity[];
      };
      const peopleJson = (await peopleRes.json().catch(() => ({}))) as {
        people?: PersonLite[];
      };
      const placesJson = (await placesRes.json().catch(() => ({}))) as { places?: PlaceLite[] };
      setPending(Array.isArray(pj.pending) ? pj.pending : []);
      setPeople(Array.isArray(peopleJson.people) ? peopleJson.people : []);
      setPlaces(Array.isArray(placesJson.places) ? placesJson.places : []);
    } catch {
      setPending([]);
    }
  }, [dayId]);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  const resolveOne = useCallback(async (p: PendingEntity, action: "create_new" | "link_existing" | "reject", extra: ResolveExtra = {}): Promise<boolean> => {
    const r = await fetch(`/api/pending-entities/${p.id}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    if (!r.ok) {
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      setError(j.error ?? "Resolve failed");
      return false;
    }
    setPending((cur) => (cur ?? []).filter((x) => x.id !== p.id));
    return true;
  }, []);

  async function resolve(p: PendingEntity, action: "create_new" | "link_existing" | "reject", extra?: ResolveExtra) {
    setError(null);
    setBusyId(p.id);
    try {
      const ok = await resolveOne(p, action, extra);
      // a new person may now be the subject of facts still in the queue
      if (ok && p.entity_type === "daylog_new_person" && action === "create_new") void load();
    } finally {
      setBusyId(null);
    }
  }

  async function approveAll(items: PendingEntity[]) {
    setError(null);
    setBusyId("bulk");
    try {
      for (const p of items) if (!(await resolveOne(p, "create_new"))) break;
    } finally {
      setBusyId(null);
    }
  }

  const peopleOptions = useMemo<Option[]>(() => people.map((p) => ({ id: p.id, label: personLabel(p) })), [people]);
  const placeOptions = useMemo<Option[]>(() => places.map((p) => ({ id: p.id, label: p.name })), [places]);

  const groups = useMemo(() => {
    const out: Array<{ key: string; day: string | null; items: PendingEntity[] }> = [];
    for (const p of pending ?? []) {
      const day = isDaylog(p.entity_type) ? ad(p, "day") : null;
      const key = day ?? "captures";
      let g = out.find((x) => x.key === key);
      if (!g) out.push((g = { key, day, items: [] }));
      g.items.push(p);
    }
    for (const g of out) g.items.sort((a, b) => TYPE_ORDER[a.entity_type] - TYPE_ORDER[b.entity_type]);
    return out.sort((a, b) => (a.day === null ? -1 : b.day === null ? 1 : b.day.localeCompare(a.day)));
  }, [pending]);

  if (pending === null) {
    return (
      <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-12 text-center">
        Loading…
      </div>
    );
  }
  if (pending.length === 0) {
    return (
      <div className="rounded-md bg-ink-1 p-8 text-center">
        <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
          {dayId
            ? "Nothing left to review for that day."
            : "No new entities waiting. Voice captures mentioning names we recognise route automatically."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-danger font-[family-name:var(--font-mono)]">
          ⚠ {error}
        </div>
      )}
      {groups.map((g) => {
        const routine = g.items.filter(isRoutine);
        return (
          <section key={g.key} className="flex flex-col gap-2">
            {g.day && (
              <div className="flex items-center justify-between gap-2 px-1">
                <Link href={`/journal/${g.day}`} className="text-[11px] uppercase tracking-[0.18em] text-ink-4 hover:text-accent font-[family-name:var(--font-mono)]">
                  Day log · {g.day}
                </Link>
                {routine.length > 1 && (
                  <button type="button" className={primaryBtn} disabled={busyId !== null} onClick={() => void approveAll(routine)} title="Approves who-was-there links and facts exactly as proposed. New people and places still need a decision.">
                    {busyId === "bulk" ? "…" : `APPROVE ${routine.length} AS PROPOSED`}
                  </button>
                )}
              </div>
            )}
            <ul className="flex flex-col gap-2">
              {g.items.map((p) => (
                <li
                  key={p.id}
                  className="rounded-md bg-ink-1 border border-ink-2 px-3 py-3 flex flex-col gap-2"
                >
                  <div className="flex items-baseline justify-between gap-2 flex-wrap">
                    <div className="flex items-baseline gap-2 min-w-0">
                      <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] shrink-0">
                        {TYPE_LABEL[p.entity_type]}
                      </span>
                      {p.entity_type !== "daylog_fact" && <span className="text-base text-ink-4">{p.entity_name}</span>}
                    </div>
                    <Mono className="text-[10px] text-ink-3">
                      {relativeDate(p.created_at)}
                    </Mono>
                  </div>

                  {p.capture && (
                    <Link
                      href={`/organisation/captures?focus=${p.capture.id}`}
                      className="block rounded-md bg-ink-0/40 border border-ink-2/60 px-2 py-1.5 text-xs text-ink-3 italic font-[family-name:var(--font-display)] hover:border-ink-3 transition-colors"
                    >
                      {p.capture.raw_text?.slice(0, 240) || "(no transcription)"}
                      <span className="ml-2 not-italic text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
                        · {p.capture.source}
                      </span>
                    </Link>
                  )}

                  {isDaylog(p.entity_type) ? (
                    <DaylogActions p={p} people={peopleOptions} places={placeOptions} busy={busyId !== null} onResolve={(action, extra) => void resolve(p, action, extra)} />
                  ) : (
                    <ResolveActions
                      entityType={p.entity_type}
                      people={peopleOptions}
                      busy={busyId === p.id}
                      onCreate={() => void resolve(p, "create_new")}
                      onLink={(id) => void resolve(p, "link_existing", { link_to_id: id })}
                      onReject={() => void resolve(p, "reject")}
                    />
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function Picker({ options, placeholder, busy, onPick }: { options: Option[]; placeholder: string; busy: boolean; onPick: (id: string) => void }) {
  const [pick, setPick] = useState<string>("");
  return (
    <div className="flex items-center gap-2 w-full">
      <select
        value={pick}
        onChange={(e) => setPick(e.target.value)}
        className="flex-1 bg-ink-2 rounded-sm text-sm text-text-0 px-2 py-1.5 outline-none focus:ring-2 focus:ring-glow-2/60"
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => {
          if (pick) onPick(pick);
        }}
        disabled={!pick || busy}
        className={`${primaryBtn} py-1.5`}
      >
        LINK
      </button>
    </div>
  );
}

function DaylogActions({ p, people, places, busy, onResolve }: { p: PendingEntity; people: Option[]; places: Option[]; busy: boolean; onResolve: (action: "create_new" | "link_existing" | "reject", extra?: ResolveExtra) => void }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [text, setText] = useState(ad(p, "text") ?? p.entity_name);
  const [kind, setKind] = useState(ad(p, "kind") ?? "other");
  const scenes = Array.isArray(p.additional_data?.scenes) ? (p.additional_data!.scenes as unknown[]).filter((s): s is string => typeof s === "string") : [];
  const scene = ad(p, "scene");
  const matched = p.entity_type === "daylog_person_link" ? people.find((o) => o.id === ad(p, "person_id")) : null;

  return (
    <>
      {p.entity_type === "daylog_fact" ? (
        <div className="flex flex-col sm:flex-row gap-2">
          <input value={text} onChange={(e) => setText(e.target.value)} aria-label="Fact" className="flex-1 bg-ink-2 rounded-sm text-sm text-text-0 px-2 py-1.5 outline-none focus:ring-2 focus:ring-glow-2/60" />
          <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Kind" className="bg-ink-2 rounded-sm text-xs text-text-0 px-2 py-1.5">
            {FACT_KINDS.map((k) => (
              <option key={k} value={k}>
                {k.replace("_", " ")}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="text-xs text-ink-3">
        {p.entity_type === "daylog_person_link" && <>Matched to {matched ? <Link href={`/organisation/people/${matched.id}`} className="text-ink-4 hover:text-accent">{matched.label}</Link> : "a person"}. </>}
        {p.entity_type === "daylog_new_person" && (ad(p, "note") ? <>You said: <span className="italic text-ink-4">“{ad(p, "note")}”</span>. </> : <>No one by this name in People. </>)}
        {p.entity_type === "daylog_fact" && ad(p, "subject") && <>About <span className="text-ink-4">{ad(p, "subject")}</span>. </>}
        {p.entity_type === "daylog_fact" && ad(p, "confidence") === "inferred" && <span className="italic">Inferred, not stated. </span>}
        {scenes.length > 0 && <>Scenes: {scenes.join(" · ")}</>}
        {scene && <>Scene: {scene}</>}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          disabled={busy || (p.entity_type === "daylog_fact" && !text.trim())}
          className={primaryBtn}
          onClick={() => onResolve("create_new", p.entity_type === "daylog_fact" ? { text, kind } : undefined)}
        >
          {p.entity_type === "daylog_new_person" ? "CREATE PERSON" : p.entity_type === "daylog_place" ? "CREATE PLACE" : "APPROVE"}
        </button>
        {p.entity_type !== "daylog_fact" && (
          <button type="button" disabled={busy} className={quietBtn} onClick={() => setPickerOpen((v) => !v)}>
            {p.entity_type === "daylog_person_link" ? "DIFFERENT PERSON" : "LINK TO EXISTING"}
          </button>
        )}
        <button type="button" disabled={busy} className={rejectBtn} onClick={() => onResolve("reject")}>
          REJECT
        </button>
        {pickerOpen && p.entity_type !== "daylog_fact" && (
          <Picker
            options={p.entity_type === "daylog_place" ? places : people}
            placeholder={p.entity_type === "daylog_place" ? "— Pick existing place —" : "— Pick existing person —"}
            busy={busy}
            onPick={(id) => onResolve("link_existing", { link_to_id: id })}
          />
        )}
      </div>
    </>
  );
}

function ResolveActions({
  entityType,
  people,
  busy,
  onCreate,
  onLink,
  onReject,
}: {
  entityType: EntityType;
  people: Option[];
  busy: boolean;
  onCreate: () => void;
  onLink: (id: string) => void;
  onReject: () => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button type="button" onClick={onCreate} disabled={busy} className={primaryBtn}>
        CREATE
      </button>
      <button type="button" onClick={() => setPickerOpen((v) => !v)} disabled={busy} className={quietBtn}>
        LINK TO EXISTING
      </button>
      <button type="button" onClick={onReject} disabled={busy} className={rejectBtn}>
        REJECT
      </button>
      {pickerOpen && entityType === "person" && <Picker options={people} placeholder="— Pick existing person —" busy={busy} onPick={onLink} />}
    </div>
  );
}
