"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Mono } from "@/components/dashboard/Mono";
import { PersonDrawer } from "./PersonDrawer";
import { triggerGlowPulse } from "@/lib/motion";
import type { ReviewQueueItem } from "@/lib/people/types";

export function ReviewQueue({ onResolved }: { onResolved: () => void }) {
  const [items, setItems] = useState<ReviewQueueItem[] | null>(null);
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

  async function dismissPerson(personId: string) {
    const r = await fetch(`/api/people/${personId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ needs_review: false }),
    });
    if (r.ok) {
      await load();
      onResolved();
    }
  }

  if (items === null) {
    return (
      <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-12 text-center">
        Loading…
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-12 text-center">
        Nothing in the review queue. 🌱
      </div>
    );
  }

  return (
    <>
      <ul className="flex flex-col gap-3">
        {items.map((it, i) => {
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
          return (
            <li
              key={`p:${it.person.id}:${i}`}
              className="growth-in rounded-md bg-ink-1 p-4 flex items-center gap-4"
            >
              <div className="flex-1 min-w-0">
                <div className="text-base text-text-0 font-[family-name:var(--font-display)]">
                  {name}
                </div>
                <div className="text-[11px] text-text-2 mt-0.5">
                  Auto-created — {it.mention_count} mention
                  {it.mention_count === 1 ? "" : "s"} so far
                </div>
              </div>
              <Link
                href={`/compost/people/${it.person.id}`}
                className="px-3 py-1.5 rounded-sm bg-glow-2 text-text-0 hover:bg-glow-1 text-xs font-[family-name:var(--font-mono)] tracking-[0.1em]"
              >
                OPEN
              </Link>
              <button
                type="button"
                onClick={() => void dismissPerson(it.person.id)}
                className="px-3 py-1.5 rounded-sm border border-ink-4 text-text-1 hover:text-text-0 text-xs font-[family-name:var(--font-mono)] tracking-[0.1em]"
              >
                LOOKS FINE
              </button>
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
