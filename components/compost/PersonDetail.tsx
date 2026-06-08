"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mono } from "@/components/dashboard/Mono";
import { PersonDrawer } from "./PersonDrawer";
import { triggerGlowPulse } from "@/lib/motion";
import type {
  MentionWithSnippet,
  PersonWithAliases,
} from "@/lib/people/types";

function relativeDate(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const d = ms / 86_400_000;
  if (d < 1) return "today";
  if (d < 2) return "yesterday";
  if (d < 14) return `${Math.floor(d)}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const SOURCE_ICON: Record<string, string> = {
  capture: "✏",
  task: "□",
  journal: "📓",
};

function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const palette = [
    "bg-glow-3 text-glow-1",
    "bg-warn/20 text-warn",
    "bg-info/20 text-info",
    "bg-ink-3 text-text-1",
  ];
  return palette[h % palette.length];
}

export function PersonDetail({ id }: { id: string }) {
  const router = useRouter();
  const [person, setPerson] = useState<PersonWithAliases | null>(null);
  const [mentions, setMentions] = useState<MentionWithSnippet[] | null>(null);
  const [aliasDraft, setAliasDraft] = useState("");
  const [notesDraft, setNotesDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadPerson = useCallback(async () => {
    try {
      const r = await fetch(`/api/people/${id}`, { cache: "no-store" });
      if (!r.ok) return;
      const j = (await r.json()) as { person: PersonWithAliases };
      setPerson(j.person);
      setNotesDraft(j.person.notes ?? "");
    } catch {
      /* ignore */
    }
  }, [id]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [pRes, mRes] = await Promise.all([
          fetch(`/api/people/${id}`, { cache: "no-store" }),
          fetch(`/api/people/${id}/mentions?limit=50`, { cache: "no-store" }),
        ]);
        if (!mounted) return;
        if (pRes.ok) {
          const j = (await pRes.json()) as { person: PersonWithAliases };
          if (mounted) {
            setPerson(j.person);
            setNotesDraft(j.person.notes ?? "");
          }
        }
        if (mRes.ok) {
          const j = (await mRes.json()) as { mentions: MentionWithSnippet[] };
          if (mounted) setMentions(j.mentions ?? []);
        } else if (mounted) {
          setMentions([]);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      mounted = false;
    };
  }, [id]);

  async function addAlias() {
    const alias = aliasDraft.trim();
    if (!alias) return;
    const r = await fetch(`/api/people/${id}/aliases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alias }),
    });
    if (r.ok) {
      setAliasDraft("");
      await loadPerson();
    }
  }

  async function removeAlias(aliasId: string) {
    const r = await fetch(`/api/people/${id}/aliases/${aliasId}`, {
      method: "DELETE",
    });
    if (r.ok) await loadPerson();
  }

  function scheduleNotesSave(value: string) {
    setNotesDraft(value);
    if (notesTimer.current) clearTimeout(notesTimer.current);
    notesTimer.current = setTimeout(async () => {
      await fetch(`/api/people/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: value }),
      });
    }, 600);
  }

  async function deletePerson() {
    if (!person) return;
    const name =
      person.display_name ||
      [person.first_name, person.last_name].filter(Boolean).join(" ");
    const mentionCount = mentions?.length ?? 0;
    const ok = window.confirm(
      `Delete ${name}? This will also remove ${mentionCount} linked mention${
        mentionCount === 1 ? "" : "s"
      }.`
    );
    if (!ok) return;
    const r = await fetch(`/api/people/${id}`, { method: "DELETE" });
    if (r.ok) router.push("/organisation/people");
  }

  if (!person) {
    return (
      <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-12 text-center">
        Loading…
      </div>
    );
  }

  const name =
    person.display_name ||
    [person.first_name, person.last_name].filter(Boolean).join(" ");
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/organisation/people"
        className="text-[11px] text-ink-3 hover:text-ink-4 font-[family-name:var(--font-mono)] tracking-[0.18em] self-start"
      >
        ← PEOPLE
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* LEFT — identity + contact */}
        <section className="rounded-md bg-ink-1 p-6 flex flex-col gap-4">
          <div className="flex flex-col items-center text-center gap-3">
            <span
              className={`h-20 w-20 rounded-full flex items-center justify-center text-2xl font-[family-name:var(--font-display)] ${avatarColor(name)}`}
            >
              {initials}
            </span>
            <div>
              <h1 className="font-[family-name:var(--font-display)] text-3xl text-text-0">
                {name}
              </h1>
              {person.relationship && (
                <div className="text-[11px] uppercase tracking-[0.18em] text-warn font-[family-name:var(--font-mono)] mt-1">
                  {person.relationship}
                </div>
              )}
              {person.needs_review && (
                <div className="text-[10px] uppercase tracking-[0.18em] text-warn font-[family-name:var(--font-mono)] mt-2">
                  ⚠ needs review
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="px-3 py-1.5 rounded-sm border border-ink-4 text-xs text-text-1 hover:text-text-0 hover:bg-ink-2 font-[family-name:var(--font-mono)] tracking-[0.1em]"
              >
                EDIT
              </button>
              <button
                type="button"
                onClick={() => void deletePerson()}
                className="px-3 py-1.5 rounded-sm border border-ink-4 text-xs text-text-1 hover:border-error/60 hover:text-error font-[family-name:var(--font-mono)] tracking-[0.1em]"
              >
                DELETE
              </button>
            </div>
          </div>

          <ContactField label="Phone" value={person.phone} />
          <ContactField label="Email" value={person.email} />
          <ContactField label="Birthday" value={person.birthday} />
          <ContactField label="Address" value={person.address} multiline />
          <ContactField label="Where we met" value={person.where_we_met} />
          <ContactField label="Mutual interests" value={person.mutual_interests} />
        </section>

        {/* MIDDLE — aliases + notes */}
        <section className="flex flex-col gap-4">
          <div className="rounded-md bg-ink-1 p-6">
            <div className="card-eyebrow mb-3">Aliases</div>
            <div className="flex flex-wrap items-center gap-2">
              {person.aliases.map((a) => (
                <span
                  key={a.id}
                  className="inline-flex items-center gap-1.5 rounded-full bg-ink-2 text-text-1 text-xs px-2.5 py-1 font-[family-name:var(--font-mono)]"
                >
                  {a.alias}
                  {a.is_primary && (
                    <Mono className="text-[9px] text-glow-1 uppercase tracking-[0.18em]">
                      primary
                    </Mono>
                  )}
                  {!a.is_primary && person.aliases.length > 1 && (
                    <button
                      type="button"
                      onClick={() => void removeAlias(a.id)}
                      className="text-text-2 hover:text-error"
                      aria-label={`Remove ${a.alias}`}
                    >
                      ×
                    </button>
                  )}
                </span>
              ))}
              <input
                type="text"
                value={aliasDraft}
                onChange={(e) => setAliasDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void addAlias();
                  }
                }}
                placeholder="+ add alias"
                className="bg-transparent outline-none text-sm text-text-0 placeholder:text-text-3 min-w-[100px]"
              />
            </div>
          </div>

          <div className="rounded-md bg-ink-1 p-6">
            <div className="card-eyebrow mb-3">Notes</div>
            <textarea
              value={notesDraft}
              onChange={(e) => scheduleNotesSave(e.target.value)}
              rows={6}
              placeholder="Anything worth remembering…"
              className="w-full bg-ink-2 rounded-sm text-sm text-text-0 placeholder:text-text-3 placeholder:italic px-3 py-2 outline outline-1 outline-transparent focus:outline-glow-2 resize-y"
            />
          </div>
        </section>

        {/* RIGHT — mentions */}
        <section className="rounded-md bg-ink-1 p-6">
          <div className="card-eyebrow mb-3 flex items-center justify-between">
            <span>Mentions</span>
            <Mono className="text-[10px] text-text-2">
              {mentions === null ? "…" : mentions.length}
            </Mono>
          </div>
          {mentions === null ? (
            <div className="text-xs text-ink-3 italic font-[family-name:var(--font-display)]">
              Loading…
            </div>
          ) : mentions.length === 0 ? (
            <div className="text-xs text-ink-3 italic font-[family-name:var(--font-display)]">
              No mentions yet.
            </div>
          ) : (
            <ul className="flex flex-col divide-y divide-ink-2">
              {mentions.map((m) => {
                // Each mention links to the specific source record.
                // Captures route through `?focus=<id>` which the
                // captures client honours by opening that capture's
                // detail expanded.
                const href =
                  m.source_type === "task"
                    ? `/organisation/tasks?task=${m.source_id}`
                    : m.source_type === "capture"
                    ? `/organisation/captures?focus=${m.source_id}`
                    : m.source_type === "journal"
                      ? `/journal?focus=${m.source_id}`
                      : "/organisation/captures";
                return (
                  <li key={m.id} className="growth-in py-3 first:pt-0 last:pb-0">
                    <Link href={href} className="block group">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[10px] uppercase tracking-[0.15em] text-text-2 font-[family-name:var(--font-mono)]">
                          {SOURCE_ICON[m.source_type] ?? "·"} {m.source_type}
                        </span>
                        <Mono className="text-[10px] text-text-2">
                          {relativeDate(m.source_at ?? m.created_at)}
                        </Mono>
                      </div>
                      <p className="text-sm text-text-1 leading-snug mt-1 group-hover:text-text-0 transition-colors">
                        {m.snippet
                          ? m.snippet.slice(0, 180) +
                            (m.snippet.length > 180 ? "…" : "")
                          : "—"}
                      </p>
                      <Mono className="text-[10px] text-text-2 mt-1">
                        said: &ldquo;{m.raw_alias}&rdquo;
                      </Mono>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {editing && (
        <PersonDrawer
          mode={{ kind: "edit", person }}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            void loadPerson();
          }}
        />
      )}
    </div>
  );
}

function ContactField({
  label,
  value,
  multiline,
}: {
  label: string;
  value: string | null;
  multiline?: boolean;
}) {
  if (!value) return null;
  async function copy(e: React.MouseEvent<HTMLButtonElement>) {
    triggerGlowPulse(e.currentTarget);
    try {
      await navigator.clipboard.writeText(value!);
    } catch {
      /* ignore */
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      className="text-left group rounded-sm hover:bg-ink-2 -mx-2 px-2 py-1 transition-colors"
    >
      <div className="card-eyebrow">{label}</div>
      <div
        className={`text-sm text-text-0 mt-0.5 ${
          multiline ? "whitespace-pre-wrap" : "truncate"
        }`}
      >
        {value}
      </div>
    </button>
  );
}
