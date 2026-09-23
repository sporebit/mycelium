"use client";

import { useState } from "react";
import Link from "next/link";
import { mutate as globalMutate } from "swr";
import { useApi } from "@/lib/data/useApi";
import type { ReviewPayload } from "@/lib/tickets/review";
import type { TicketRow } from "@/lib/tickets/query";
import { ClarifyStack } from "@/components/tickets/ClarifyStack";
import { Pill } from "@/components/tickets/ContextEditor";
import { TicketListRow } from "@/components/tickets/TicketListRow";
import { ticketFetch } from "@/components/tickets/pickers";

const KEY = "/api/tickets/review";

const STEPS = [
  { id: "inbox", title: "Inbox to zero" },
  { id: "waiting", title: "Waiting For" },
  { id: "projects", title: "Projects without a next action" },
  { id: "someday", title: "Someday / maybe" },
  { id: "stale", title: "Stale (21+ days)" },
  { id: "verify", title: "Done — verify live" },
  { id: "ahead", title: "The week ahead" },
] as const;
type StepId = (typeof STEPS)[number]["id"];

/**
 * The guided Weekly Review wizard (spec §8.4): seven sections, each with
 * the quick actions the section needs, then Seal — which writes one
 * activity row on the per-space "Weekly review" ticket.
 */
