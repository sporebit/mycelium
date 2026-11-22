"use client";

/**
 * /phirstmaxx/plans (spec §7): proposals waiting, what is on, and what has
 * been; a hold keeps a window free with no thing yet.
 */
import { useState } from "react";
import { Button, Label, Surface } from "@/components/ui";
import { useApi } from "@/lib/data/useApi";
import { PlanCard } from "./PlanCard";
import { INPUT, errText, fromLocalInput, send, type Person, type PlanView } from "./api";

type View = { plans: PlanView[]; people: Person[]; me: string };

export function Plans() {
  const { data, error, mutate } = useApi<View>("/api/phirstmaxx/plans");
  const [hold, setHold] = useState<{ title: string; starts: string; ends: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  const act = (id: string, body: Record<string, unknown>) => send("POST", `/api/phirstmaxx/plans/${id}`, body).then(() => mutate()).then(() => undefined);

  if (error) {
    const status = (error as { status?: number }).status;
    return (
      <Surface className="p-5" data-testid="pm-plans">
        <p className="text-sm text-text-mid">{status === 404 ? "PhirstMaxx lives in the family space. Set that up first, under Family." : "Plans could not be loaded. Reload to try again."}</p>
      </Surface>
    );
  }
  if (!data) return <p className="text-sm text-text-lo" data-testid="pm-plans">Loading…</p>;
  const waiting = data.plans.filter((p) => p.status === "proposed");
  const on = data.plans.filter((p) => p.status === "accepted" && Date.parse(p.ends_at) >= now - 86_400_000);
  const past = data.plans.filter((p) => !waiting.includes(p) && !on.includes(p)).sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at));
  const section = (title: string, list: PlanView[], empty: string, testId: string) => (
    <Surface className="flex flex-col gap-3 p-5" data-testid={testId}>
      <h2 className="text-base text-text-hi">{title}</h2>
      {list.length === 0 ? (
        <p className="text-sm text-text-mid">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((p) => (
            <PlanCard key={p.id} plan={p} people={data.people} me={data.me} onRespond={(a) => act(p.id, { action: "respond", answer: a })} onCancel={() => act(p.id, { action: "cancel" })} onDone={(note) => act(p.id, { action: "done", note })} />
          ))}
        </ul>
      )}
    </Surface>
  );

  return (
    <div className="flex flex-col gap-4" data-testid="pm-plans">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="font-[family-name:var(--font-plate)] text-2xl text-text-hi">Plans</h1>
        <span className="flex-1" />
        <Button size="sm" onClick={() => setHold(hold ? null : { title: "", starts: "", ends: "" })} aria-expanded={hold !== null}>
          Hold a window
        </Button>
      </div>
      {hold ? (
        <Surface as="form" className="flex flex-wrap items-end gap-3 p-4" data-testid="pm-hold-form" onSubmit={(e: React.FormEvent) => {
          e.preventDefault();
          const s = fromLocalInput(hold.starts);
          const en = fromLocalInput(hold.ends);
          if (!s || !en) {
            setFail("A hold needs a start and an end.");
            return;
          }
          setBusy(true);
          setFail(null);
          void send("POST", "/api/phirstmaxx/plans", { kind: "hold", title: hold.title.trim() || undefined, starts_at: s, ends_at: en })
            .then(() => mutate())
            .then(() => setHold(null))
            .catch((err: unknown) => setFail(errText(err)))
            .finally(() => setBusy(false));
        }}>
          <label className="flex min-w-[12rem] flex-1 flex-col gap-1">
            <Label>What for (optional)</Label>
            <input className={INPUT} placeholder="e.g. Keep Saturday afternoon" value={hold.title} onChange={(e) => setHold({ ...hold, title: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1">
            <Label>From</Label>
            <input type="datetime-local" className={INPUT} value={hold.starts} onChange={(e) => setHold({ ...hold, starts: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1">
            <Label>To</Label>
            <input type="datetime-local" className={INPUT} value={hold.ends} onChange={(e) => setHold({ ...hold, ends: e.target.value })} />
          </label>
          <Button type="submit" variant="primary" loading={busy} disabled={busy}>
            Propose the hold
          </Button>
          {fail ? (
            <p role="alert" className="w-full text-sm text-v2-error">
              {fail}
            </p>
          ) : null}
        </Surface>
      ) : null}
      {section("Waiting for an answer", waiting, "Nothing proposed. Propose from a thing's fit list, or hold a window.", "pm-plans-waiting")}
      {section("It's on", on, "Nothing agreed yet.", "pm-plans-on")}
      {section("Been and gone", past, "Nothing yet.", "pm-plans-past")}
    </div>
  );
}
