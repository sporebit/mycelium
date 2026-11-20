"use client";

/**
 * Nudge (master run §7): on an item that is someone else's and that you
 * can see, one tap offers them company or help. The wordings are fixed and
 * are all offers; there is no free text. The button is not shown on your
 * own items, on finished ones, or where the server says a nudge is not
 * possible.
 */
import { useEffect, useRef, useState } from "react";
import { useApi } from "@/lib/data/useApi";

type Can = { ok: boolean; can_nudge: boolean; to?: string; presets: Array<{ key: string; label: string }> };

export function NudgeButton({ ticketId }: { ticketId: string }) {
  const { data } = useApi<Can>(`/api/nudges?ticket=${ticketId}`, { revalidateOnFocus: false });
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const box = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!data?.can_nudge) return null;

  const send = async (preset: string) => {
    setState("sending");
    setOpen(false);
    try {
      const res = await fetch("/api/nudges", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ticket_id: ticketId, preset }) });
      setState(res.ok ? "sent" : "failed");
    } catch {
      setState("failed");
    }
  };

  return (
    <div ref={box} className="relative inline-block" data-testid="nudge">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        disabled={state === "sending"}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex min-h-[32px] items-center rounded-v2-md border border-hairline px-3 text-[13px] text-text-mid transition-colors hover:bg-surface-2 hover:text-text-hi disabled:opacity-60"
      >
        {state === "sent" ? "Nudged" : "Nudge"}
        {data.to ? <span className="ml-1 text-text-lo">{data.to}</span> : null}
      </button>
      {open ? (
        <div role="group" aria-label="Nudge" className="absolute right-0 top-[38px] z-30 flex min-w-[240px] flex-col rounded-v2-lg border border-hairline bg-surface-2 p-1.5 shadow-[0_18px_40px_rgba(0,0,0,0.55)]">
          {data.presets.map((p) => (
            <button key={p.key} type="button" onClick={() => void send(p.key)} className="min-h-[40px] rounded-v2-md px-3 text-left text-[14px] text-text-mid hover:bg-surface-1 hover:text-text-hi">
              {p.label}
            </button>
          ))}
        </div>
      ) : null}
      {state === "failed" ? (
        <span role="alert" className="ml-2 text-[12px] text-danger">
          That did not send.
        </span>
      ) : null}
      {state === "sent" ? (
        <span role="status" className="sr-only">
          Nudge sent.
        </span>
      ) : null}
    </div>
  );
}
