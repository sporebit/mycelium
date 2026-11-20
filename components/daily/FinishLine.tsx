"use client";

/**
 * The finish line (research rule 22): three things that are nearly done,
 * what is left on each, and three exits. No list beyond the three and no
 * count of what else is waiting: a list of nearly-finished things is one
 * more backlog.
 */
import { useState } from "react";
import { Button, Surface } from "@/components/ui";
import type { FinishItem } from "@/lib/daily/finish";
import { useApi } from "@/lib/data/useApi";
import { BUTTONS } from "@/lib/daily/words";
import { playChime } from "./chime";

type View = { ok: boolean; items: FinishItem[] };

export function FinishLine({ initial, chime = true }: { initial: FinishItem[] | null; chime?: boolean }) {
  const { data, error: loadError, mutate } = useApi<View>("/api/daily/finish", { revalidateOnFocus: false, fallbackData: initial ? { ok: true, items: initial } : undefined });
  const [busy, setBusy] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [closed, setClosed] = useState(0);
  const items = data?.items ?? initial ?? null;

  const exit = async (item: FinishItem, how: "finish" | "good_enough" | "drop") => {
    setBusy(item.id);
    setSaveError(null);
    try {
      const res = await fetch("/api/daily/finish", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ticket_id: item.id, exit: how }) });
      const body = (await res.json()) as View & { error?: string };
      if (!res.ok || !body.ok) throw new Error(body.error ?? "not saved");
      if (how !== "drop") {
        setClosed((n) => n + 1);
        if (chime) playChime();
      }
      await mutate({ ok: true, items: body.items }, { revalidate: false });
    } catch {
      setSaveError("That did not save. Nothing was changed; try again.");
    } finally {
      setBusy(null);
    }
  };

  const error = saveError ?? (loadError && !items ? "The finish line did not load. Try again." : null);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4" data-testid="finish-line">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl text-text-hi">Finish line</h1>
        <p className="text-sm text-text-lo">Nearly done. Close one.</p>
      </header>

      {closed > 0 ? (
        <p className="text-sm text-ok" role="status" data-testid="finish-closed">
          {closed === 1 ? "One closed." : `${closed} closed.`}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}

      {items === null ? (
        <Surface className="p-5 text-sm text-text-lo">Loading…</Surface>
      ) : items.length === 0 ? (
        <Surface className="p-5" data-testid="finish-empty">
          <p className="text-text-hi">Nothing is waiting on the last stretch.</p>
          <p className="mt-1 text-sm text-text-lo">Things show here once their checklist or sub-tasks are four-fifths done.</p>
        </Surface>
      ) : (
        items.map((item) => (
          <Surface key={item.id} className="flex flex-col gap-3 p-5" data-testid="finish-item">
            <div className="flex flex-col gap-1">
              <h2 className="text-lg text-text-hi">{item.title}</h2>
              <p className="text-sm text-text-mid">{item.left}</p>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2" role="img" aria-label={`${Math.round(item.ratio * 100)} per cent done`}>
              <div className="h-full rounded-full bg-glow" style={{ width: `${Math.round(item.ratio * 100)}%` }} />
            </div>
            {item.next_step ? (
              <p className="text-sm text-text-hi">
                <span className="text-text-lo">Next: </span>
                {item.next_step}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" loading={busy === item.id} disabled={busy !== null} onClick={() => void exit(item, "finish")}>
                {BUTTONS.finish}
              </Button>
              <Button disabled={busy !== null} onClick={() => void exit(item, "good_enough")}>
                {BUTTONS.goodEnough}
              </Button>
              <Button disabled={busy !== null} onClick={() => void exit(item, "drop")}>
                {BUTTONS.drop}
              </Button>
              {item.key ? (
                <a className="inline-flex min-h-[36px] items-center px-2 text-sm text-text-lo underline underline-offset-4" href={`/organisation/tickets/${item.key}`}>
                  Open
                </a>
              ) : null}
            </div>
          </Surface>
        ))
      )}
    </div>
  );
}
