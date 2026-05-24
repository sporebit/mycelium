"use client";

import { useEffect, useRef, useState } from "react";

type Toast =
  | { kind: "success"; text: string }
  | { kind: "error"; text: string }
  | null;

export function CaptureBox() {
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  async function submit() {
    const text = value.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        kind?: string;
        title?: string;
        error?: string;
      };
      if (!res.ok) {
        setToast({ kind: "error", text: json.error ?? `Failed (${res.status})` });
      } else {
        setToast({
          kind: "success",
          text: `✓ ${json.kind ?? "captured"} — ${json.title ?? ""}`.trim(),
        });
        setValue("");
        textareaRef.current?.blur();
      }
    } catch (err) {
      setToast({
        kind: "error",
        text: err instanceof Error ? err.message : "Network error",
      });
    } finally {
      setSubmitting(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  }

  return (
    <>
      {toast && (
        <div
          role="status"
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-md text-sm shadow-lg font-[family-name:var(--font-mono)] ${
            toast.kind === "success"
              ? "bg-ok/20 text-ok border border-ok/40"
              : "bg-danger/20 text-danger border border-danger/40"
          }`}
        >
          {toast.text}
        </div>
      )}

      <div className="rounded-xl border border-ink-2 bg-ink-0/40 p-3 flex flex-col gap-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Capture a thought, task, or decision…"
          rows={2}
          className="w-full bg-transparent text-ink-4 placeholder:text-ink-3 resize-none outline-none text-sm leading-relaxed"
          disabled={submitting}
        />
        <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
          <span>⌘/Ctrl+Enter to submit</span>
          <button
            onClick={submit}
            disabled={submitting || !value.trim()}
            className="px-3 py-1 rounded-md bg-accent/15 border border-accent/40 text-accent disabled:opacity-40 disabled:cursor-not-allowed hover:bg-accent/25 transition-colors"
          >
            {submitting ? "Capturing…" : "Capture →"}
          </button>
        </div>
      </div>
    </>
  );
}
