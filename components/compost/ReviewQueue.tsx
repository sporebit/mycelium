"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Mono } from "@/components/dashboard/Mono";
import { PersonDrawer } from "./PersonDrawer";
import { triggerGlowPulse } from "@/lib/motion";
import type { ReviewQueueItem } from "@/lib/people/types";

/**
 * The People review queue: ambiguous mentions (pick a person or create one)
 * and auto-created people (Keep / Archive / Reject, people-review R6).
 * `hidePeople` leaves the people to the caller's card grid, which can
 * select them in bulk; only the mentions render here.
 */
export function ReviewQueue({ onResolved, hidePeople = false }: { onResolved: () => void; hidePeople?: boolean }) {
  const [items, setItems] = useState<ReviewQueueItem[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  /** When set, render the create-person drawer with first_name pre-filled
   *  from the ambiguous mention's raw_alias. On save, the new person's id
   *  is fed back to the resolve endpoint and the mention disappears. */
  const [createFor, setCreateFor] = useState<{
    mentionId: string;
    rawAlias: string;
  } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/people/review-queue", { cache: "no-store" });
      if (!r.ok) return;
      const j = (await r.json()) as { items: ReviewQueueItem[] };
      setItems(j.items ?? []);
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const r = await fetch("/api/people/review-queue", {
          cache: "no-store",
        });
        if (!r.ok || !mounted) return;
        const j = (await r.json()) as { items: ReviewQueueItem[] };
        if (mounted) setItems(j.items ?? []);
      } catch {
        if (mounted) setItems([]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  async function resolve(mentionId: string, personId: string) {
    const r = await fetch(`/api/people/mentions/${mentionId}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ person_id: personId }),
    });
    if (r.ok) {
      await load();
      onResolved();
    }
  }

  /** After the create drawer saves, link the brand-new person to the
   *  pending mention. We pass create_alias=false because the drawer already
   *  registered the raw_alias as a non-primary alias on the new row. */
  async function resolveNewlyCreated(mentionId: string, newPersonId: string) {
    if (!newPersonId) return;
    const r = await fetch(`/api/people/mentions/${mentionId}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ person_id: newPersonId, create_alias: false }),
    });
    if (r.ok) {
      await load();
      onResolved();
    }
  }

  /** Keep clears the flag; Archive hides and stops matching; Reject bins and ignores the words (R6). */
  async function act(personId: string, action: "keep" | "archive" | "reject") {
    if (action === "reject" && !window.confirm("Reject this person? They go to the bin and their name is ignored from now on.")) return;
    setBusyId(personId);
    try {
      const r =
        action === "reject"
          ? await fetch(`/api/people/${personId}?reject=1`, { method: "DELETE" })
          : await fetch(`/api/people/${personId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(action === "keep" ? { needs_review: false } : { archived: true }),
            });
      if (r.ok) {
        await load();
        onResolved();
      }
    } finally {
      setBusyId(null);
    }
  }

  if (items === null) {
    if (hidePeople) return null;
    return (
      <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-12 text-center">
        Loading…
      </div>
    );
  }
  const visible = hidePeople ? items.filter((it) => it.kind === "ambiguous_mention") : items;
  if (visible.length === 0) {
    if (hidePeople) return null;
    return (
      <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-12 text-center">
        Nothing in the review queue. 🌱
      </div>
    );
  }

  return (
    <>
      <ul className="flex flex-col gap-3">
        {visible.map((it, i) => {
          if (it.kind === "ambiguous_mention") {
            return (
              <li
                key={`m:${it.mention.id}`}
                className="growth-in rounded-md bg-ink-1 p-4 flex flex-col gap-2"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <Mono className="text-[10px] uppercase tracking-[0.18em] text-warn">
                    Ambiguous mention
                  </Mono>
                  <Mono className="text-[10px] text-text-2">
                    {new Date(it.created_at).toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                    })}
                  </Mono>
                </div>
                {it.snippet && (
                  <p className="text-sm text-text-1 italic font-[family-name:var(--font-display)] leading-snug">
                    &ldquo;{it.snippet.slice(0, 200)}
                    {it.snippet.length > 200 ? "…" : ""}&rdquo;
                  </p>
                )}
                <div className="text-xs text-text-2">
                  Said:{" "}
                  <span className="text-text-0">
                    &ldquo;{it.mention.raw_alias}&rdquo;
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  {it.candidates.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={(e) => {
                        triggerGlowPulse(e.currentTarget);
                        void resolve(it.mention.id, c.id);
                      }}
                      className="px-3 py-1.5 rounded-sm bg-ink-2 text-text-0 hover:bg-glow-3 text-xs font-[family-name:var(--font-mono)]"
                    >
                      {c.display_name ||
                        `${c.first_name} ${c.last_name ?? ""}`.trim()}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={(e) => {
                      triggerGlowPulse(e.currentTarget);
                      setCreateFor({
                        mentionId: it.mention.id,
                        rawAlias: it.mention.raw_alias,
                      });
                    }}
                    className="px-3 py-1.5 rounded-sm border border-ink-4 text-text-1 hover:text-text-0 hover:bg-ink-2 text-xs font-[family-name:var(--font-mono)]"
                  >
                    + Create new &ldquo;{it.mention.raw_alias}&rdquo;
                  </button>
                </div>
              </li>
            );
          }
          // auto_created_person
          const name =
            it.person.display_name ||
            [it.person.first_name, it.person.last_name].filter(Boolean).join(" ");
          const busy = busyId === it.person.id;
          const btn = "px-3 py-1.5 rounded-sm border border-ink-4 text-text-1 hover:text-text-0 hover:bg-ink-2 disabled:opacity-50 text-xs font-[family-name:var(--font-mono)] tracking-[0.1em]";
          return (
            <li
              key={`p:${it.person.id}:${i}`}
              className="growth-in rounded-md bg-ink-1 p-4 flex flex-wrap items-center gap-4"
            >
              <div className="flex-1 min-w-0">
                <div className="text-base text-text-0 font-[family-name:var(--font-display)]">
                  {name}
                </div>
                <div className="text-[11px] text-text-2 mt-0.5">
                  Auto-created — {it.mention_count} mention
                  {it.mention_count === 1 ? "" : "s"} so far
                </div>
                {it.snippet && (
                  <p className="text-xs text-text-1 italic font-[family-name:var(--font-display)] leading-snug mt-1 truncate" title={it.snippet}>
                    &ldquo;{it.snippet.slice(0, 160)}
                    {it.snippet.length > 160 ? "…" : ""}&rdquo;
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Link
                  href={`/organisation/people/${it.person.id}`}
                  className="px-3 py-1.5 rounded-sm bg-glow-2 text-text-0 hover:bg-glow-1 text-xs font-[family-name:var(--font-mono)] tracking-[0.1em]"
                >
                  OPEN
                </Link>
                <button type="button" disabled={busy} onClick={() => void act(it.person.id, "keep")} className={btn} title="A real person — clear the review flag">
                  KEEP
                </button>
                <button type="button" disabled={busy} onClick={() => void act(it.person.id, "archive")} className={btn} title="Hide and stop matching; history stays">
                  ARCHIVE
                </button>
                <button type="button" disabled={busy} onClick={() => void act(it.person.id, "reject")} className={`${btn} hover:border-error/60 hover:text-error`} title="Not a person — bin it and ignore the words">
                  REJECT
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {createFor && (
        <PersonDrawer
          mode={{ kind: "create" }}
          prefillFirstName={createFor.rawAlias}
          onClose={() => setCreateFor(null)}
          onSaved={(newPersonId) => {
            const pending = createFor;
            setCreateFor(null);
            void resolveNewlyCreated(pending.mentionId, newPersonId);
          }}
        />
      )}
    </>
  );
}
