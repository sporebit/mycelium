"use client";

/**
 * One plan (spec §7): what, when, who proposed it, each person's answer,
 * the legs ("leave by 12:10") once it is on, and the buttons the state
 * allows: Yes / No / Another time while proposed and unanswered by me,
 * Cancel while mine or accepted, Done once the window has passed.
 */
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui";
import { PLAN_WORDS, errText, spanLabel, timeLabel, type Person, type PlanView } from "./api";

const ANSWER_WORDS: Record<string, string> = { yes: "yes", no: "no", another_time: "another time" };

export function PlanCard({
  plan,
  people,
  me,
  onRespond,
  onCancel,
  onDone,
}: {
  plan: PlanView;
  people: Person[];
  me: string;
  onRespond?: (answer: "yes" | "no" | "another_time") => Promise<void>;
  onCancel?: () => Promise<void>;
  onDone?: (note: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [fail, setFail] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  // read once when the card mounts: whether the window has passed does not need to tick
  const [now] = useState(() => Date.now());
  const name = (id: string) => (id === "engine" ? "PhirstMaxx" : people.find((p) => p.id === id)?.name ?? "Someone");
  const mine = plan.responses.find((r) => r.person_id === me);
  const past = Date.parse(plan.ends_at) < now;
  const myLegs = plan.legs.filter((l) => l.person_id === me);
  const leave = myLegs.find((l) => l.kind === "leave") ?? myLegs[0];

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setFail(null);
    try {
      await fn();
    } catch (e) {
      setFail(errText(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <li className="flex flex-col gap-2 rounded-v2-md border border-hairline bg-surface-0 p-3" data-testid="pm-plan">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm text-text-hi">
          {plan.thing_id ? (
            <Link href={`/phirstmaxx/things/${plan.thing_id}`} className="hover:underline">
              {plan.title}
            </Link>
          ) : (
            plan.title
          )}
          {plan.kind === "hold" ? <span className="ml-2 text-xs text-text-lo">hold</span> : null}
        </span>
        <span className="text-xs text-text-lo">{PLAN_WORDS[plan.status] ?? plan.status}</span>
      </div>
      <p className="text-sm text-text-mid">
        {spanLabel(plan.starts_at, plan.ends_at)} · proposed by {plan.proposed_by === me ? "you" : name(plan.proposed_by)}
      </p>
      {plan.conflict ? <p className="text-xs text-warn">Conflicts now: {plan.conflict}</p> : null}
      {plan.responses.length > 0 ? (
        <p className="text-xs text-text-lo">
          {plan.responses.map((r) => `${r.person_id === me ? "You" : name(r.person_id)}: ${ANSWER_WORDS[r.answer] ?? r.answer}`).join(" · ")}
        </p>
      ) : null}
      {plan.status === "accepted" && leave ? (
        <p className="text-xs text-text-mid">
          Leave by {timeLabel(leave.starts_at)}
          {leave.from_label ? ` from ${leave.from_label}` : ""}
          {myLegs.find((l) => l.kind === "travel")?.minutes ? ` · ${myLegs.find((l) => l.kind === "travel")!.minutes} min ${myLegs.find((l) => l.kind === "travel")!.mode ?? ""}` : ""}
        </p>
      ) : null}
      {plan.notes ? <p className="text-xs text-text-mid">{plan.notes}</p> : null}

      <div className="flex flex-wrap gap-2">
        {plan.status === "proposed" && !mine && onRespond ? (
          <>
            <Button size="sm" variant="primary" loading={busy === "yes"} disabled={busy !== null} onClick={() => void run("yes", () => onRespond("yes"))}>
              Yes
            </Button>
            <Button size="sm" loading={busy === "no"} disabled={busy !== null} onClick={() => void run("no", () => onRespond("no"))}>
              No
            </Button>
            <Button size="sm" loading={busy === "another_time"} disabled={busy !== null} onClick={() => void run("another_time", () => onRespond("another_time"))}>
              Another time
            </Button>
          </>
        ) : null}
        {(plan.status === "proposed" || plan.status === "accepted") && onCancel ? (
          <Button size="sm" variant="danger" loading={busy === "cancel"} disabled={busy !== null} onClick={() => void run("cancel", onCancel)}>
            Cancel
          </Button>
        ) : null}
        {plan.status === "accepted" && past && onDone ? (
          note === null ? (
            <Button size="sm" onClick={() => setNote("")} disabled={busy !== null}>
              Done
            </Button>
          ) : (
            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void run("done", async () => {
                  await onDone(note);
                  setNote(null);
                });
              }}
            >
              <input autoFocus aria-label="A note for the family timeline" placeholder="How was it? (optional)" value={note} onChange={(e) => setNote(e.target.value)} className="min-h-[32px] rounded-v2-md border border-hairline bg-surface-0 px-3 text-sm text-text-hi placeholder:text-text-lo focus:border-glow focus:outline-none" />
              <Button size="sm" type="submit" variant="primary" loading={busy === "done"} disabled={busy !== null}>
                Mark done
              </Button>
              <Button size="sm" type="button" onClick={() => setNote(null)} disabled={busy !== null}>
                Not yet
              </Button>
            </form>
          )
        ) : null}
      </div>
      {fail ? (
        <p role="alert" className="text-xs text-v2-error">
          {fail}
        </p>
      ) : null}
    </li>
  );
}
