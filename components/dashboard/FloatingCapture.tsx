"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { triggerFieldPulse } from "@/lib/motion";
import { EntityForm } from "@/components/forms/EntityForm";
import { ENTITY_REGISTRY, TYPED_KINDS, emptyValues, isTypedKind, str, type FieldErrors, type FieldValues, type TypedKind } from "@/lib/capture/registry";

type Toast = { kind: "success" | "error"; text: string } | null;

const ADD_ANOTHER_KEY = "mycelium.capture.addAnother";
const TYPE_KEY = "mycelium.capture.type";

const FAB_ROUTES = new Set([
  "/",
  "/organisation",
  "/fitness",
  "/health",
  "/finance",
  "/the-boys",
  "/studio",
]);

type CaptureType = "auto" | TypedKind;

export function FloatingCapture() {
  const pathname = usePathname();
  const showFab = FAB_ROUTES.has(pathname);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  // "Add another": keep the modal open after a successful capture so a run
  // of thoughts can be entered without reopening. Remembered per browser.
  const [addAnother, setAddAnother] = useState(false);
  // MYC-161: the capture type. Auto = classify (today's behaviour); a type
  // renders that entity's registry form and the submit goes to review.
  const [type, setType] = useState<CaptureType>("auto");
  const [fields, setFields] = useState<FieldValues>({});
  const [errors, setErrors] = useState<FieldErrors>({});
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const def = type !== "auto" ? ENTITY_REGISTRY[type] : null;

  function readAddAnother(): boolean {
    try {
      return localStorage.getItem(ADD_ANOTHER_KEY) === "1";
    } catch {
      return false; // localStorage unavailable (private mode etc.)
    }
  }

  function readType(): CaptureType {
    try {
      const v = localStorage.getItem(TYPE_KEY);
      return isTypedKind(v) ? v : "auto";
    } catch {
      return "auto";
    }
  }

  function toggleAddAnother(next: boolean) {
    setAddAnother(next);
    try {
      localStorage.setItem(ADD_ANOTHER_KEY, next ? "1" : "0");
    } catch {
      // ignore — preference just won't persist.
    }
  }

  /** Switching type carries the text across: into the new form's primary field, or back into the textarea. */
  function changeType(next: CaptureType) {
    const currentText = def ? str(fields[def.primary]) : value;
    if (next === "auto") {
      setValue(currentText);
      setFields({});
    } else {
      const nextDef = ENTITY_REGISTRY[next];
      setFields(emptyValues(nextDef, { [nextDef.primary]: currentText }));
    }
    setErrors({});
    setType(next);
    try {
      localStorage.setItem(TYPE_KEY, next);
    } catch {
      // ignore
    }
    if (next === "auto") requestAnimationFrame(() => textareaRef.current?.focus());
  }

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

  // External trigger: Sidebar / TabBar dispatch "open-capture" to open the
  // same capture modal without needing a shared React context.
  useEffect(() => {
    window.addEventListener("open-capture", openModal);
    return () => window.removeEventListener("open-capture", openModal);
  }, []);

  useEffect(() => {
    if (open && type === "auto") requestAnimationFrame(() => textareaRef.current?.focus());
  }, [open, type]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2000);
    return () => clearTimeout(t);
  }, [toast]);

  // The stored preferences are read at open time (an event, not render) so
  // the server-rendered markup never disagrees with the browser's value.
  function openModal() {
    setAddAnother(readAddAnother());
    const t = readType();
    setType(t);
    setFields(t === "auto" ? {} : emptyValues(ENTITY_REGISTRY[t]));
    setErrors({});
    setOpen(true);
  }

  function closeModal() {
    setOpen(false);
    setValue("");
    setFields(def ? emptyValues(def) : {});
    setErrors({});
  }

  const canSubmit = useMemo(() => {
    if (submitting) return false;
    if (!def) return !!value.trim();
    return !!str(fields[def.primary]);
  }, [submitting, def, value, fields]);

  async function submit() {
    if (submitting) return;
    let payload: Record<string, unknown>;
    if (def) {
      const errs = def.validate(fields);
      setErrors(errs);
      if (Object.keys(errs).length) return;
      payload = { typed: { kind: def.kind, fields } };
    } else {
      const text = value.trim();
      if (!text) return;
      payload = { text };
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        errors?: FieldErrors;
        review?: "tickets_inbox" | "captures";
        ticket_key?: string | null;
      };
      if (!res.ok) {
        if (json.errors) setErrors(json.errors);
        setToast({ kind: "error", text: json.error ?? `Failed (${res.status})` });
      } else {
        const where = json.review === "tickets_inbox" ? (json.ticket_key ? `→ Inbox · ${json.ticket_key}` : "→ Inbox") : json.review === "captures" ? "→ Review" : "";
        setToast({ kind: "success", text: `✓ Captured ${where}`.trim() });
        if (addAnother) {
          setValue("");
          if (def) setFields(emptyValues(def));
          setErrors({});
          requestAnimationFrame(() => {
            if (def) document.getElementById(`ef-${def.kind}-${def.primary}`)?.focus();
            else textareaRef.current?.focus();
          });
        } else {
          closeModal();
        }
        // Ripple emanates from bottom-centre — works for both desktop
        // FloatingCapture (bottom-right) and mobile TabBar FAB (bottom
        // -centre); slight offset for FloatingCapture is imperceptible
        // in the ambient background.
        triggerFieldPulse(
          window.innerWidth / 2,
          window.innerHeight - 40,
        );
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
      {/* Toast — top-centre, brief. The success state glow-pulses on mount. */}
      {toast && (
        <div
          role="status"
          className={`growth-in ${
            toast.kind === "success" ? "glow-pulse" : ""
          } fixed top-20 left-1/2 -translate-x-1/2 z-[150] px-4 py-2 rounded-md text-sm shadow-2xl font-[family-name:var(--font-mono)] ${
            toast.kind === "success"
              ? "bg-ok/20 text-ok border border-ok/40"
              : "bg-danger/20 text-danger border border-danger/40"
          }`}
        >
          {toast.text}
        </div>
      )}

      {/* Floating + button — desktop only (mobile uses the TabBar centre
          FAB); still only on top-level landing pages per FAB_ROUTES. */}
      {showFab && !open && (
        <button
          type="button"
          onClick={openModal}
          aria-label="Capture"
          className="hidden lg:flex fixed bottom-6 right-6 z-50 h-12 w-12 rounded-full bg-accent text-ink-0 shadow-2xl hover:bg-accent/90 transition-transform hover:scale-105 items-center justify-center text-xl font-[family-name:var(--font-mono)]"
        >
          +
        </button>
      )}

      {/* Modal — opens on any route via the "open-capture" event, so it
          renders whenever `open` is true regardless of showFab. */}
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
            className="relative w-full max-w-xl max-h-[90vh] flex flex-col rounded-2xl border border-ink-2 bg-ink-1 shadow-2xl overflow-hidden"
            role="dialog"
            aria-label="Capture"
          >
            <header className="flex items-center justify-between px-4 py-3 border-b border-ink-2 gap-3">
              <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
                Capture
              </span>
              <label className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
                <span>Type</span>
                <select
                  value={type}
                  onChange={(e) => changeType(e.target.value as CaptureType)}
                  disabled={submitting}
                  className="bg-ink-2 rounded-sm text-xs normal-case tracking-normal text-text-0 px-2 py-1 outline outline-1 outline-transparent focus:outline-glow-2"
                  aria-label="Capture type"
                >
                  <option value="auto">Auto</option>
                  {TYPED_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {ENTITY_REGISTRY[k].label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={closeModal}
                aria-label="Close"
                className="text-ink-3 hover:text-ink-4 text-sm"
              >
                ✕
              </button>
            </header>
            <div className="p-4 flex flex-col gap-3 overflow-y-auto">
              {def ? (
                <>
                  <p className="text-[11px] text-ink-3 font-[family-name:var(--font-mono)]">
                    {def.description}{" "}
                    {def.kind === "task" || def.kind === "ticket" ? "Goes to the Tickets Inbox." : "Goes to Capture review for a one-tap approve."}
                  </p>
                  <EntityForm def={def} values={fields} onChange={setFields} errors={errors} disabled={submitting} autoFocus onSubmit={submit} />
                </>
              ) : (
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
              )}
              <div className="flex items-center justify-between gap-3 text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
                <span className="hidden sm:inline">⌘/Ctrl+Enter to submit · Esc to close</span>
                <label className="flex items-center gap-1.5 cursor-pointer select-none hover:text-ink-4">
                  <input
                    type="checkbox"
                    checked={addAnother}
                    onChange={(e) => toggleAddAnother(e.target.checked)}
                    className="accent-accent h-3 w-3"
                  />
                  Add another
                </label>
                <button
                  type="button"
                  onClick={submit}
                  disabled={!canSubmit}
                  className="px-3 py-1.5 rounded-md bg-accent/15 border border-accent/40 text-accent disabled:opacity-40 disabled:cursor-not-allowed hover:bg-accent/25 transition-colors"
                >
                  {submitting ? "Capturing…" : def ? `Capture ${def.label} →` : "Capture →"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
