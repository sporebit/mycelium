"use client";

import { useEffect, useState } from "react";

type Toast = { kind: "success" | "error"; text: string } | null;

export function SuggestCapture({
  label,
  prefix,
}: {
  label: string;
  prefix: string;
}) {
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<Toast>(null);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(id);
  }, [toast]);

  async function submit() {
    const text = value.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: `${prefix} ${text}` }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setToast({ kind: "error", text: j.error ?? `Failed (${res.status})` });
        return;
      }
      setToast({ kind: "success", text: "✓ Captured" });
      setValue("");
    } catch (err) {
      setToast({
        kind: "error",
        text: err instanceof Error ? err.message : "Network error",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="rounded-xl border border-ink-2 bg-ink-0/40 px-4 py-3 flex items-center gap-3"
    >
      <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] shrink-0">
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Type and press Enter…"
        disabled={submitting}
        className="flex-1 bg-transparent outline-none text-sm text-ink-4 placeholder:text-ink-3"
      />
      <button
        type="submit"
        disabled={!value.trim() || submitting}
        className="text-[10px] uppercase tracking-[0.18em] text-accent hover:text-ink-4 disabled:opacity-40 disabled:cursor-not-allowed font-[family-name:var(--font-mono)]"
      >
        {submitting ? "…" : "CAPTURE ↵"}
      </button>
      {toast && (
        <span
          role="status"
          className={`text-[10px] uppercase tracking-[0.18em] font-[family-name:var(--font-mono)] ${
            toast.kind === "success" ? "text-ok" : "text-danger"
          }`}
        >
          {toast.text}
        </span>
      )}
    </form>
  );
}
