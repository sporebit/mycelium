"use client";

import { useRef, useState } from "react";
import { Button, Label, SegmentedControl } from "@/components/ui";
import { Mono } from "@/components/dashboard/Mono";
import { useApi } from "@/lib/data/useApi";
import { fmtHm } from "@/lib/hours/calc";
import type { HoursImportRun } from "@/lib/hours/types";
import type { EntryFields, PlanConflict, PlanUpdate } from "@/lib/hours/import";
import { INPUT } from "./kit";
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

type Source = "json" | "xlsx" | "paste";

const RUNS_KEY = "/api/hours/import";

function describe(f: EntryFields): string {
  return `${f.entry_date ?? "no date"} · ${f.minutes === null ? "open" : fmtHm(f.minutes)} · ${f.description || "(no description)"} · ${f.ticket_raw || "(no ticket)"}${f.logged ? " · logged" : ""}`;
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/**
 * Settings → Import (spec §6). Three sources, one planner: a JSON backup
 * (the seed shape), the workbook's Log columns pasted straight from Excel
 * (Date, Time Spent, Estimate, Description, Ticket, Logged — for the
 * parallel run, D4), or an .xlsx whose Log sheet carries them (an export
 * round-trips by Entry ID). Always a dry run first — added / changed /
 * unchanged / conflicts with before-and-after — then APPLY writes it in one
 * transaction. Conflicts need a side picked each. UNDO LAST reverses the
 * most recent applied import. An import never deletes.
 */
export function ImportCard() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<Source>("paste");
  const [file, setFile] = useState<{ name: string; json?: unknown; xlsx?: string } | null>(null);
  const [paste, setPaste] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [resolutions, setResolutions] = useState<Record<string, "file" | "db">>({});
  const [busy, setBusy] = useState<"plan" | "apply" | "undo" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const { data: runs, mutate: refreshRuns } = useApi<{ runs: HoursImportRun[]; can_undo: boolean }>(RUNS_KEY);

  const reset = () => {
    setSummary(null);
    setResolutions({});
    setErr(null);
  };

  const pick = async (f: File | undefined) => {
    reset();
    if (!f) return setFile(null);
    try {
      if (source === "json") setFile({ name: f.name, json: JSON.parse(await f.text()) });
      else setFile({ name: f.name, xlsx: toBase64(await f.arrayBuffer()) });
    } catch {
      setFile(null);
      setErr(source === "json" ? "That file is not JSON." : "Could not read that workbook.");
    }
  };

  const ready = source === "paste" ? paste.trim() !== "" : source === "json" ? !!file?.json : !!file?.xlsx;

  const post = async (dryRun: boolean, res: Record<string, "file" | "db"> = resolutions) => {
    if (!ready) return;
    setBusy(dryRun ? "plan" : "apply");
    setErr(null);
    const body: Record<string, unknown> = { dryRun, resolutions: res, format: source };
    if (source === "paste") {
      body.paste = paste;
      body.filename = "paste";
    } else if (source === "json") {
      body.file = file!.json;
      body.filename = file!.name;
    } else {
      body.xlsx = file!.xlsx;
      body.filename = file!.name;
    }
    try {
      const r = await fetch("/api/hours/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = (await r.json()) as Summary;
      if (!r.ok && !j.counts) throw new Error(j.error ?? `${r.status}`);
      setSummary(j);
      if (!dryRun && r.ok) {
        await Promise.all([globalMutate(HOURS_BUNDLE_KEY), refreshRuns()]);
        if (source === "paste") setPaste("");
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
        <span className="text-xs text-text-lo">Dry run first; nothing is deleted by an import.</span>
      </div>

      <SegmentedControl
        options={[
          { value: "paste", label: "Paste from the workbook" },
          { value: "xlsx", label: ".xlsx" },
          { value: "json", label: "JSON backup" },
        ]}
        value={source}
        onChange={(v) => {
          setSource(v as Source);
          setFile(null);
          reset();
        }}
      />

      {source === "paste" ? (
        <div className="flex flex-col gap-1">
          <textarea
            value={paste}
            onChange={(e) => {
              setPaste(e.target.value);
              reset();
            }}
            rows={6}
            placeholder={"Copy the Log rows in Excel and paste here.\nColumns: Date, Time Spent, Estimate, Description, Ticket, Logged (x). A header row is fine."}
            className={`${INPUT} font-[family-name:var(--font-mono)] text-xs`}
          />
          <span className="text-[11px] text-text-lo">Rows identical to an entry already here count as unchanged; the rest are added. Dates as 19/11/2026 or 2026-11-19.</span>
        </div>
      ) : (
        <div className="flex items-center gap-2 flex-wrap">
          <input
            key={source}
            ref={fileRef}
            type="file"
            accept={source === "json" ? ".json,application/json" : ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}
            className="hidden"
            onChange={(e) => void pick(e.target.files?.[0])}
          />
          <Button size="sm" onClick={() => fileRef.current?.click()}>
            {file ? file.name : "CHOOSE FILE"}
          </Button>
          <span className="text-[11px] text-text-lo">{source === "json" ? "A JSON backup from Export, or the seed shape." : "The workbook, or an .xlsx from Export (its Log sheet is read; Entry IDs make it an upsert)."}</span>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <Button size="sm" variant="primary" disabled={!ready || busy !== null} loading={busy === "plan"} onClick={() => void post(true)}>
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
