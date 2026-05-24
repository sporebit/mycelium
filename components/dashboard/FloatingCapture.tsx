"use client";

import { useEffect, useRef, useState } from "react";

type Toast = { kind: "success" | "error"; text: string } | null;

export function FloatingCapture() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && open) {
        e.preventDefault();
        closeModal();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (open) requestAnimationFrame(() => textareaRef.current?.focus());
  }, [open]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2000);
    return () => clearTimeout(t);
  }, [toast]);

  function closeModal() {
    setOpen(false);
    setValue("");
  }

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
        error?: string;
      };
      if (!res.ok) {
        setToast({ kind: "error", text: json.error ?? `Failed (${res.status})` });
      } else {
        setToast({ kind: "success", text: "✓ Captured" });
        closeModal();
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
      {/* Toast — top-centre, brief */}
      {toast && (
        <div
          role="status"
          className={`fixed top-20 left-1/2 -translate-x-1/2 z-[150] px-4 py-2 rounded-md text-sm shadow-2xl font-[family-name:var(--font-mono)] ${
            toast.kind === "success"
              ? "bg-ok/20 text-ok border border-ok/40"
              : "bg-danger/20 text-danger border border-danger/40"
          }`}
        >
          {toast.text}
        </div>
      )}

      {/* Floating + button */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Capture"
          className="fixed bottom-6 right-6 z-40 h-12 w-12 rounded-full bg-accent text-ink-0 shadow-2xl hover:bg-accent/90 transition-transform hover:scale-105 flex items-center justify-center text-xl font-[family-name:var(--font-mono)]"
        >
          +
        </button>
      )}

      {/* Modal */}
      {open && (
        <div
          className="fixed inset-0 z-[140] flex items-center justify-center px-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <div
            className="absolute inset-0 bg-ink-0/70 backdrop-blur-sm"
            onClick={closeModal}
          />
          <div
            className="relative w-full max-w-xl rounded-2xl border border-ink-2 bg-ink-1 shadow-2xl overflow-hidden"
            role="dialog"
            aria-label="Capture"
          >
            <header className="flex items-center justify-between px-4 py-3 border-b border-ink-2">
              <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
                Capture
              </span>
              <button
                type="button"
                onClick={closeModal}
                aria-label="Close"
                className="text-ink-3 hover:text-ink-4 text-sm"
              >
                ✕
              </button>
            </header>
            <div className="p-4 flex flex-col gap-3">
              <textarea
                ref={textareaRef}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Capture a thought, task, or decision…"
                rows={4}
                disabled={submitting}
                className="w-full bg-ink-0/40 border border-ink-2 rounded-md outline-none text-sm text-ink-4 placeholder:text-ink-3 p-3 resize-y focus:border-ink-3"
              />
              <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
                <span>⌘/Ctrl+Enter to submit · Esc to close</span>
                <button
                  type="button"
                  onClick={submit}
                  disabled={submitting || !value.trim()}
                  className="px-3 py-1.5 rounded-md bg-accent/15 border border-accent/40 text-accent disabled:opacity-40 disabled:cursor-not-allowed hover:bg-accent/25 transition-colors"
                >
                  {submitting ? "Capturing…" : "Capture →"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