export default function WeeklyReviewPage() {
  const { data, error, mutate } = useApi<ReviewPayload>(KEY);
  const [step, setStep] = useState<StepId>("inbox");
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const refresh = async () => {
    await mutate();
    void globalMutate("/api/tickets/counts");
    void globalMutate((k) => typeof k === "string" && k.startsWith("/api/tickets?"), undefined, { revalidate: true });
  };
  const act = async (id: string, fn: () => Promise<unknown>) => {
    setBusy(id);
    try {
      await fn();
      await refresh();
    } finally {
      setBusy(null);
    }
  };
  const move = (t: TicketRow, category: string, extra: Record<string, unknown> = {}) =>
    act(t.id, () => ticketFetch(`/api/tickets/${encodeURIComponent(t.ticket_key ?? t.id)}/move`, { method: "POST", body: { category, ...extra } }));
  const verify = (t: TicketRow) => act(t.id, () => ticketFetch(`/api/tickets/${encodeURIComponent(t.ticket_key ?? t.id)}/verify`, { method: "POST", body: {} }));
  const patch = (t: TicketRow, fields: Record<string, unknown>) =>
    act(t.id, () => ticketFetch(`/api/tickets/${encodeURIComponent(t.ticket_key ?? t.id)}`, { method: "PATCH", body: fields }));

  if (error) return <div className="mx-auto max-w-4xl px-4 py-10 text-sm text-ink-3">Could not load the review.</div>;
  if (!data) return <div className="mx-auto max-w-4xl px-4 py-10 text-sm text-ink-3">Loading…</div>;

  const counts: Record<StepId, number> = {
    inbox: data.inbox.length,
    waiting: data.waiting.length,
    projects: data.projectsWithoutNext.length,
    someday: data.someday.length,
    stale: data.stale.length,
    verify: data.doneUnverified.length,
    ahead: data.weekAhead.length,
  };
  const idx = STEPS.findIndex((s) => s.id === step);
  const sealed = !!data.sealed_at;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-lg font-semibold text-text-0">
          Weekly review <span className="ml-2 font-[family-name:var(--font-mono)] text-xs text-ink-3">{data.week}</span>
        </h1>
        <div className="flex items-center gap-3 text-xs">
          {sealed && <span className="text-ok">sealed {new Date(data.sealed_at!).toLocaleDateString("en-GB")}</span>}
          <Link href="/organisation/tickets" className="text-glow-2 hover:underline">
            ← Tickets
          </Link>
        </div>
      </div>

      <ol className="mt-4 flex flex-wrap gap-1.5">
        {STEPS.map((s, i) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => setStep(s.id)}
              aria-pressed={s.id === step}
              className={`rounded-md border px-2.5 py-1 text-[11px] font-[family-name:var(--font-mono)] uppercase tracking-[0.12em] ${
                s.id === step ? "border-glow-2/50 bg-glow-2/15 text-glow-2" : "border-ink-2 text-ink-3 hover:text-ink-4"
              }`}
            >
              {i + 1}. {s.title}
              <span className={`ml-1.5 ${counts[s.id] === 0 ? "text-ok" : "text-ink-3"}`}>{counts[s.id]}</span>
            </button>
          </li>
        ))}
      </ol>

      <div className="mt-4">
        {step === "inbox" && (
          <div>
            <p className="mb-2 text-[11px] text-ink-3">Clarify everything that came in. Same cards as the Inbox tab.</p>
            <ClarifyStack simple={false} />
          </div>
        )}

        {step === "waiting" && (
          <Section empty="Nothing waiting on anyone." rows={data.waiting}>
            {(t) => (
              <>
                {t.waiting_on_person_id && (
                  <Link href={`/organisation/people/${t.waiting_on_person_id}`} className="text-[11px] text-glow-2 hover:underline">
                    message
                  </Link>
                )}
                <Pill active={false} onClick={() => void move(t, "next")}>
                  unblocked → Next
                </Pill>
                <Pill active={false} onClick={() => void move(t, "done")}>
                  done
                </Pill>
              </>
            )}
          </Section>
        )}

        {step === "projects" && (
          <div>
            {data.projectsWithoutNext.length === 0 ? (
              <Empty text="Every active project has a next action." />
            ) : (
              <ul className="flex flex-col gap-1.5">
                {data.projectsWithoutNext.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 rounded-v2-md border border-hairline bg-surface-1 px-3 py-2 text-sm">
                    <span className="h-2 w-2 rounded-full" style={{ background: p.colour ?? "#888" }} />
                    <Link href={`/organisation/projects/${p.id}`} className="flex-1 text-text-0 hover:underline">
                      {p.name}
                    </Link>
                    <span className="text-[11px] text-ink-3">{p.open} open, none in Next or Doing</span>
                    <Link href={`/organisation/tickets`} className="text-[11px] text-glow-2 hover:underline">
                      triage backlog
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {step === "someday" && (
          <Section empty="Nothing parked." rows={data.someday}>
            {(t) => (
              <>
                <Pill active={false} tone="accent" onClick={() => void move(t, "next", { someday: false })}>
                  promote → Next
                </Pill>
                <Pill active={false} onClick={() => void move(t, "cancelled")}>
                  bin
                </Pill>
              </>
            )}
          </Section>
        )}

        {step === "stale" && (
          <Section empty="Nothing stale." rows={data.stale}>
            {(t) => (
              <>
                <Pill active={false} tone="accent" onClick={() => void move(t, "next")}>
                  → Next
                </Pill>
                <Pill active={false} onClick={() => void patch(t, { someday: true })}>
                  someday
                </Pill>
                <Pill active={false} onClick={() => void move(t, "cancelled")}>
                  bin
                </Pill>
              </>
            )}
          </Section>
        )}

        {step === "verify" && (
          <Section empty="Everything Done is verified." rows={data.doneUnverified}>
            {(t) => (
              <>
                <Pill active={false} tone="accent" onClick={() => void verify(t)}>
                  ✓ verified live
                </Pill>
                <Pill active={false} onClick={() => void move(t, "next")}>
                  reopen
                </Pill>
              </>
            )}
          </Section>
        )}

        {step === "ahead" && (
          <Section empty="Nothing scheduled or due in the next 7 days." rows={data.weekAhead}>
            {(t) => (
              <Pill active={false} onClick={() => void patch(t, { due_window: "someday" })} title="Park it — no date">
                someday
              </Pill>
            )}
          </Section>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-v2-lg border border-hairline bg-surface-1 p-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={idx === 0}
            onClick={() => setStep(STEPS[Math.max(0, idx - 1)].id)}
            className="rounded-sm bg-ink-2 px-3 py-1 text-sm text-ink-4 disabled:opacity-40"
          >
            ← back
          </button>
          <button
            type="button"
            disabled={idx === STEPS.length - 1}
            onClick={() => setStep(STEPS[Math.min(STEPS.length - 1, idx + 1)].id)}
            className="rounded-sm bg-ink-2 px-3 py-1 text-sm text-ink-4 disabled:opacity-40"
          >
            next →
          </button>
        </div>
        <div className="flex flex-1 items-center gap-2">
          <input
            className="min-w-[160px] flex-1 rounded-sm bg-ink-2 px-3 py-1.5 text-sm text-text-0 outline-none"
            placeholder="one line for the record (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={sealed}
          />
          <button
            type="button"
            disabled={sealed || busy === "seal"}
            onClick={() => act("seal", () => ticketFetch(KEY, { method: "POST", body: { note } }))}
            className="rounded-sm bg-accent/20 px-3 py-1.5 text-sm text-accent disabled:opacity-40"
            title="Writes one activity row on the Weekly review ticket"
          >
            {sealed ? "Sealed" : "Seal this week"}
          </button>
        </div>
      </div>
      {data.review_ticket_key && (
        <p className="mt-2 text-[11px] text-ink-3">
          Record: <Link href={`/organisation/tickets/${data.review_ticket_key}`} className="text-glow-2 hover:underline">{data.review_ticket_key}</Link>
        </p>
      )}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-v2-lg border border-hairline bg-surface-1 p-10 text-center">
      <p className="text-sm italic text-ink-3">{text}</p>
    </div>
  );
}

function Section({ rows, empty, children }: { rows: TicketRow[]; empty: string; children: (t: TicketRow) => React.ReactNode }) {
  if (rows.length === 0) return <Empty text={empty} />;
  return (
    <ul className="flex flex-col gap-1.5">
      {rows.map((t) => (
        <TicketListRow key={t.id} t={t} action={<span className="flex shrink-0 items-center gap-1.5">{children(t)}</span>} />
      ))}
    </ul>
  );
}
