"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ACCENT,
  PANEL_ORDER,
  type BloodTestResult,
  type Session,
  fmtDate,
  getStatus,
  getTrendArrow,
} from "@/lib/health/blood-markers";
import { ResultRow } from "@/components/health/blood-tests/ResultRow";
import { HistoryTab } from "@/components/health/blood-tests/HistoryTab";
import { AddResultsModal } from "@/components/health/blood-tests/AddResultsModal";

export default function BloodTestsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"latest" | "history">("latest");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null
  );
  const [collapsedPanels, setCollapsedPanels] = useState<Set<string>>(
    new Set()
  );
  const [historyMarker, setHistoryMarker] = useState("egfr");
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/health/blood-tests")
      .then((r) => r.json())
      .then((j: { sessions?: Session[] }) => {
        if (cancelled) return;
        const s = j.sessions ?? [];
        setSessions(s);
        if (s.length > 0) setSelectedSessionId(s[0].id);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = useMemo(
    () => sessions.find((s) => s.id === selectedSessionId) ?? sessions[0],
    [sessions, selectedSessionId]
  );

  const prevSession = useMemo(() => {
    if (!selected) return undefined;
    const idx = sessions.findIndex((s) => s.id === selected.id);
    return idx >= 0 && idx < sessions.length - 1
      ? sessions[idx + 1]
      : undefined;
  }, [sessions, selected]);

  const togglePanel = (panel: string) => {
    setCollapsedPanels((prev) => {
      const next = new Set(prev);
      if (next.has(panel)) next.delete(panel);
      else next.add(panel);
      return next;
    });
  };

  const groupedResults = useMemo(() => {
    if (!selected) return [];
    const byPanel = new Map<string, BloodTestResult[]>();
    for (const r of selected.results) {
      const list = byPanel.get(r.panel) ?? [];
      list.push(r);
      byPanel.set(r.panel, list);
    }
    return PANEL_ORDER.filter((p) => byPanel.has(p)).map((panel) => {
      const results = byPanel.get(panel)!;
      results.sort((a, b) => {
        const sa = getStatus(a) === "abnormal" ? 0 : 1;
        const sb = getStatus(b) === "abnormal" ? 0 : 1;
        if (sa !== sb) return sa - sb;
        return a.sort_order - b.sort_order;
      });
      return { panel, results };
    });
  }, [selected]);

  const reloadSessions = useCallback(async () => {
    const r = await fetch("/api/health/blood-tests");
    const j = (await r.json()) as { sessions?: Session[] };
    const s = j.sessions ?? [];
    setSessions(s);
    if (s.length > 0 && !s.find((x) => x.id === selectedSessionId)) {
      setSelectedSessionId(s[0].id);
    }
  }, [selectedSessionId]);

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-[family-name:var(--font-display)] italic text-ink-4">
            Blood Tests
          </h1>
          <p className="text-sm text-ink-3 mt-1">
            Markers, ranges, and trends across sessions.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {sessions.length > 1 && (
            <select
              value={selectedSessionId ?? ""}
              onChange={(e) => setSelectedSessionId(e.target.value)}
              className="bg-ink-0 border border-ink-2 rounded-md px-2 py-1.5 text-sm text-ink-4 font-[family-name:var(--font-mono)]"
            >
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {fmtDate(s.sampled_at)} — {s.provider}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="shrink-0 px-3 py-1.5 rounded-md border border-ink-2 text-[11px] uppercase tracking-[0.18em] text-ink-3 hover:text-ink-4 hover:border-ink-3 font-[family-name:var(--font-mono)] transition-colors"
          >
            Add results
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-ink-2">
        {(["latest", "history"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-[11px] uppercase tracking-[0.18em] font-[family-name:var(--font-mono)] transition-colors border-b-2 -mb-px ${
              tab === t
                ? "text-ink-4 border-current"
                : "text-ink-3 border-transparent hover:text-ink-4"
            }`}
            style={tab === t ? { borderColor: ACCENT } : undefined}
          >
            {t === "latest" ? "Latest Results" : "History"}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-12 text-center">
          Loading blood tests…
        </div>
      )}

      {/* Tab: Latest Results */}
      {!loading && tab === "latest" && selected && (
        <div className="flex flex-col gap-4">
          {groupedResults.map(({ panel, results }) => {
            const collapsed = collapsedPanels.has(panel);
            return (
              <section key={panel}>
                <button
                  type="button"
                  onClick={() => togglePanel(panel)}
                  className="flex items-center gap-2 w-full text-left mb-2"
                >
                  <span className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)]">
                    {collapsed ? "▶" : "▼"}
                  </span>
                  <h3 className="text-[11px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
                    {panel}
                  </h3>
                  <span className="text-[10px] text-ink-3/60 font-[family-name:var(--font-mono)]">
                    {results.filter((r) => getStatus(r) === "abnormal").length >
                    0
                      ? `${results.filter((r) => getStatus(r) === "abnormal").length} flagged`
                      : "all normal"}
                  </span>
                </button>
                {!collapsed && (
                  <div className="rounded-md border border-ink-2 overflow-hidden">
                    {results.map((r) => {
                      const status = getStatus(r);
                      const prevResult = prevSession?.results.find(
                        (pr) => pr.marker_key === r.marker_key
                      );
                      const trend = getTrendArrow(r, prevResult);
                      return (
                        <ResultRow
                          key={r.marker_key}
                          result={r}
                          status={status}
                          trend={trend}
                        />
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
          {groupedResults.length === 0 && (
            <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-6 text-center">
              No results in this session.
            </p>
          )}
        </div>
      )}

      {/* Tab: History */}
      {!loading && tab === "history" && (
        <HistoryTab
          sessions={sessions}
          historyMarker={historyMarker}
          onMarkerChange={setHistoryMarker}
        />
      )}

      {/* Add Results Modal */}
      {showAddModal && (
        <AddResultsModal
          onClose={() => setShowAddModal(false)}
          onSaved={() => {
            setShowAddModal(false);
            void reloadSessions();
          }}
        />
      )}
    </div>
  );
}
