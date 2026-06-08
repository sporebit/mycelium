"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Mono } from "@/components/dashboard/Mono";
import { PendingEntitiesList } from "./PendingEntitiesList";

type Classification = {
  kind?: string;
  urgency?: string;
  title?: string;
  summary?: string;
  entities?: string[];
  entity_name?: string | null;
  mentions?: Array<{ raw: string; name_hint: string }>;
  date_inferred?: string | null;
  confidence?: string;
  session_intent?: string;
  mood?: string | null;
  // arbitrary other fields the classifier may have written
  [key: string]: unknown;
};

type Capture = {
  id: string;
  source: string;
  raw_text: string | null;
  audio_url: string | null;
  classification: Classification | null;
  llm_source: string | null;
  routed_to: string | null;
  routed_id: string | null;
  reviewed_at: string | null;
  discarded_at: string | null;
  created_at: string;
};

type Tab = "needs_review" | "all" | "entities";

type Toast = { kind: "ok" | "error"; text: string } | null;

const KIND_OPTIONS = [
  "task",
  "journal",
  "workout",
  "purchase",
  "decision",
  "capture",
  "note",
  "other",
];
const URGENCY_OPTIONS = ["today", "this_week", "this_month", "someday"];

function relTime(iso: string): string {
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

function confidenceTone(c: string | undefined): string {
  if (c === "high") return "bg-ok/15 text-ok border-ok/40";
  if (c === "medium") return "bg-accent/15 text-accent border-accent/40";
  if (c === "low") return "bg-warn/15 text-warn border-warn/40";
  if (c === "ambiguous") return "bg-danger/15 text-danger border-danger/40";
  return "bg-ink-2 text-ink-3 border-ink-2";
}

function inferConfidence(c: Classification | null): string {
  if (!c) return "unknown";
  if (typeof c.confidence === "string") return c.confidence;
  if (c.session_intent === "ambiguous" || c.kind === "ambiguous") {
    return "ambiguous";
  }
  return "—";
}

function routedTarget(c: Capture): string {
  if (!c.routed_to) return "—";
  if (!c.routed_id) return c.routed_to;
  return `${c.routed_to} · ${c.routed_id.slice(0, 8)}`;
}

export function CaptureReviewClient() {
  const [tab, setTab] = useState<Tab>("needs_review");
  const [captures, setCaptures] = useState<Capture[] | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Inline fetch keeps setState calls inside async callbacks (not the
  // synchronous effect body) — required to satisfy the React 19
  // `react-hooks/set-state-in-effect` lint rule. Showing the loading
  // spinner on tab-switch is handled by clearing captures *inside* the
  // .then() of the request, immediately after the previous request's
  // promise resolves — so the user sees a brief loading state but we
  // don't synchronously setState in the effect body.
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      if (!cancelled) setLoading(true);
    }, 0);
    fetch(`/api/captures/review?tab=${tab}&limit=50`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { captures?: Capture[] }) => {
        if (cancelled) return;
        setCaptures(Array.isArray(j?.captures) ? j.captures : []);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setCaptures([]);
        setLoading(false);
      });
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [tab]);

  const reload = useCallback(() => {
    fetch(`/api/captures/review?tab=${tab}&limit=50`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { captures?: Capture[] }) => {
        setCaptures(Array.isArray(j?.captures) ? j.captures : []);
      })
      .catch(() => {});
  }, [tab]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(id);
  }, [toast]);

  function showToast(kind: "ok" | "error", text: string) {
    setToast({ kind, text });
  }

  async function submitAction(
    capture: Capture,
    action: "approve" | "reroute" | "discard",
    draft: Classification,
  ) {
    if (busyId) return;
    setBusyId(capture.id);
    try {
      const body: Record<string, unknown> = { action };
      if (action !== "discard") {
        if (typeof draft.kind === "string") body.kind = draft.kind;
        if (typeof draft.urgency === "string") body.urgency = draft.urgency;
        if (typeof draft.title === "string") body.title = draft.title;
        if (typeof draft.summary === "string") body.summary = draft.summary;
        if (Array.isArray(draft.entities)) body.entities = draft.entities;
        if (Array.isArray(draft.mentions)) body.mentions = draft.mentions;
        if (draft.date_inferred !== undefined) {
          body.date_inferred = draft.date_inferred;
        }
      }
      const r = await fetch(`/api/captures/${capture.id}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await r.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!r.ok || !j.ok) {
        showToast("error", j.error ?? `${action} failed (${r.status})`);
        return;
      }
      if (tab === "needs_review" || action === "discard") {
        setCaptures((cur) => (cur ?? []).filter((c) => c.id !== capture.id));
      } else {
        // In the ALL tab, approve/reroute keep the row visible — refresh it.
        reload();
      }
      showToast("ok", `${action.toUpperCase()} ·  ${capture.id.slice(0, 6)}`);
    } finally {
      setBusyId(null);
    }
  }

  const total = captures?.length ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <h1 className="font-[family-name:var(--font-display)] italic text-2xl text-text-0">
            Capture review
          </h1>
          {captures !== null && (
            <Mono className="text-[10px] text-ink-3">{total} SHOWN</Mono>
          )}
        </div>
        <div
          role="tablist"
          aria-label="Filter"
          className="flex rounded-md border border-ink-2 overflow-hidden text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em]"
        >
          {(
            [
              { v: "needs_review", label: "NEEDS REVIEW" },
              { v: "all", label: "ALL" },
              { v: "entities", label: "NEW ENTITIES" },
            ] as const
          ).map((t) => {
            const active = tab === t.v;
            return (
              <button
                key={t.v}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.v)}
                className={`px-3 py-2 transition-colors ${
                  active
                    ? "bg-accent/15 text-accent"
                    : "text-ink-3 hover:text-ink-4 hover:bg-ink-2/40"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </header>

      {tab === "entities" ? (
        <PendingEntitiesList />
      ) : captures === null || loading ? (
        <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-12 text-center">
          Loading…
        </div>
      ) : captures.length === 0 ? (
        <div className="rounded-md bg-ink-1 p-8 text-center">
          <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
            {tab === "needs_review"
              ? "Nothing needs review — every capture has been triaged."
              : "No captures yet."}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {captures.map((c) => (
            <li key={c.id}>
              <ReviewCard
                capture={c}
                busy={busyId === c.id}
                onAction={(action, draft) => submitAction(c, action, draft)}
              />
            </li>
          ))}
        </ul>
      )}

      {toast && (
        <div
          role="status"
          className={`growth-in fixed bottom-6 left-1/2 -translate-x-1/2 z-[120] px-4 py-2 rounded-md text-sm shadow-2xl font-[family-name:var(--font-mono)] ${
            toast.kind === "ok"
              ? "bg-ok/20 text-ok border border-ok/40"
              : "bg-danger/20 text-danger border border-danger/40"
          }`}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}

function ReviewCard({
  capture,
  busy,
  onAction,
}: {
  capture: Capture;
  busy: boolean;
  onAction: (
    action: "approve" | "reroute" | "discard",
    draft: Classification,
  ) => void;
}) {
  const cls = capture.classification ?? {};
  const [kind, setKind] = useState<string>(
    typeof cls.kind === "string" ? cls.kind : "capture",
  );
  const [urgency, setUrgency] = useState<string>(
    typeof cls.urgency === "string" ? cls.urgency : "someday",
  );
  const [title, setTitle] = useState<string>(
    typeof cls.title === "string" ? cls.title : "",
  );
  const [entities, setEntities] = useState<string[]>(
    Array.isArray(cls.entities)
      ? cls.entities
      : typeof cls.entity_name === "string" && cls.entity_name
        ? [cls.entity_name]
        : [],
  );
  const [mentions, setMentions] = useState<
    Array<{ raw: string; name_hint: string }>
  >(Array.isArray(cls.mentions) ? cls.mentions : []);
  const [dateInferred, setDateInferred] = useState<string>(
    typeof cls.date_inferred === "string" ? cls.date_inferred : "",
  );

  const draft: Classification = useMemo(
    () => ({
      kind,
      urgency,
      title,
      entities,
      mentions,
      date_inferred: dateInferred || null,
    }),
    [kind, urgency, title, entities, mentions, dateInferred],
  );

  const confidence = inferConfidence(cls);
  const isReviewed = !!capture.reviewed_at;

  return (
    <article className="bg-ink-1 rounded-md p-4 flex flex-col gap-3">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Mono className="text-[10px] text-ink-3">{relTime(capture.created_at)}</Mono>
          <span className="text-[10px] uppercase tracking-[0.15em] text-ink-3 font-[family-name:var(--font-mono)]">
            · {capture.source}
          </span>
          {capture.llm_source && (
            <span className="text-[10px] uppercase tracking-[0.15em] text-ink-3 font-[family-name:var(--font-mono)]">
              · via {capture.llm_source}
            </span>
          )}
          {isReviewed && (
            <span className="text-[10px] uppercase tracking-[0.15em] text-ok font-[family-name:var(--font-mono)] px-1.5 py-0.5 rounded-md border border-ok/40 bg-ok/15">
              REVIEWED
            </span>
          )}
        </div>
        <span
          className={`text-[10px] uppercase tracking-[0.15em] font-[family-name:var(--font-mono)] px-1.5 py-0.5 rounded-md border ${confidenceTone(
            confidence,
          )}`}
        >
          {confidence}
        </span>
      </header>

      <div className="rounded-md border border-ink-2 bg-ink-0/40 px-3 py-2 text-sm text-text-0 whitespace-pre-wrap break-words">
        {capture.raw_text || (
          <span className="text-ink-3 italic">(no text)</span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Kind">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="w-full bg-ink-2 rounded-sm text-sm text-text-0 px-3 py-2 outline outline-1 outline-transparent focus:outline-glow-2"
          >
            {KIND_OPTIONS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Urgency">
          <select
            value={urgency}
            onChange={(e) => setUrgency(e.target.value)}
            className="w-full bg-ink-2 rounded-sm text-sm text-text-0 px-3 py-2 outline outline-1 outline-transparent focus:outline-glow-2"
          >
            {URGENCY_OPTIONS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Title">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full bg-ink-2 rounded-sm text-sm text-text-0 px-3 py-2 outline outline-1 outline-transparent focus:outline-glow-2"
        />
      </Field>

      <Field label="Entities">
        <TagInput
          values={entities}
          onChange={setEntities}
          placeholder="Add entity, press Enter"
        />
      </Field>

      <Field label="People mentioned">
        <MentionInput values={mentions} onChange={setMentions} />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Date inferred">
          <input
            type="date"
            value={dateInferred}
            onChange={(e) => setDateInferred(e.target.value)}
            className="w-full bg-ink-2 rounded-sm text-sm text-text-0 px-3 py-2 outline outline-1 outline-transparent focus:outline-glow-2"
          />
        </Field>
        <Field label="Routed to">
          <div className="text-sm text-text-1 px-3 py-2 rounded-sm bg-ink-0/40 border border-ink-2 font-[family-name:var(--font-mono)] truncate">
            {routedTarget(capture)}
          </div>
        </Field>
      </div>

      <footer className="flex items-center gap-2 pt-1 flex-wrap">
        <button
          type="button"
          disabled={busy}
          onClick={() => onAction("discard", draft)}
          className="px-3 py-2 rounded-sm border border-danger/40 text-danger text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] hover:bg-danger/15 disabled:opacity-40"
        >
          DISCARD
        </button>
        <div className="flex-1" />
        <button
          type="button"
          disabled={busy}
          onClick={() => onAction("reroute", draft)}
          className="px-3 py-2 rounded-sm border border-warn/40 text-warn text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] hover:bg-warn/15 disabled:opacity-40"
          title="Save edits and re-run routing"
        >
          RE-ROUTE
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onAction("approve", draft)}
          className="px-4 py-2 rounded-sm bg-glow-2 text-text-0 hover:bg-glow-1 text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] disabled:opacity-40"
        >
          {busy ? "…" : "APPROVE"}
        </button>
      </footer>
    </article>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
        {label}
      </span>
      {children}
    </label>
  );
}

function TagInput({
  values,
  onChange,
  placeholder,
}: {
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");
  function commit() {
    const v = draft.trim();
    if (!v) return;
    if (values.includes(v)) {
      setDraft("");
      return;
    }
    onChange([...values, v]);
    setDraft("");
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-sm bg-ink-2 px-2 py-1.5 outline outline-1 outline-transparent focus-within:outline-glow-2">
      {values.map((v) => (
        <span
          key={v}
          className="inline-flex items-center gap-1 text-[11px] font-[family-name:var(--font-mono)] px-1.5 py-0.5 rounded-md border border-accent/40 bg-accent/15 text-accent"
        >
          {v}
          <button
            type="button"
            onClick={() => onChange(values.filter((x) => x !== v))}
            aria-label={`Remove ${v}`}
            className="text-accent/70 hover:text-accent"
          >
            ×
          </button>
        </span>
      ))}
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commit();
          } else if (e.key === "Backspace" && !draft && values.length) {
            onChange(values.slice(0, -1));
          }
        }}
        onBlur={commit}
        placeholder={placeholder}
        className="flex-1 min-w-[100px] bg-transparent outline-none text-sm text-text-0 placeholder:text-text-3"
      />
    </div>
  );
}

type Person = { id: string; name: string };

type PeopleApiRow = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  display_name?: string | null;
};

function personDisplayName(row: PeopleApiRow): string {
  if (row.display_name && row.display_name.trim()) return row.display_name.trim();
  const fn = row.first_name?.trim() ?? "";
  const ln = row.last_name?.trim() ?? "";
  return [fn, ln].filter(Boolean).join(" ").trim() || "(unnamed)";
}

function MentionInput({
  values,
  onChange,
}: {
  values: Array<{ raw: string; name_hint: string }>;
  onChange: (next: Array<{ raw: string; name_hint: string }>) => void;
}) {
  const [draft, setDraft] = useState("");
  const [people, setPeople] = useState<Person[]>([]);

  // Pull the user's people once so the tag input can resolve names to a
  // known canonical form when the typed hint matches.
  useEffect(() => {
    let mounted = true;
    fetch("/api/people")
      .then((r) => r.json())
      .then((j: { people?: PeopleApiRow[] }) => {
        if (!mounted) return;
        const rows = Array.isArray(j.people) ? j.people : [];
        setPeople(
          rows.map((r) => ({ id: r.id, name: personDisplayName(r) })),
        );
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  function commit() {
    const v = draft.trim();
    if (!v) return;
    // Try to match against people; otherwise fall back to the typed string.
    const match = people.find(
      (p) => p.name.toLowerCase() === v.toLowerCase(),
    );
    const hint = match ? match.name : v;
    if (values.some((m) => m.name_hint.toLowerCase() === hint.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...values, { raw: v, name_hint: hint }]);
    setDraft("");
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 rounded-sm bg-ink-2 px-2 py-1.5 outline outline-1 outline-transparent focus-within:outline-glow-2">
        {values.map((m, i) => {
          const matched = people.some(
            (p) => p.name.toLowerCase() === m.name_hint.toLowerCase(),
          );
          return (
            <span
              key={`${m.name_hint}-${i}`}
              className={`inline-flex items-center gap-1 text-[11px] font-[family-name:var(--font-mono)] px-1.5 py-0.5 rounded-md border ${
                matched
                  ? "border-accent/40 bg-accent/15 text-accent"
                  : "border-ink-3 bg-ink-0/40 text-ink-4"
              }`}
              title={matched ? "Linked to people record" : "Not linked"}
            >
              {matched ? "◆" : "·"} {m.name_hint}
              <button
                type="button"
                onClick={() =>
                  onChange(values.filter((_, j) => j !== i))
                }
                aria-label={`Remove ${m.name_hint}`}
                className="opacity-70 hover:opacity-100"
              >
                ×
              </button>
            </span>
          );
        })}
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              commit();
            } else if (e.key === "Backspace" && !draft && values.length) {
              onChange(values.slice(0, -1));
            }
          }}
          onBlur={commit}
          placeholder="Add name, press Enter"
          list="people-suggestions"
          className="flex-1 min-w-[120px] bg-transparent outline-none text-sm text-text-0 placeholder:text-text-3"
        />
        <datalist id="people-suggestions">
          {people.map((p) => (
            <option key={p.id} value={p.name} />
          ))}
        </datalist>
      </div>
      {values.some(
        (m) =>
          !people.some(
            (p) => p.name.toLowerCase() === m.name_hint.toLowerCase(),
          ),
      ) && (
        <Link
          href="/organisation/people"
          className="text-[10px] uppercase tracking-[0.18em] text-ink-3 hover:text-ink-4 font-[family-name:var(--font-mono)] mt-1 inline-block"
        >
          Manage people →
        </Link>
      )}
    </div>
  );
}
