"use client";

import { useEffect, useMemo, useState } from "react";
import { Mono } from "@/components/dashboard/Mono";

type Scope = "fitness" | "capture";

type Rule = {
  id: string;
  user_id: string;
  scope: Scope;
  rule_key: string;
  display_name: string;
  description: string;
  examples: string[] | null;
  enabled: boolean;
  priority: number;
  created_at: string;
  updated_at: string;
};

type MatchedRule = {
  id: string;
  rule_key: string;
  display_name: string;
  priority: number;
};

type TestResult = {
  text: string;
  scope: Scope;
  classification: Record<string, unknown> | null;
  llm_source: string | null;
  matched_rules: MatchedRule[];
  total_enabled_rules: number;
};

type Toast = { kind: "ok" | "error"; text: string } | null;

const SCOPE_LABEL: Record<Scope, string> = {
  fitness: "FITNESS ROUTING",
  capture: "CAPTURE ROUTING",
};

export function RulesClient() {
  const [tab, setTab] = useState<Scope>("fitness");
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const [showTest, setShowTest] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/routing-rules", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { rules?: Rule[] }) => {
        if (cancelled) return;
        setRules(Array.isArray(j?.rules) ? j.rules : []);
      })
      .catch(() => {
        if (cancelled) return;
        setRules([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(id);
  }, [toast]);

  function showToast(kind: "ok" | "error", text: string) {
    setToast({ kind, text });
  }

  async function patchRule(id: string, patch: Partial<Rule>) {
    if (busyId) return;
    setBusyId(id);
    const prev = rules ?? [];
    setRules((cur) =>
      (cur ?? []).map((r) => (r.id === id ? { ...r, ...patch } : r)),
    );
    try {
      const res = await fetch(`/api/routing-rules/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const j = (await res.json().catch(() => ({}))) as {
        rule?: Rule;
        error?: string;
      };
      if (!res.ok || !j.rule) {
        setRules(prev);
        showToast("error", j.error ?? "Update failed");
        return;
      }
      setRules((cur) =>
        (cur ?? []).map((r) => (r.id === id ? j.rule! : r)),
      );
    } catch {
      setRules(prev);
      showToast("error", "Update failed");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteRule(id: string) {
    if (busyId) return;
    if (!window.confirm("Delete this rule? This can't be undone.")) return;
    setBusyId(id);
    const prev = rules ?? [];
    setRules((cur) => (cur ?? []).filter((r) => r.id !== id));
    try {
      const res = await fetch(`/api/routing-rules/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setRules(prev);
        showToast("error", "Delete failed");
      }
    } catch {
      setRules(prev);
      showToast("error", "Delete failed");
    } finally {
      setBusyId(null);
    }
  }

  async function createRule(payload: {
    scope: Scope;
    rule_key: string;
    display_name: string;
    description: string;
    examples: string[];
    priority: number;
  }) {
    if (adding) return;
    setAdding(true);
    try {
      const res = await fetch("/api/routing-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = (await res.json().catch(() => ({}))) as {
        rule?: Rule;
        error?: string;
      };
      if (!res.ok || !j.rule) {
        showToast("error", j.error ?? "Create failed");
        return;
      }
      setRules((cur) => [...(cur ?? []), j.rule!]);
      setShowAddForm(false);
      showToast("ok", "Rule added");
    } finally {
      setAdding(false);
    }
  }

  const tabRules = useMemo(
    () =>
      (rules ?? [])
        .filter((r) => r.scope === tab)
        .sort((a, b) => {
          if (a.priority !== b.priority) return b.priority - a.priority;
          return a.rule_key.localeCompare(b.rule_key);
        }),
    [rules, tab],
  );

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <h1 className="font-[family-name:var(--font-display)] italic text-2xl text-text-0">
            Routing rules
          </h1>
          {rules !== null && (
            <Mono className="text-[10px] text-ink-3">
              {tabRules.length} IN {SCOPE_LABEL[tab]}
            </Mono>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowTest(true)}
          className="px-3 py-1.5 rounded-md border border-accent/40 bg-accent/15 text-accent text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] hover:bg-accent/25"
        >
          TEST →
        </button>
      </header>

      <div
        role="tablist"
        aria-label="Routing scope"
        className="flex rounded-md border border-ink-2 overflow-hidden text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] self-start"
      >
        {(["fitness", "capture"] as const).map((s) => {
          const active = tab === s;
          return (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(s)}
              className={`px-3 py-2 transition-colors ${
                active
                  ? "bg-accent/15 text-accent"
                  : "text-ink-3 hover:text-ink-4 hover:bg-ink-2/40"
              }`}
            >
              {SCOPE_LABEL[s]}
            </button>
          );
        })}
      </div>

      {rules === null ? (
        <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-12 text-center">
          Loading rules…
        </div>
      ) : tabRules.length === 0 ? (
        <div className="rounded-md bg-ink-1 p-8 text-center">
          <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
            No rules in {SCOPE_LABEL[tab]}.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {tabRules.map((r) => (
            <li key={r.id}>
              <RuleRow
                rule={r}
                busy={busyId === r.id}
                onPatch={(p) => void patchRule(r.id, p)}
                onDelete={() => void deleteRule(r.id)}
              />
            </li>
          ))}
        </ul>
      )}

      {showAddForm ? (
        <AddRuleForm
          scope={tab}
          busy={adding}
          onCancel={() => setShowAddForm(false)}
          onSubmit={(p) => void createRule(p)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setShowAddForm(true)}
          className="self-start px-3 py-1.5 rounded-md border border-ink-2 text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] text-ink-3 hover:text-ink-4 hover:border-ink-3"
        >
          + Add rule
        </button>
      )}

      {showTest && (
        <TestPanel
          scope={tab}
          onClose={() => setShowTest(false)}
        />
      )}

      {toast && (
        <div
          role="status"
          className={`growth-in fixed bottom-6 left-1/2 -translate-x-1/2 z-[120] px-4 py-2 rounded-md text-sm shadow-2xl font-[family-name:var(--font-mono)] ${
            toast.kind === "ok"
              ? "bg-ok/20 text-ok border border-ok/40"
              : "bg-danger/20 text-danger border border-danger/40"
          }`}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}

function RuleRow({
  rule,
  busy,
  onPatch,
  onDelete,
}: {
  rule: Rule;
  busy: boolean;
  onPatch: (p: Partial<Rule>) => void;
  onDelete: () => void;
}) {
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(rule.display_name);
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState(rule.description);
  const [exampleDraft, setExampleDraft] = useState("");

  function saveName() {
    setEditingName(false);
    const v = nameDraft.trim();
    if (!v || v === rule.display_name) {
      setNameDraft(rule.display_name);
      return;
    }
    onPatch({ display_name: v });
  }

  function saveDesc() {
    setEditingDesc(false);
    const v = descDraft.trim();
    if (!v || v === rule.description) {
      setDescDraft(rule.description);
      return;
    }
    onPatch({ description: v });
  }

  function addExample() {
    const v = exampleDraft.trim();
    if (!v) return;
    const current = rule.examples ?? [];
    if (current.some((e) => e.toLowerCase() === v.toLowerCase())) {
      setExampleDraft("");
      return;
    }
    onPatch({ examples: [...current, v] });
    setExampleDraft("");
  }

  function removeExample(ex: string) {
    onPatch({ examples: (rule.examples ?? []).filter((e) => e !== ex) });
  }

  return (
    <article
      className={`bg-ink-1 rounded-md p-4 flex flex-col gap-3 ${
        rule.enabled ? "" : "opacity-50"
      }`}
    >
      <div className="flex items-start gap-3 flex-wrap">
        <button
          type="button"
          onClick={() => onPatch({ enabled: !rule.enabled })}
          disabled={busy}
          aria-pressed={rule.enabled}
          aria-label={rule.enabled ? "Disable rule" : "Enable rule"}
          className={`shrink-0 h-6 w-11 rounded-full border transition-colors relative ${
            rule.enabled
              ? "bg-accent/30 border-accent/60"
              : "bg-ink-2 border-ink-3"
          }`}
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full transition-all ${
              rule.enabled
                ? "left-[22px] bg-accent"
                : "left-0.5 bg-ink-4"
            }`}
          />
        </button>

        <div className="flex-1 min-w-[160px]">
          {editingName ? (
            <input
              autoFocus
              type="text"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  saveName();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setNameDraft(rule.display_name);
                  setEditingName(false);
                }
              }}
              className="w-full bg-transparent border-b border-accent outline-none text-base text-text-0 pb-0.5"
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                setNameDraft(rule.display_name);
                setEditingName(true);
              }}
              className="text-left text-base text-text-0 hover:opacity-80 transition-opacity"
            >
              {rule.display_name}
            </button>
          )}
          <Mono className="block text-[10px] text-ink-3 mt-0.5">
            {rule.rule_key}
          </Mono>
        </div>

        <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] shrink-0">
          PRIO
          <input
            type="number"
            value={rule.priority}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n)) onPatch({ priority: Math.round(n) });
            }}
            disabled={busy}
            className="w-14 bg-ink-2 rounded-sm text-sm text-text-0 px-2 py-1 outline outline-1 outline-transparent focus:outline-glow-2 tabular-nums"
          />
        </label>

        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          aria-label="Delete rule"
          className="text-ink-3 hover:text-danger transition-colors text-base shrink-0"
        >
          ×
        </button>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
          Description
        </span>
        {editingDesc ? (
          <textarea
            autoFocus
            value={descDraft}
            onChange={(e) => setDescDraft(e.target.value)}
            onBlur={saveDesc}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                setDescDraft(rule.description);
                setEditingDesc(false);
              }
            }}
            rows={2}
            className="bg-ink-2 rounded-sm text-sm text-text-0 px-3 py-2 outline outline-1 outline-glow-2 resize-y"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setDescDraft(rule.description);
              setEditingDesc(true);
            }}
            className="text-left text-sm text-text-1 hover:text-text-0 transition-colors bg-ink-0/40 border border-ink-2 rounded-sm px-3 py-2 line-clamp-2 hover:line-clamp-none"
          >
            {rule.description}
          </button>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
          Examples
        </span>
        <div className="flex flex-wrap items-center gap-1.5 rounded-sm bg-ink-2 px-2 py-1.5 outline outline-1 outline-transparent focus-within:outline-glow-2">
          {(rule.examples ?? []).map((ex) => (
            <span
              key={ex}
              className="inline-flex items-center gap-1 text-[11px] font-[family-name:var(--font-mono)] px-1.5 py-0.5 rounded-md border border-accent/40 bg-accent/15 text-accent"
            >
              {ex}
              <button
                type="button"
                onClick={() => removeExample(ex)}
                aria-label={`Remove ${ex}`}
                className="text-accent/70 hover:text-accent"
              >
                ×
              </button>
            </span>
          ))}
          <input
            type="text"
            value={exampleDraft}
            onChange={(e) => setExampleDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addExample();
              } else if (
                e.key === "Backspace" &&
                !exampleDraft &&
                (rule.examples ?? []).length > 0
              ) {
                removeExample((rule.examples ?? [])[(rule.examples ?? []).length - 1]);
              }
            }}
            onBlur={addExample}
            placeholder="Add example, press Enter"
            className="flex-1 min-w-[120px] bg-transparent outline-none text-sm text-text-0 placeholder:text-text-3"
          />
        </div>
      </div>
    </article>
  );
}

function AddRuleForm({
  scope,
  busy,
  onCancel,
  onSubmit,
}: {
  scope: Scope;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (payload: {
    scope: Scope;
    rule_key: string;
    display_name: string;
    description: string;
    examples: string[];
    priority: number;
  }) => void;
}) {
  const [displayName, setDisplayName] = useState("");
  const [ruleKey, setRuleKey] = useState("");
  const [description, setDescription] = useState("");
  const [examplesDraft, setExamplesDraft] = useState("");
  const [priority, setPriority] = useState("0");
  const autoKey = useMemo(
    () =>
      displayName
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 64) || "",
    [displayName],
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const examples = examplesDraft
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    onSubmit({
      scope,
      rule_key: ruleKey.trim() || autoKey,
      display_name: displayName.trim(),
      description: description.trim(),
      examples,
      priority: Number(priority) || 0,
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-ink-1 rounded-md p-4 flex flex-col gap-3"
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
          New {SCOPE_LABEL[scope].toLowerCase()} rule
        </span>
        <button
          type="button"
          onClick={onCancel}
          className="text-ink-3 hover:text-ink-4 text-sm"
          aria-label="Cancel"
        >
          ×
        </button>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
          Display name
        </span>
        <input
          autoFocus
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
          placeholder="e.g. Slot — morning"
          className="bg-ink-2 rounded-sm text-sm text-text-0 placeholder:text-text-3 px-3 py-2 outline outline-1 outline-transparent focus:outline-glow-2"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
          Rule key {autoKey && !ruleKey && `(auto: ${autoKey})`}
        </span>
        <input
          type="text"
          value={ruleKey}
          onChange={(e) => setRuleKey(e.target.value)}
          placeholder={autoKey || "lowercase_snake"}
          className="bg-ink-2 rounded-sm text-sm text-text-0 placeholder:text-text-3 px-3 py-2 outline outline-1 outline-transparent focus:outline-glow-2 font-[family-name:var(--font-mono)]"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
          Description
        </span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          rows={2}
          placeholder="What does this rule do?"
          className="bg-ink-2 rounded-sm text-sm text-text-0 placeholder:text-text-3 px-3 py-2 outline outline-1 outline-transparent focus:outline-glow-2 resize-y"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
          Examples (comma-separated)
        </span>
        <input
          type="text"
          value={examplesDraft}
          onChange={(e) => setExamplesDraft(e.target.value)}
          placeholder="e.g. morning, this morning"
          className="bg-ink-2 rounded-sm text-sm text-text-0 placeholder:text-text-3 px-3 py-2 outline outline-1 outline-transparent focus:outline-glow-2"
        />
      </label>
      <label className="flex flex-col gap-1 max-w-[160px]">
        <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
          Priority
        </span>
        <input
          type="number"
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          className="bg-ink-2 rounded-sm text-sm text-text-0 px-3 py-2 outline outline-1 outline-transparent focus:outline-glow-2 tabular-nums"
        />
      </label>
      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-sm border border-ink-4 text-sm text-text-1 hover:text-text-0 hover:bg-ink-2"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy || !displayName.trim() || !description.trim()}
          className="px-4 py-2 rounded-sm bg-glow-2 text-text-0 hover:bg-glow-1 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium"
        >
          {busy ? "Adding…" : "Create rule"}
        </button>
      </div>
    </form>
  );
}

function TestPanel({
  scope,
  onClose,
}: {
  scope: Scope;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runTest() {
    if (running || !text.trim()) return;
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/routing-rules/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim(), scope }),
      });
      const j = (await res.json().catch(() => ({}))) as
        | TestResult
        | { error?: string };
      if (!res.ok || !("matched_rules" in j)) {
        setError(("error" in j && j.error) || `Test failed (${res.status})`);
        return;
      }
      setResult(j);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Test failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Test routing rules"
      className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="growth-in w-full sm:max-w-lg bg-ink-1 border border-ink-2 rounded-t-2xl sm:rounded-lg shadow-2xl flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-ink-2">
          <div>
            <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
              Routing rules tester · {SCOPE_LABEL[scope]}
            </span>
            <h2 className="text-lg italic font-[family-name:var(--font-display)] text-text-0 mt-1">
              Sample a capture
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-text-2 hover:text-text-0 text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <div className="px-5 py-4 overflow-y-auto flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
              Sample text
            </span>
            <textarea
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              placeholder={
                scope === "fitness"
                  ? "e.g. KB EMOM this morning"
                  : "e.g. buy milk on the way home"
              }
              className="bg-ink-2 rounded-sm text-sm text-text-0 placeholder:text-text-3 px-3 py-2 outline outline-1 outline-transparent focus:outline-glow-2 resize-y"
            />
          </label>

          <button
            type="button"
            disabled={running || !text.trim()}
            onClick={runTest}
            className="self-start px-4 py-2 rounded-sm bg-glow-2 text-text-0 hover:bg-glow-1 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium"
          >
            {running ? "Running…" : "Test"}
          </button>

          {error && (
            <div className="text-[11px] uppercase tracking-[0.18em] text-danger font-[family-name:var(--font-mono)]">
              ⚠ {error}
            </div>
          )}

          {result && (
            <div className="flex flex-col gap-3 mt-2">
              {result.classification && (
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
                    Classification ({result.llm_source ?? "—"})
                  </span>
                  <pre className="bg-ink-0/40 border border-ink-2 rounded-sm p-3 text-[11px] text-text-1 overflow-x-auto font-[family-name:var(--font-mono)]">
                    {JSON.stringify(result.classification, null, 2)}
                  </pre>
                </div>
              )}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
                  Matched rules ({result.matched_rules.length} /{" "}
                  {result.total_enabled_rules} enabled)
                </span>
                {result.matched_rules.length === 0 ? (
                  <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
                    No user rules matched — the LLM fell back to the static
                    defaults.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {result.matched_rules.map((m) => (
                      <li
                        key={m.id}
                        className="flex items-center gap-2 px-3 py-2 bg-ink-0/40 border border-ink-2 rounded-sm"
                      >
                        <Mono className="text-[10px] text-ink-3 shrink-0">
                          P{m.priority}
                        </Mono>
                        <span className="text-sm text-text-0 flex-1 truncate">
                          {m.display_name}
                        </span>
                        <Mono className="text-[10px] text-ink-3 shrink-0">
                          {m.rule_key}
                        </Mono>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
