"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Mono } from "@/components/dashboard/Mono";

type PendingEntity = {
  id: string;
  capture_id: string | null;
  entity_type: "person" | "project" | "workout" | "food";
  entity_name: string;
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

/**
 * Tab body for /compost/review's "NEW ENTITIES" view. Each row is one
 * voice/Telegram capture that mentioned a name we couldn't resolve to
 * an existing person; the user can CREATE, LINK to an existing
 * person, or REJECT.
 */
export function PendingEntitiesList() {
  const [pending, setPending] = useState<PendingEntity[] | null>(null);
  const [people, setPeople] = useState<PersonLite[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [pRes, peopleRes] = await Promise.all([
        fetch("/api/pending-entities", { cache: "no-store" }),
        fetch("/api/people?limit=500", { cache: "no-store" }),
      ]);
      const pj = (await pRes.json().catch(() => ({}))) as {
        pending?: PendingEntity[];
      };
      const peopleJson = (await peopleRes.json().catch(() => ({}))) as {
        people?: PersonLite[];
      };
      setPending(Array.isArray(pj.pending) ? pj.pending : []);
      setPeople(Array.isArray(peopleJson.people) ? peopleJson.people : []);
    } catch {
      setPending([]);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  async function resolve(
    p: PendingEntity,
    action: "create_new" | "link_existing" | "reject",
    linkToId?: string,
  ) {
    setError(null);
    setBusyId(p.id);
    try {
      const r = await fetch(`/api/pending-entities/${p.id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, link_to_id: linkToId }),
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        setError(j.error ?? "Resolve failed");
        return;
      }
      setPending((cur) => (cur ?? []).filter((x) => x.id !== p.id));
    } finally {
      setBusyId(null);
    }
  }

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
          No new entities waiting. Voice captures mentioning names we
          recognise route automatically.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-danger font-[family-name:var(--font-mono)]">
          ⚠ {error}
        </div>
      )}
      <ul className="flex flex-col gap-2">
        {pending.map((p) => (
          <li
            key={p.id}
            className="rounded-md bg-ink-1 border border-ink-2 px-3 py-3 flex flex-col gap-2"
          >
            <div className="flex items-baseline justify-between gap-2 flex-wrap">
              <div className="flex items-baseline gap-2">
                <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
                  {p.entity_type}
                </span>
                <span className="text-base text-ink-4">{p.entity_name}</span>
              </div>
              <Mono className="text-[10px] text-ink-3">
                {relativeDate(p.created_at)}
              </Mono>
            </div>

            {p.capture && (
              <Link
                href={`/compost/captures?focus=${p.capture.id}`}
                className="block rounded-md bg-ink-0/40 border border-ink-2/60 px-2 py-1.5 text-xs text-ink-3 italic font-[family-name:var(--font-display)] hover:border-ink-3 transition-colors"
              >
                {p.capture.raw_text?.slice(0, 240) || "(no transcription)"}
                <span className="ml-2 not-italic text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
                  · {p.capture.source}
                </span>
              </Link>
            )}

            <ResolveActions
              entityType={p.entity_type}
              people={people}
              busy={busyId === p.id}
              onCreate={() => void resolve(p, "create_new")}
              onLink={(id) => void resolve(p, "link_existing", id)}
              onReject={() => void resolve(p, "reject")}
            />
          </li>
        ))}
      </ul>
    </div>
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
  entityType: PendingEntity["entity_type"];
  people: PersonLite[];
  busy: boolean;
  onCreate: () => void;
  onLink: (id: string) => void;
  onReject: () => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pick, setPick] = useState<string>("");
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        type="button"
        onClick={onCreate}
        disabled={busy}
        className="px-2 py-1 rounded-md bg-accent/15 border border-accent/40 text-accent hover:bg-accent/25 disabled:opacity-40 text-[10px] uppercase tracking-[0.18em] font-[family-name:var(--font-mono)]"
      >
        CREATE
      </button>
      <button
        type="button"
        onClick={() => setPickerOpen((v) => !v)}
        disabled={busy}
        className="px-2 py-1 rounded-md bg-ink-0/40 border border-ink-2 hover:border-ink-3 text-ink-3 hover:text-ink-4 disabled:opacity-40 text-[10px] uppercase tracking-[0.18em] font-[family-name:var(--font-mono)]"
      >
        LINK TO EXISTING
      </button>
      <button
        type="button"
        onClick={onReject}
        disabled={busy}
        className="px-2 py-1 rounded-md text-ink-3 hover:text-danger disabled:opacity-40 text-[10px] uppercase tracking-[0.18em] font-[family-name:var(--font-mono)]"
      >
        REJECT
      </button>
      {pickerOpen && entityType === "person" && (
        <div className="flex items-center gap-2 w-full">
          <select
            value={pick}
            onChange={(e) => setPick(e.target.value)}
            className="flex-1 bg-ink-2 rounded-sm text-sm text-text-0 px-2 py-1.5 outline-none focus:ring-2 focus:ring-glow-2/60"
          >
            <option value="">— Pick existing person —</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {personLabel(p)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              if (pick) onLink(pick);
            }}
            disabled={!pick || busy}
            className="px-2 py-1.5 rounded-md bg-accent/15 border border-accent/40 text-accent disabled:opacity-40 text-[10px] uppercase tracking-[0.18em] font-[family-name:var(--font-mono)]"
          >
            LINK
          </button>
        </div>
      )}
    </div>
  );
}
