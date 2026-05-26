"use client";

import { useEffect, useState } from "react";
import { triggerGlowPulse } from "@/lib/motion";
import type { PersonWithAliases } from "@/lib/people/types";

type Mode =
  | { kind: "create" }
  | { kind: "edit"; person: PersonWithAliases };

const RELATIONSHIPS = [
  "",
  "Family",
  "Friend",
  "Partner",
  "Colleague",
  "Client",
  "Ex",
  "Acquaintance",
  "Other",
];

export function PersonDrawer({
  mode,
  prefillFirstName,
  onClose,
  onSaved,
}: {
  mode: Mode;
  /** When creating, pre-fill the first_name field (e.g. from a review-queue
   *  raw_alias). Also seeds the non-primary alias list with the same value so
   *  the new person matches future mentions of that exact spelling. */
  prefillFirstName?: string;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const initial = mode.kind === "edit" ? mode.person : null;
  const seedPrefill = mode.kind === "create" ? (prefillFirstName ?? "").trim() : "";
  const [firstName, setFirstName] = useState(() => initial?.first_name ?? seedPrefill);
  const [lastName, setLastName] = useState(() => initial?.last_name ?? "");
  const [displayName, setDisplayName] = useState(() => initial?.display_name ?? "");
  const [relationship, setRelationship] = useState(() => initial?.relationship ?? "");
  const [phone, setPhone] = useState(() => initial?.phone ?? "");
  const [email, setEmail] = useState(() => initial?.email ?? "");
  const [birthday, setBirthday] = useState(() => initial?.birthday ?? "");
  const [address, setAddress] = useState(() => initial?.address ?? "");
  const [whereMet, setWhereMet] = useState(() => initial?.where_we_met ?? "");
  const [mutual, setMutual] = useState(() => initial?.mutual_interests ?? "");
  const [notes, setNotes] = useState(() => initial?.notes ?? "");
  const [aliases, setAliases] = useState<string[]>(() => {
    if (initial) {
      return initial.aliases.filter((a) => !a.is_primary).map((a) => a.alias);
    }
    // Prefilled create — seed an alias matching the raw mention so the new
    // person matches future captures with the same spelling.
    return seedPrefill ? [seedPrefill] : [];
  });
  const [aliasDraft, setAliasDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function addAliasFromDraft() {
    const v = aliasDraft.trim();
    if (!v) return;
    setAliases((prev) => (prev.includes(v) ? prev : [...prev, v]));
    setAliasDraft("");
  }

  async function submit() {
    if (busy) return;
    if (!firstName.trim()) {
      setError("First name required");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const payload = {
        first_name: firstName.trim(),
        last_name: lastName.trim() || null,
        display_name: displayName.trim() || null,
        relationship: relationship || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        birthday: birthday || null,
        address: address.trim() || null,
        where_we_met: whereMet.trim() || null,
        mutual_interests: mutual.trim() || null,
        notes: notes.trim() || null,
        aliases,
      };
      const url =
        mode.kind === "create"
          ? "/api/people"
          : `/api/people/${mode.person.id}`;
      const r = await fetch(url, {
        method: mode.kind === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!r.ok) {
        setError(j.error ?? "Save failed");
        return;
      }
      const savedId: string =
        (j.person?.id as string | undefined) ??
        (mode.kind === "edit" ? mode.person.id : "");
      onSaved(savedId);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50">
      <div
        onClick={onClose}
        className="absolute inset-0 bg-ink-0/60 backdrop-blur-sm"
      />
      <aside
        className="drawer-slide-in absolute top-0 right-0 h-full w-full max-w-[480px] bg-ink-1 shadow-2xl flex flex-col rounded-l-lg"
        role="dialog"
        aria-label={mode.kind === "create" ? "Add person" : "Edit person"}
      >
        <div className="flex items-center justify-end px-6 pt-5">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="h-8 w-8 flex items-center justify-center text-text-2 hover:text-text-0 text-base"
          >
            ✕
          </button>
        </div>

        <div className="px-8 pt-2 pb-4">
          <div className="card-eyebrow">
            {mode.kind === "create" ? "ADD PERSON" : "EDIT PERSON"}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-8 pb-6 flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-3">
            <Field label="First name *">
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className={inputClass}
                autoFocus
              />
            </Field>
            <Field label="Last name">
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>

          <Field label="Display name">
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="How you usually say their name"
              className={inputClass}
            />
          </Field>

          <Field label="Relationship">
            <select
              value={relationship}
              onChange={(e) => setRelationship(e.target.value)}
              className={inputClass}
            >
              {RELATIONSHIPS.map((r) => (
                <option key={r} value={r}>
                  {r || "—"}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone">
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Email">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Birthday">
              <input
                type="date"
                value={birthday}
                onChange={(e) => setBirthday(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Where we met">
              <input
                type="text"
                value={whereMet}
                onChange={(e) => setWhereMet(e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>

          <Field label="Address">
            <textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              rows={2}
              className={inputClass + " resize-y"}
            />
          </Field>

          <Field label="Mutual interests">
            <input
              type="text"
              value={mutual}
              onChange={(e) => setMutual(e.target.value)}
              placeholder="comma-separated"
              className={inputClass}
            />
          </Field>

          <Field label="Notes">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className={inputClass + " resize-y"}
            />
          </Field>

          <Field label="Aliases (what you might call them)">
            <div className="flex flex-wrap items-center gap-2">
              {aliases.map((a) => (
                <span
                  key={a}
                  className="inline-flex items-center gap-1 rounded-full bg-ink-2 text-text-1 text-xs px-2.5 py-1 font-[family-name:var(--font-mono)]"
                >
                  {a}
                  <button
                    type="button"
                    onClick={() =>
                      setAliases((prev) => prev.filter((x) => x !== a))
                    }
                    className="text-text-2 hover:text-error"
                    aria-label={`Remove ${a}`}
                  >
                    ×
                  </button>
                </span>
              ))}
              <input
                type="text"
                value={aliasDraft}
                onChange={(e) => setAliasDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addAliasFromDraft();
                  }
                }}
                onBlur={addAliasFromDraft}
                placeholder="type + Enter"
                className="bg-transparent outline-none text-sm text-text-0 placeholder:text-text-3 min-w-[120px] flex-1"
              />
            </div>
            <p className="text-[11px] text-text-2 mt-1">
              The first name (or display name) becomes the primary alias
              automatically.
            </p>
          </Field>

          {error && (
            <p className="text-xs text-error font-[family-name:var(--font-mono)]">
              {error}
            </p>
          )}
        </div>

        <footer className="px-8 py-5 flex items-center gap-3 border-t border-ink-3/60">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-3 rounded-sm border border-ink-4 text-sm text-text-1 hover:text-text-0 hover:bg-ink-2 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={(e) => {
              triggerGlowPulse(e.currentTarget);
              void submit();
            }}
            className="ml-auto px-6 py-3 rounded-sm bg-glow-2 text-text-0 hover:bg-glow-1 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium transition-colors"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </footer>
      </aside>
    </div>
  );
}

const inputClass =
  "w-full bg-ink-2 rounded-sm text-sm text-text-0 placeholder:text-text-3 placeholder:italic px-3 py-2 outline outline-1 outline-transparent focus:outline-glow-2";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="card-eyebrow">{label}</span>
      {children}
    </div>
  );
}
