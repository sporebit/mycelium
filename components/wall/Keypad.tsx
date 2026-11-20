"use client";

import { useState } from "react";

/**
 * A big-fingered keypad for the wall: the pairing code and a person's PIN.
 * Digits only, nothing typed is shown (dots), and the labels never say
 * whose PIN it is: the accessible name is the same for everyone.
 */
export function Keypad({ length, min = length, title, hint, busy, error, onSubmit, onCancel }: { length: number; /** Shorter codes are allowed from here, with a Go button; equal to `length` means it sends itself when full. */ min?: number; title: string; hint?: string; busy?: boolean; error?: string | null; onSubmit: (code: string) => void; onCancel?: () => void }) {
  const [code, setCode] = useState("");
  const send = (value: string) => {
    onSubmit(value);
    setCode("");
  };
  const press = (d: string) => {
    if (busy) return;
    const next = (code + d).slice(0, length);
    setCode(next);
    if (next.length === length && min === length) send(next);
  };
  const back = () => setCode((c) => c.slice(0, -1));
  return (
    <div role="group" aria-label="Keypad" className="flex flex-col items-center gap-6">
      <div className="text-center">
        <div className="text-3xl font-[family-name:var(--font-plate)]">{title}</div>
        {hint ? <div className="mt-1 text-base opacity-70">{hint}</div> : null}
      </div>
      <div className="flex gap-3" aria-label="Digits entered" aria-live="polite">
        {Array.from({ length }, (_, i) => (
          <span key={i} className={`h-4 w-4 rounded-full border ${i < code.length ? "bg-current" : "bg-transparent"}`} style={{ borderColor: "currentColor" }} />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} type="button" onClick={() => press(d)} className="h-20 w-20 rounded-full border text-3xl active:scale-95" style={{ borderColor: "rgba(236,230,210,0.3)" }} aria-label={`Digit ${d}`}>
            {d}
          </button>
        ))}
        <button type="button" onClick={onCancel} className="h-20 w-20 rounded-full text-base opacity-70" aria-label="Cancel">
          {onCancel ? "Back" : ""}
        </button>
        <button type="button" onClick={() => press("0")} className="h-20 w-20 rounded-full border text-3xl active:scale-95" style={{ borderColor: "rgba(236,230,210,0.3)" }} aria-label="Digit 0">
          0
        </button>
        <button type="button" onClick={back} className="h-20 w-20 rounded-full text-base opacity-70" aria-label="Delete last digit">
          ⌫
        </button>
      </div>
      {min < length ? (
        <button type="button" disabled={busy || code.length < min} onClick={() => send(code)} className="rounded-full border px-8 py-3 text-xl disabled:opacity-30" style={{ borderColor: "rgba(236,230,210,0.3)" }} aria-label="Go">
          Go
        </button>
      ) : null}
      <div className="h-6 text-base" role="status">
        {busy ? "Checking…" : error ?? ""}
      </div>
    </div>
  );
}
