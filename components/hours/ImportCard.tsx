"use client";

import { useRef, useState } from "react";
import { Button, Label } from "@/components/ui";
import { Mono } from "@/components/dashboard/Mono";
import { useApi } from "@/lib/data/useApi";
import { fmtHm } from "@/lib/hours/calc";
import type { HoursImportRun } from "@/lib/hours/types";
import type { EntryFields, PlanConflict, PlanUpdate } from "@/lib/hours/import";
import { HOURS_BUNDLE_KEY } from "./useHours";
import { mutate as globalMutate } from "swr";

type Summary = {
  dry_run: boolean;
  counts: Record<string, number>;
  changed: PlanUpdate[];
  conflicts: PlanConflict[];
  rejected: Array<{ row: number; reason: string }>;
  settings_changes: Array<{ field: string; from: unknown; to: unknown }>;
  can_apply: boolean;
  applied?: Record<string, unknown>;
  error?: string;
};

const RUNS_KEY = "/api/hours/import";

function describe(f: EntryFields): string {
  return `${f.entry_date ?? "no date"} · ${f.minutes === null ? "open" : fmtHm(f.minutes)} · ${f.description || "(no description)"} · ${f.ticket_raw || "(no ticket)"}${f.logged ? " · logged" : ""}`;
}

/**
 * Settings → Import (spec §6): a JSON file (the seed shape or a JSON
 * backup) goes through a dry run first — added / changed / unchanged /
 * conflicts, before-and-after for every change — then APPLY writes it in
 * one transaction. Conflicts need a side picked each. UNDO LAST reverses
 * the most recent applied import.
 */
