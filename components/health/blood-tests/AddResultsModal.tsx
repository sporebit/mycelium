"use client";

import { useState } from "react";
import {
  ACCENT,
  ALL_MARKERS,
  PANEL_ORDER,
  type ParsedResult,
} from "@/lib/health/blood-markers";

export function AddResultsModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [mode, setMode] = useState<"pdf" | "manual">("pdf");
  const [uploading, setUploading] = useState(false);
  const [parsedResults, setParsedResults] = useState<ParsedResult[] | null>(
    null
  );
  const [parsedDate, setParsedDate] = useState("");
  const [parsedProvider, setParsedProvider] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Manual entry state
  const [manualDate, setManualDate] = useState("");
  const [manualProvider, setManualProvider] = useState("Thriva");
  const [manualValues, setManualValues] = useState<
    Record<string, string>
  >({});

  async function handlePdfUpload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/health/blood-tests/parse", {
        method: "POST",
        body: form,
      });
      if (!res.ok) throw new Error("Parse failed");
      const j = (await res.json()) as {
        parsed?: {
          sampled_at?: string;
          provider?: string;
          results?: ParsedResult[];
        };
      };
      if (!j.parsed?.results) throw new Error("No results parsed");
      setParsedResults(j.parsed.results);
      setParsedDate(j.parsed.sampled_at ?? "");
      setParsedProvider(j.parsed.provider ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function saveResults(
    date: string,
    provider: string,
    results: {
      marker_key: string;
      value_raw: string;
      value_numeric: number | null;
      value_prefix: string | null;
      ref_min: number | null;
      ref_max: number | null;
      ref_direction: string;
      unit: string;
    }[]
  ) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/health/blood-tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sampled_at: date,
          provider,
          results,
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function handleManualSave() {
    if (!manualDate) {
      setError("Date is required");
      return;
    }
    const results: {
      marker_key: string;
      value_raw: string;
      value_numeric: number | null;
      value_prefix: string | null;
      ref_min: number | null;
      ref_max: number | null;
      ref_direction: string;
      unit: string;
    }[] = [];

    for (const m of ALL_MARKERS) {
      const raw = manualValues[m.key]?.trim();
      if (!raw) continue;

      let prefix: string | null = null;
      let numStr = raw;
      if (raw.startsWith("<") || raw.startsWith(">")) {
        prefix = raw[0];
        numStr = raw.slice(1);
      }
      const num = parseFloat(numStr);

      results.push({
        marker_key: m.key,
        value_raw: raw,
        value_numeric: Number.isFinite(num) ? num : null,
        value_prefix: prefix,
        ref_min: null,
        ref_max: null,
        ref_direction: "between",
        unit: "",
      });
    }

    if (results.length === 0) {
      setError("Enter at least one marker value");
      return;
    }

    void saveResults(manualDate, manualProvider, results);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[10vh] overflow-y-auto">
      <div className="bg-ink-1 border border-ink-2 rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        {/* Modal header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-2">
          <h2 className="text-lg font-[family-name:var(--font-display)] italic text-ink-4">
            Add Results
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-ink-3 hover:text-ink-4 text-lg"
          >
            ✕
          </button>
        </div>

        {/* Mode tabs */}
        <div className="flex gap-0 border-b border-ink-2 px-5">
          {(["pdf", "manual"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => { setMode(m); setError(null); }}
              className={`px-3 py-2 text-[11px] uppercase tracking-[0.18em] font-[family-name:var(--font-mono)] transition-colors border-b-2 -mb-px ${
                mode === m
                  ? "text-ink-4 border-current"
                  : "text-ink-3 border-transparent hover:text-ink-4"
              }`}
              style={mode === m ? { borderColor: ACCENT } : undefined}
            >
              {m === "pdf" ? "Upload PDF" : "Enter manually"}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error && (
            <div className="mb-3 text-sm text-warn font-[family-name:var(--font-mono)] bg-warn/10 border border-warn/30 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          {mode === "pdf" && !parsedResults && (
            <div className="flex flex-col items-center gap-4 py-8">
              {uploading ? (
                <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
                  Parsing PDF…
                </p>
              ) : (
                <>
                  <p className="text-sm text-ink-3">
                    Upload a blood test results PDF to extract markers
                    automatically.
                  </p>
                  <label className="cursor-pointer px-4 py-2 rounded-md border border-ink-2 text-sm text-ink-4 hover:border-ink-3 transition-colors font-[family-name:var(--font-mono)]">
                    Choose PDF
                    <input
                      type="file"
                      accept=".pdf"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void handlePdfUpload(f);
                      }}
                    />
                  </label>
                </>
              )}
            </div>
          )}

          {mode === "pdf" && parsedResults && (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
                    Date
                  </label>
                  <input
                    type="date"
                    value={parsedDate}
                    onChange={(e) => setParsedDate(e.target.value)}
                    className="mt-1 w-full bg-ink-0 border border-ink-2 rounded-md px-2 py-1.5 text-sm text-ink-4 font-[family-name:var(--font-mono)]"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
                    Provider
                  </label>
                  <input
                    type="text"
                    value={parsedProvider}
                    onChange={(e) => setParsedProvider(e.target.value)}
                    className="mt-1 w-full bg-ink-0 border border-ink-2 rounded-md px-2 py-1.5 text-sm text-ink-4 font-[family-name:var(--font-mono)]"
                  />
                </div>
              </div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] mt-2">
                {parsedResults.length} markers extracted — review before saving
              </div>
              <div className="rounded-md border border-ink-2 overflow-hidden max-h-[40vh] overflow-y-auto">
                <div className="grid grid-cols-[1fr_80px_80px] gap-0 text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] bg-ink-0/40 px-3 py-2 border-b border-ink-2 sticky top-0">
                  <span>Marker</span>
                  <span className="text-right">Value</span>
                  <span className="text-right">Unit</span>
                </div>
                {parsedResults.map((r, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-[1fr_80px_80px] gap-0 items-center px-3 py-2 border-b border-ink-2/40 last:border-b-0"
                  >
                    <span className="text-sm text-ink-4 truncate">
                      {r.display_name}
                    </span>
                    <input
                      type="text"
                      value={r.value_raw}
                      onChange={(e) => {
                        const next = [...parsedResults];
                        next[i] = { ...next[i], value_raw: e.target.value };
                        const raw = e.target.value.trim();
                        let prefix: string | null = null;
                        let numStr = raw;
                        if (raw.startsWith("<") || raw.startsWith(">")) {
                          prefix = raw[0];
                          numStr = raw.slice(1);
                        }
                        const num = parseFloat(numStr);
                        next[i].value_numeric = Number.isFinite(num)
                          ? num
                          : null;
                        next[i].value_prefix = prefix;
                        setParsedResults(next);
                      }}
                      className="bg-ink-0 border border-ink-2 rounded px-1.5 py-1 text-sm text-ink-4 font-[family-name:var(--font-mono)] tabular-nums text-right"
                    />
                    <span className="text-xs text-ink-3 text-right font-[family-name:var(--font-mono)]">
                      {r.unit}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {mode === "manual" && (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
                    Date
                  </label>
                  <input
                    type="date"
                    value={manualDate}
                    onChange={(e) => setManualDate(e.target.value)}
                    className="mt-1 w-full bg-ink-0 border border-ink-2 rounded-md px-2 py-1.5 text-sm text-ink-4 font-[family-name:var(--font-mono)]"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
                    Provider
                  </label>
                  <input
                    type="text"
                    value={manualProvider}
                    onChange={(e) => setManualProvider(e.target.value)}
                    className="mt-1 w-full bg-ink-0 border border-ink-2 rounded-md px-2 py-1.5 text-sm text-ink-4 font-[family-name:var(--font-mono)]"
                  />
                </div>
              </div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] mt-2">
                Enter values — leave blank to skip
              </div>
              <div className="rounded-md border border-ink-2 overflow-hidden max-h-[40vh] overflow-y-auto">
                {PANEL_ORDER.map((panel) => (
                  <div key={panel}>
                    <div className="text-[10px] uppercase tracking-[0.18em] text-ink-3/60 font-[family-name:var(--font-mono)] bg-ink-0/40 px-3 py-1.5 border-b border-ink-2 sticky top-0">
                      {panel}
                    </div>
                    {ALL_MARKERS.filter((m) => m.panel === panel).map((m) => (
                      <div
                        key={m.key}
                        className="grid grid-cols-[1fr_100px] gap-2 items-center px-3 py-1.5 border-b border-ink-2/40 last:border-b-0"
                      >
                        <span className="text-sm text-ink-4">{m.name}</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder="—"
                          value={manualValues[m.key] ?? ""}
                          onChange={(e) =>
                            setManualValues((prev) => ({
                              ...prev,
                              [m.key]: e.target.value,
                            }))
                          }
                          className="bg-ink-0 border border-ink-2 rounded px-1.5 py-1 text-sm text-ink-4 font-[family-name:var(--font-mono)] tabular-nums text-right"
                        />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal footer */}
        <div className="flex justify-end gap-3 px-5 py-4 border-t border-ink-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-md border border-ink-2 text-[11px] uppercase tracking-[0.18em] text-ink-3 hover:text-ink-4 font-[family-name:var(--font-mono)] transition-colors"
          >
            Cancel
          </button>
          {mode === "pdf" && parsedResults && (
            <button
              type="button"
              disabled={saving || !parsedDate}
              onClick={() => {
                void saveResults(
                  parsedDate,
                  parsedProvider,
                  parsedResults.map((r) => ({
                    marker_key: r.marker_key,
                    value_raw: r.value_raw,
                    value_numeric: r.value_numeric,
                    value_prefix: r.value_prefix,
                    ref_min: r.ref_min,
                    ref_max: r.ref_max,
                    ref_direction: r.ref_direction,
                    unit: r.unit,
                  }))
                );
              }}
              className="px-4 py-1.5 rounded-md text-[11px] uppercase tracking-[0.18em] font-[family-name:var(--font-mono)] transition-colors disabled:opacity-50"
              style={{ backgroundColor: ACCENT, color: "#000" }}
            >
              {saving ? "Saving…" : "Save results"}
            </button>
          )}
          {mode === "manual" && (
            <button
              type="button"
              disabled={saving}
              onClick={handleManualSave}
              className="px-4 py-1.5 rounded-md text-[11px] uppercase tracking-[0.18em] font-[family-name:var(--font-mono)] transition-colors disabled:opacity-50"
              style={{ backgroundColor: ACCENT, color: "#000" }}
            >
              {saving ? "Saving…" : "Save results"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
