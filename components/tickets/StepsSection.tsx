"use client";

import { useState } from "react";
import { useApi } from "@/lib/data/useApi";
import { RUNBOOK_KINDS } from "@/lib/tickets/categories";
import {
  definitionFromLines,
  isStepsDefinition,
  type StatePatch,
  type StepsDefinition,
  type StepsState,
} from "@/lib/tickets/steps";
import { StepsPage } from "./StepsPage";
import { ticketFetch } from "./pickers";

type Payload = {
  definition: StepsDefinition | null;
  state: StepsState;
  counts: { done: number; total: number };
};

/**
 * Steps on a ticket (spec §9.2). Run-book kinds render the house-style page;
 * `task` renders a plain checklist. With no definition yet: a task gets a
 * "one step per line" box, a run-book kind gets a JSON box (Claude authors
 * definitions in the repo; Phil pastes or imports).
 */
export function StepsSection({ apiKey, kind, title }: { apiKey: string; kind: string; title: string }) {
  const key = `${apiKey}/steps`;
  const { data, error, mutate } = useApi<Payload>(key);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const isRunbook = (RUNBOOK_KINDS as readonly string[]).includes(kind);

  const patch = async (p: StatePatch & { definition?: StepsDefinition | null }) => {
    setBusy(true);
    setErr(null);
    // optimistic tick: merge locally the same way the server does
    await mutate(
      async (current) => {
        const res = await ticketFetch<Payload>(key, { method: "PATCH", body: p });
        return { ...(current ?? res), ...res };
      },
      { revalidate: false, rollbackOnError: true },
    ).catch((e) => setErr(e instanceof Error ? e.message : "save failed"));
    setBusy(false);
  };

  if (error) return <p className="text-sm text-ink-3">Could not load steps.</p>;
  if (!data) return <p className="text-sm text-ink-3">Loading steps…</p>;

  if (data.definition) {
    return (
      <div>
        <StepsPage definition={data.definition} state={data.state} kind={kind} onPatch={patch} busy={busy} />
        {err && <p className="mt-2 text-[11px] text-danger">{err}</p>}
        <div className="mt-2 text-right">
          <button
            type="button"
            onClick={() => {
              if (confirm("Remove the checklist from this ticket? Ticks and answers are kept in the row until a new definition is set.")) {
                void patch({ definition: null });
              }
            }}
            className="text-[11px] text-ink-3 hover:text-danger"
          >
            remove checklist
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-v2-md border border-dashed border-ink-2 p-3">
      <p className="text-[11px] text-ink-3">
        {isRunbook
          ? "No run-book definition yet. Paste the definition JSON (checklists spec §3.1) or start from a template."
          : "No checklist yet. One step per line."}
      </p>
      <textarea
        className="mt-2 min-h-[80px] w-full rounded-sm bg-ink-2 px-3 py-2 font-[family-name:var(--font-mono)] text-[12px] text-text-0 outline-none"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={isRunbook ? '{ "phases": [ { "id": "1", "title": "…", "steps": [ … ] } ] }' : "Find the receipt\nPrint the return label\nDrop at the post office"}
      />
      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          disabled={busy || !draft.trim()}
          onClick={() => {
            if (isRunbook) {
              try {
                const parsed = JSON.parse(draft) as unknown;
                if (!isStepsDefinition(parsed)) throw new Error("needs phases[] with steps[]");
                void patch({ definition: parsed });
              } catch (e) {
                setErr(e instanceof Error ? e.message : "bad JSON");
              }
            } else {
              void patch({ definition: definitionFromLines(title, draft.split("\n")) });
            }
            setDraft("");
          }}
          className="rounded-sm bg-glow-2/20 px-3 py-1 text-sm text-glow-2 disabled:opacity-40"
        >
          {isRunbook ? "Set definition" : "Add checklist"}
        </button>
        {err && <span className="text-[11px] text-danger">{err}</span>}
      </div>
    </div>
  );
}
