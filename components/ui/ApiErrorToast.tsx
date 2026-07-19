"use client";

import { useEffect, useState } from "react";

export function ApiErrorToast() {
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    function onErr(e: Event) {
      const detail = (e as CustomEvent<string>).detail;
      setMsg(typeof detail === "string" ? detail : "API error");
    }
    window.addEventListener("api-error", onErr as EventListener);
    return () =>
      window.removeEventListener("api-error", onErr as EventListener);
  }, []);

  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 4000);
    return () => clearTimeout(t);
  }, [msg]);

  if (!msg) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[80] flex items-center gap-3 bg-surface-3 border border-hairline rounded-v2-md px-4 py-2.5 text-sm text-text-hi shadow-[0_8px_24px_rgba(0,0,0,0.4)] motion-safe:animate-[growth-in_var(--dur-base)_var(--ease-out)]"
    >
      <span aria-hidden className="text-v2-error">
        ⚠
      </span>
      <span>{msg}</span>
      <button
        type="button"
        onClick={() => setMsg(null)}
        aria-label="Dismiss"
        className="text-text-lo hover:text-text-hi transition-colors duration-[var(--dur-fast)]"
      >
        ×
      </button>
    </div>
  );
}
