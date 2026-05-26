"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Mono } from "@/components/dashboard/Mono";
import type { Task } from "@/lib/types/task";
import type { PersonRow } from "@/app/api/people/route";

type CaptureRow = {
  id: string;
  source: string;
  raw_text: string | null;
  classification: { kind?: string } | null;
  created_at: string;
};

function relativeDate(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  const d = ms / 86_400_000;
  if (d < 1) return "today";
  if (d < 2) return "yesterday";
  if (d < 14) return `${Math.floor(d)}d ago`;
  if (d < 60) return `${Math.floor(d / 7)}w ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

export function PeopleClient() {
  const [people, setPeople] = useState<PersonRow[] | null>(null);
  const [selected, setSelected] = useState<PersonRow | null>(null);

  useEffect(() => {
    let mounted = true;
    fetch("/api/people")
      .then((r) => r.json())
      .then((j: { people?: PersonRow[] }) => {
        if (!mounted) return;
        setPeople(Array.isArray(j?.people) ? j.people : []);
      })
      .catch(() => mounted && setPeople([]));
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="flex flex-col gap-3">
      {people === null ? (
        <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-12 text-center">
          Loading…
        </div>
      ) : people.length === 0 ? (
        <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-12 text-center">
          No people yet. Mention someone in a capture and they&apos;ll appear here.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-ink-2 bg-ink-1/60 backdrop-blur-xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] border-b border-ink-2">
                <th className="text-left py-2 px-4">Name</th>
                <th className="text-right py-2 px-4">Open</th>
                <th className="text-right py-2 px-4">Total</th>
                <th className="text-right py-2 px-4">Last interaction</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => setSelected(p)}
                  className="border-b border-ink-2 last:border-b-0 cursor-pointer hover:bg-ink-2/30 transition-colors"
                >
                  <td className="py-2 px-4 text-ink-4">{p.name}</td>
                  <td className="text-right py-2 px-4">
                    <Mono className={p.open_task_count > 0 ? "text-accent" : "text-ink-3"}>
                      {p.open_task_count}
                    </Mono>
                  </td>
                  <td className="text-right py-2 px-4">
                    <Mono className="text-ink-3">{p.task_count}</Mono>
                  </td>
                  <td className="text-right py-2 px-4">
                    <Mono className="text-ink-3">{relativeDate(p.last_interaction)}</Mono>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <PersonDrawer person={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function PersonDrawer({
  person,
  onClose,
}: {
  person: PersonRow;
  onClose: () => void;
}) {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [captures, setCaptures] = useState<CaptureRow[] | null>(null);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      fetch(`/api/tasks?entity_id=${encodeURIComponent(person.id)}&status=all`)
        .then((r) => r.json())
        .catch(() => ({})),
      fetch(`/api/people/${encodeURIComponent(person.id)}/captures`)
        .then((r) => r.json())
        .catch(() => ({})),
    ]).then(([t, c]: [{ tasks?: Task[] }, { captures?: CaptureRow[] }]) => {
      if (!mounted) return;
      setTasks(Array.isArray(t?.tasks) ? t.tasks : []);
      setCaptures(Array.isArray(c?.captures) ? c.captures : []);
    });

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      mounted = false;
      window.removeEventListener("keydown", onKey);
    };
  }, [person.id, onClose]);

  const openTasks = (tasks ?? []).filter((t) => !t.completed_at);
  const doneTasks = (tasks ?? [])
    .filter((t) => t.completed_at)
    .slice(0, 10);

  return (
    <div className="fixed inset-0 z-50">
      <div
        onClick={onClose}
        className="absolute inset-0 bg-ink-0/60 backdrop-blur-sm"
      />
      <aside
        className="absolute top-0 right-0 h-full w-full max-w-[440px] bg-ink-1 border-l border-ink-2 shadow-2xl flex flex-col"
        role="dialog"
        aria-label={`${person.name} details`}
      >
        <header className="flex items-center justify-between px-4 py-3 border-b border-ink-2">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
              Person
            </div>
            <div className="text-base text-ink-4">{person.name}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-ink-3 hover:text-ink-4 text-sm"
          >
            ✕
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5">
          <section>
            <h3 className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] mb-2">
              Open tasks <Mono className="text-ink-3">({openTasks.length})</Mono>
            </h3>
            {tasks === null ? (
              <div className="text-xs text-ink-3 italic font-[family-name:var(--font-display)]">
                Loading…
              </div>
            ) : openTasks.length === 0 ? (
              <div className="text-xs text-ink-3 italic font-[family-name:var(--font-display)]">
                No open tasks.
              </div>
            ) : (
              <ul className="flex flex-col divide-y divide-ink-2">
                {openTasks.map((t) => (
                  <li key={t.id} className="py-2">
                    <Link
                      href={`/crm/tasks?focus=${t.id}`}
                      className="text-sm text-ink-4 hover:text-accent transition-colors"
                    >
                      {t.title}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] mb-2">
              Recent done <Mono className="text-ink-3">({doneTasks.length})</Mono>
            </h3>
            {doneTasks.length === 0 ? (
              <div className="text-xs text-ink-3 italic font-[family-name:var(--font-display)]">
                None.
              </div>
            ) : (
              <ul className="flex flex-col divide-y divide-ink-2">
                {doneTasks.map((t) => (
                  <li key={t.id} className="py-2">
                    <Link
                      href={`/crm/tasks?focus=${t.id}`}
                      className="text-sm text-ink-3 hover:text-ink-4 transition-colors line-through"
                    >
                      {t.title}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] mb-2">
              Captures referencing them{" "}
              <Mono className="text-ink-3">({(captures ?? []).length})</Mono>
            </h3>
            {captures === null ? (
              <div className="text-xs text-ink-3 italic font-[family-name:var(--font-display)]">
                Loading…
              </div>
            ) : captures.length === 0 ? (
              <div className="text-xs text-ink-3 italic font-[family-name:var(--font-display)]">
                None.
              </div>
            ) : (
              <ul className="flex flex-col divide-y divide-ink-2">
                {captures.map((c) => (
                  <li key={c.id} className="py-2">
                    <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] mb-0.5">
                      <span>{c.source}</span>
                      <Mono className="text-ink-3">
                        {relativeDate(c.created_at)}
                      </Mono>
                    </div>
                    <div className="text-sm text-ink-4 leading-snug">
                      {c.raw_text}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}
