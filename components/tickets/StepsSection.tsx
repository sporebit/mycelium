"use client";

import { useState } from "react";
import { FieldGuide } from "@/components/guide/FieldGuide";
import { useStepsPatch, type StepsPayload } from "@/components/guide/useStepsPatch";
import { useApi } from "@/lib/data/useApi";
import { mergeDailySettings } from "@/lib/daily/settings";
import { useUiPrefs } from "@/lib/settings/useUiPrefs";
import { RUNBOOK_KINDS } from "@/lib/tickets/categories";
import { definitionFromLines, isStepsDefinition } from "@/lib/tickets/steps";
import { validateDefinition } from "@/lib/guides/validate";
import { StepsPage } from "./StepsPage";

/**
 * Steps on a ticket (spec §9.2). Run-book kinds render the Field guide
 * (docs/run/2026-11-28/field-guide-design.md D3); `task`, `habit` and
 * `reminder` keep the plain checklist (StepsPage). With no definition yet:
 * a task gets a "one step per line" box, a run-book kind gets a JSON box
 * (Claude authors definitions in the repo; Phil pastes or imports).
 */
export function StepsSection({ apiKey, kind, title }: { apiKey: string; kind: string; title: string }) {
  const key = `${apiKey}/steps`;
  const { data, error, mutate } = useApi<StepsPayload>(key);
  const { patch, busy, err: saveErr } = useStepsPatch(key, mutate);
  const { prefs } = useUiPrefs();
  const [draft, setDraft] = useState("");
  const [localErr, setErr] = useState<string | null>(null);
  const err = localErr ?? saveErr;
  const isRunbook = (RUNBOOK_KINDS as readonly string[]).includes(kind);
  const ticketKey = decodeURIComponent(apiKey.split("/").pop() ?? "");

  if (error) return <p className="text-sm text-text-lo">Could not load steps.</p>;
  if (!data) return <p className="text-sm text-text-lo">Loading steps…</p>;

  if (data.definition) {
    return (
      <div>
        {isRunbook ? (
          <FieldGuide
            definition={data.definition}
            state={data.state}
            kind={kind}
            onPatch={patch}
            busy={busy}
            frame="ticket"
            chime={mergeDailySettings(prefs.daily).chime}
            ticketKey={ticketKey}
            title={title}
          />
        ) : (
          <StepsPage definition={data.definition} state={data.state} kind={kind} onPatch={patch} busy={busy} />
        )}
        {err && <p className="mt-2 text-[11px] text-danger">{err}</p>}
        <div className="mt-2 text-right">
          <button
            type="button"
            onClick={() => {
              if (confirm("Remove the checklist from this ticket? Ticks and answers are kept in the row until a new definition is set.")) {
                void patch({ definition: null });
              }
            }}
            className="text-[11px] text-text-lo hover:text-danger"
          >
            remove checklist
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-v2-md border border-dashed border-surface-2 p-3">
      <p className="text-[11px] text-text-lo">
        {isRunbook
          ? "No run-book definition yet. Paste the definition JSON (checklists spec §3.1) or start from a template."
          : "No checklist yet. One step per line."}
      </p>
      <textarea
        className="mt-2 min-h-[80px] w-full rounded-sm bg-surface-2 px-3 py-2 font-[family-name:var(--font-mono)] text-[12px] text-text-hi outline-none"
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
                const v = validateDefinition(parsed);
                if (!v.ok) throw new Error(v.errors.join(" "));
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