export function ImportCard() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ name: string; json: unknown } | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [resolutions, setResolutions] = useState<Record<string, "file" | "db">>({});
  const [busy, setBusy] = useState<"plan" | "apply" | "undo" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const { data: runs, mutate: refreshRuns } = useApi<{ runs: HoursImportRun[]; can_undo: boolean }>(RUNS_KEY);

  const pick = async (f: File | undefined) => {
    setSummary(null);
    setResolutions({});
    setErr(null);
    if (!f) return setFile(null);
    try {
      setFile({ name: f.name, json: JSON.parse(await f.text()) });
    } catch {
      setFile(null);
      setErr("That file is not JSON.");
    }
  };

  const post = async (dryRun: boolean, res: Record<string, "file" | "db"> = resolutions) => {
    if (!file) return;
    setBusy(dryRun ? "plan" : "apply");
    setErr(null);
    try {
      const r = await fetch("/api/hours/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ file: file.json, filename: file.name, format: "json", dryRun, resolutions: res }),
      });
      const j = (await r.json()) as Summary;
      if (!r.ok && !j.counts) throw new Error(j.error ?? `${r.status}`);
      setSummary(j);
      if (!dryRun && r.ok) {
        await Promise.all([globalMutate(HOURS_BUNDLE_KEY), refreshRuns()]);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "failed");
    } finally {
      setBusy(null);
    }
  };

  const resolve = (id: string, side: "file" | "db") => {
    const next = { ...resolutions, [id]: side };
    setResolutions(next);
    void post(true, next);
  };

  const undo = async () => {
    if (!window.confirm("Undo the last import? Rows it added are removed; rows it changed go back.")) return;
    setBusy("undo");
    setErr(null);
    try {
      const r = await fetch("/api/hours/import/undo", { method: "POST" });
      const j = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(j.error ?? `${r.status}`);
      setSummary(null);
      await Promise.all([globalMutate(HOURS_BUNDLE_KEY), refreshRuns()]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "failed");
    } finally {
      setBusy(null);
    }
  };

  const c = summary?.counts;

  return (
    <section className="rounded-v2-lg border border-hairline p-4 flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="text-sm font-semibold text-text-hi">Import</h2>
        <span className="text-xs text-text-lo">JSON backup or the workbook extract. Dry run first; nothing is deleted by an import.</span>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
        <Button size="sm" onClick={() => fileRef.current?.click()}>
          {file ? file.name : "CHOOSE FILE"}
        </Button>
        <Button size="sm" variant="primary" disabled={!file || busy !== null} loading={busy === "plan"} onClick={() => void post(true)}>
          DRY RUN
        </Button>
        <Button size="sm" disabled={!summary || !summary.dry_run || !summary.can_apply || busy !== null} loading={busy === "apply"} onClick={() => void post(false)}>
          APPLY
        </Button>
        <Button size="sm" variant="danger" disabled={!runs?.can_undo || busy !== null} loading={busy === "undo"} onClick={() => void undo()}>
          UNDO LAST
        </Button>
      </div>

      {err && <div className="text-xs text-v2-error">{err}</div>}

      {summary && c && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <Count label={summary.dry_run ? "To add" : "Added"} n={c.added} />
            <Count label={summary.dry_run ? "To change" : "Changed"} n={c.changed} />
            <Count label="Unchanged" n={c.unchanged} />
            <Count label="Conflicts" n={c.conflicts} warn />
            <Count label="Rejected" n={c.rejected} warn />
            <Count label="Absences added" n={c.absences_added} />
            <Count label="Bank holidays added" n={c.holidays_added} />
            <Count label="Settings changed" n={c.settings_changed} />
          </div>
          {summary.applied && <div className="text-xs text-ok">Applied. The views have refreshed.</div>}
          {summary.dry_run && !summary.can_apply && <div className="text-xs text-v2-error">Pick a side for each conflict and fix the rejected rows before applying.</div>}

          {summary.conflicts.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label>Conflicts — changed in Mycelium after the file was exported</Label>
              {summary.conflicts.map((k) => (
                <div key={k.id} className="rounded-v2-md border border-hairline p-2 text-xs flex flex-col gap-1">
                  <div>
                    <span className="text-text-lo">file: </span>
                    <Mono>{describe(k.file)}</Mono>
                  </div>
                  <div>
                    <span className="text-text-lo">here: </span>
                    <Mono>{describe(k.db)}</Mono>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => resolve(k.id, "file")}>
                      TAKE FILE
                    </Button>
                    <Button size="sm" onClick={() => resolve(k.id, "db")}>
                      KEEP MINE
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {summary.changed.length > 0 && (
            <div className="flex flex-col gap-1">
              <Label>Changes</Label>
              {summary.changed.slice(0, 50).map((u) => (
                <div key={u.id} className="text-xs">
                  <div className="text-text-lo">
                    <Mono>{describe(u.before)}</Mono>
                  </div>
                  <div className="text-text-hi">
                    <Mono>{describe(u.after)}</Mono>
                  </div>
                </div>
              ))}
              {summary.changed.length > 50 && <div className="text-xs text-text-lo">… {summary.changed.length - 50} more</div>}
            </div>
          )}

          {summary.rejected.length > 0 && (
            <div className="flex flex-col gap-1">
              <Label>Rejected rows</Label>
              {summary.rejected.map((r, i) => (
                <div key={i} className="text-xs text-v2-error">
                  row {r.row}: {r.reason}
                </div>
              ))}
            </div>
          )}

          {summary.settings_changes.length > 0 && (
            <div className="flex flex-col gap-1">
              <Label>Settings</Label>
              {summary.settings_changes.map((s) => (
                <div key={s.field} className="text-xs text-text-mid">
                  <Mono>{s.field}</Mono>: {JSON.stringify(s.from)} → {JSON.stringify(s.to)}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {runs && runs.runs.length > 0 && (
        <div className="flex flex-col gap-1">
          <Label>Recent imports</Label>
          {runs.runs.map((r) => (
            <div key={r.id} className={`text-xs ${r.undone_at ? "line-through text-text-lo" : "text-text-mid"}`}>
              <Mono>{r.ran_at.slice(0, 16).replace("T", " ")}</Mono> · {r.filename || r.format} · +{r.counts.inserted ?? 0} / ~{r.counts.updated ?? 0}
              {r.undone_at ? " · undone" : ""}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Count({ label, n, warn = false }: { label: string; n: number | undefined; warn?: boolean }) {
  const v = n ?? 0;
  return (
    <div className="rounded-v2-md border border-hairline px-3 py-2">
      <Label>{label}</Label>
      <div className={`mt-1 text-sm ${warn && v > 0 ? "text-v2-error" : "text-text-hi"}`}>
        <Mono>{v}</Mono>
      </div>
    </div>
  );
}
