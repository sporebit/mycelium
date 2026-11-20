"use client";

/**
 * Net worth over time, with the by-hand holdings (master run §10): the
 * pension, the house, the mortgage, the cars. The sheet gives one figure a
 * day; a holding is a figure typed with the day it was true, kept for
 * ever, so the line says when each side last moved and the table says how
 * old each figure is.
 *
 * Nothing is in the page until amounts are shown: names and figures go
 * through the redaction components, and the line is not drawn while
 * amounts are hidden (its axis would give the figures away). A figure is
 * typed where it sits, Enter moves down, as in a spreadsheet.
 */
import { useState, type KeyboardEvent } from "react";
import { Mono } from "@/components/dashboard/Mono";
import { Panel } from "@/components/dashboard/Panel";
import { Money, PrivateText } from "@/components/finance/Money";
import { Button } from "@/components/ui";
import { usePrivacy } from "@/lib/context/PrivacyContext";
import { useApi } from "@/lib/data/useApi";
import type { Holding, NetWorthView } from "@/lib/finance/holdingsServer";
import { HOLDING_KINDS, type HoldingKind, KIND_LABEL, LIABILITY_KINDS, type NetWorthPoint } from "@/lib/finance/netWorth";

const pounds = (pence: number) => pence / 100;
const day = (iso: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

function parse(v: string): number | null | "bad" {
  const s = v.replace(/[£,\s]/g, "");
  if (s === "") return null;
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) return "bad";
  return Math.round(Number(s) * 100);
}

/** The line as a small step chart. Drawn only while amounts are shown. */
function Line({ points }: { points: NetWorthPoint[] }) {
  if (points.length < 2) return <p className="py-4 text-center text-xs text-text-lo">The line starts once there are two points: a sheet refresh and a figure, or two figures.</p>;
  const W = 560;
  const H = 120;
  const t0 = Date.parse(points[0].date);
  const t1 = Math.max(Date.parse(points[points.length - 1].date), t0 + 86_400_000);
  const ys = points.map((p) => p.total_pence);
  const lo = Math.min(0, ...ys);
  const hi = Math.max(...ys, lo + 1);
  const x = (iso: string) => 4 + ((Date.parse(iso) - t0) / (t1 - t0)) * (W - 8);
  const y = (v: number) => 4 + (1 - (v - lo) / (hi - lo)) * (H - 8);
  let d = "";
  points.forEach((p, i) => {
    const px = x(p.date);
    const py = y(p.total_pence);
    if (i === 0) d += `M${px.toFixed(1)},${py.toFixed(1)}`;
    else d += ` H${px.toFixed(1)} V${py.toFixed(1)}`;
  });
  d += ` H${(W - 4).toFixed(1)}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-28 w-full" role="img" aria-label="Net worth over time">
      {lo < 0 ? <line x1={4} x2={W - 4} y1={y(0)} y2={y(0)} className="stroke-hairline" strokeDasharray="3 3" /> : null}
      <path d={d} fill="none" className="stroke-glow" strokeWidth={1.5} />
      {points.map((p) => (
        <circle key={p.date} cx={x(p.date)} cy={y(p.total_pence)} r={2} className="fill-glow" />
      ))}
    </svg>
  );
}

function Row({ h, onFigure, onRemove, busy }: { h: Holding; onFigure: (text: string) => void; onRemove: () => void; busy: boolean }) {
  const { financeHidden } = usePrivacy();
  const shown = h.value_pence === null ? null : Math.abs(h.value_pence);
  const down = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const cells = Array.from(document.querySelectorAll<HTMLInputElement>("input[data-holding-cell]"));
    const next = cells[cells.indexOf(e.currentTarget) + 1];
    e.currentTarget.blur();
    next?.focus();
  };
  return (
    <div role="row" className="grid grid-cols-[minmax(0,1fr)_7rem_8rem_2.5rem] items-center gap-2 border-b border-hairline py-1.5 text-sm" data-testid="holding-row">
      <div className="min-w-0">
        <span className="text-text-hi">
          <PrivateText>{h.name}</PrivateText>
        </span>
        <span className="ml-2 text-[11px] uppercase tracking-[0.08em] text-text-lo">
          {KIND_LABEL[h.kind]}
          {LIABILITY_KINDS.has(h.kind) ? ", owed" : ""}
        </span>
      </div>
      <div className="text-right">
        {financeHidden ? (
          <Mono>{shown === null ? <span className="text-text-lo">—</span> : <Money value={pounds(shown)} format="balance" />}</Mono>
        ) : (
          <input
            key={`${h.id}:${h.value_pence}:${h.as_of}`}
            data-holding-cell
            aria-label={`Figure for ${h.name}`}
            inputMode="decimal"
            placeholder="£"
            disabled={busy}
            defaultValue={shown === null ? "" : (shown / 100).toFixed(shown % 100 === 0 ? 0 : 2)}
            onKeyDown={down}
            onBlur={(e) => onFigure(e.target.value)}
            className="w-full min-h-[32px] rounded-v2-sm border border-transparent bg-transparent px-1 text-right font-[family-name:var(--font-mono)] text-sm tabular-nums text-text-hi hover:border-hairline focus:border-glow focus:bg-surface-0 focus:outline-none placeholder:text-text-lo"
          />
        )}
      </div>
      <div className={`text-right text-xs ${h.freshness === "old" ? "text-warn" : "text-text-lo"}`} data-testid="holding-age">
        {h.as_of ? (
          <>
            {h.age}
            {h.freshness === "old" ? " · old" : ""}
          </>
        ) : (
          "no figure yet"
        )}
      </div>
      {/* the name is not in the label: while amounts are hidden nothing readable is in the page */}
      <button type="button" aria-label="Remove this holding" disabled={busy} onClick={onRemove} className="text-text-lo hover:text-text-hi">
        ×
      </button>
    </div>
  );
}

export function NetWorthPanel() {
  const { data, error, mutate } = useApi<NetWorthView>("/api/finance/networth", { revalidateOnFocus: false });
  const { financeHidden } = usePrivacy();
  const [busy, setBusy] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<HoldingKind>("pension");
  const [name, setName] = useState("");
  const [figure, setFigure] = useState("");
  const [asOf, setAsOf] = useState(() => new Date().toISOString().slice(0, 10));

  const call = async (key: string, input: RequestInfo, init: RequestInit): Promise<boolean> => {
    setBusy(key);
    setSaveError(null);
    try {
      const res = await fetch(input, { headers: { "content-type": "application/json" }, ...init });
      if (!res.ok) throw new Error();
      await mutate();
      return true;
    } catch {
      setSaveError("That did not save. Try again.");
      return false;
    } finally {
      setBusy(null);
    }
  };

  const setHoldingFigure = async (h: Holding, text: string) => {
    const pence = parse(text);
    if (pence === "bad") return setSaveError("A figure is an amount, like 45000.");
    if (pence === null || pence === Math.abs(h.value_pence ?? NaN)) return;
    await call(h.id, `/api/finance/holdings/${h.id}`, { method: "PATCH", body: JSON.stringify({ value_pence: pence }) });
  };

  const add = async () => {
    const pence = parse(figure);
    if (pence === "bad") return setSaveError("A figure is an amount, like 45000.");
    if (!name.trim()) return setSaveError("Give it a name.");
    if (await call("new", "/api/finance/holdings", { method: "POST", body: JSON.stringify({ kind, name: name.trim(), value_pence: pence, as_of: asOf }) })) {
      setAdding(false);
      setName("");
      setFigure("");
    }
  };

  if (error) return <Panel title="NET WORTH OVER TIME">{<p className="py-4 text-sm text-text-mid">This could not be loaded. Reload to try again.</p>}</Panel>;
  if (!data) return <Panel title="NET WORTH OVER TIME">{<p className="py-4 text-sm text-text-lo">Loading…</p>}</Panel>;

  const now = data.now;
  return (
    <Panel title="NET WORTH OVER TIME" topRight={<Mono>{data.series.length ? `${data.series.length} POINTS` : ""}</Mono>}>
      <div className="flex flex-col gap-4" data-testid="net-worth">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-text-lo font-[family-name:var(--font-mono)]">With holdings</div>
            <Mono className="block text-3xl text-text-hi" data-testid="net-worth-total">
              {now ? <Money value={pounds(now.total_pence)} format="balance" /> : <span className="text-text-lo">—</span>}
            </Mono>
          </div>
          {now ? (
            <p className="text-xs text-text-lo">
              Sheet {now.sheet_pence === null ? "not yet" : <Money value={pounds(now.sheet_pence)} format="balance" />}
              {data.sheet_as_of ? ` (${day(data.sheet_as_of)})` : ""} · holdings <Money value={pounds(now.holdings_pence)} format="balance" /> · last moved {day(now.date)}
            </p>
          ) : (
            <p className="text-xs text-text-lo">Nothing yet. Refresh the sheet, or add a holding below.</p>
          )}
          {data.investments_pence > 0 ? (
            <p className="text-xs text-text-lo">
              The Investments page comes to <Money value={pounds(data.investments_pence)} format="balance" /> at its last prices; shown apart, since the sheet may count it already.
            </p>
          ) : null}
        </div>

        {financeHidden ? <p className="py-3 text-center text-xs text-text-lo">Amounts are hidden. Show them to see the line and change a figure.</p> : <Line points={data.series} />}

        <div role="table" aria-label="Holdings by hand">
          <div role="row" className="grid grid-cols-[minmax(0,1fr)_7rem_8rem_2.5rem] gap-2 border-b border-hairline pb-1 text-[10px] uppercase tracking-[0.18em] text-text-lo font-[family-name:var(--font-mono)]">
            <span>Holding</span>
            <span className="text-right">Figure</span>
            <span className="text-right">Given</span>
            <span />
          </div>
          {data.holdings.length === 0 ? <p className="py-3 text-xs text-text-lo">No holdings yet: the pension, the house, the mortgage, a car.</p> : null}
          {data.holdings.map((h) => (
            <Row key={h.id} h={h} busy={busy === h.id} onFigure={(t) => void setHoldingFigure(h, t)} onRemove={() => void call(h.id, `/api/finance/holdings/${h.id}`, { method: "DELETE" })} />
          ))}
        </div>

        {saveError ? (
          <p role="alert" className="text-sm text-v2-error">
            {saveError}
          </p>
        ) : null}

        {adding ? (
          <form
            className="flex flex-wrap items-end gap-2"
            data-testid="holding-add"
            onSubmit={(e) => {
              e.preventDefault();
              void add();
            }}
          >
            <label className="flex flex-col text-xs text-text-lo">
              Kind
              <select value={kind} onChange={(e) => setKind(e.target.value as HoldingKind)} className="min-h-[32px] rounded-v2-sm border border-hairline bg-surface-0 px-2 text-sm text-text-hi">
                {HOLDING_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col text-xs text-text-lo">
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder={kind === "pension" ? "Royal London" : kind === "property" ? "The house" : ""} className="min-h-[32px] w-44 rounded-v2-sm border border-hairline bg-surface-0 px-2 text-sm text-text-hi" />
            </label>
            <label className="flex flex-col text-xs text-text-lo">
              {LIABILITY_KINDS.has(kind) ? "Owed" : "Worth"}
              <input value={figure} onChange={(e) => setFigure(e.target.value)} inputMode="decimal" placeholder="£" className="min-h-[32px] w-28 rounded-v2-sm border border-hairline bg-surface-0 px-2 text-right font-[family-name:var(--font-mono)] text-sm tabular-nums text-text-hi" />
            </label>
            <label className="flex flex-col text-xs text-text-lo">
              True on
              <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="min-h-[32px] rounded-v2-sm border border-hairline bg-surface-0 px-2 text-sm text-text-hi" />
            </label>
            <Button type="submit" size="sm" variant="primary" disabled={busy === "new"}>
              Add
            </Button>
            <Button type="button" size="sm" onClick={() => setAdding(false)}>
              Back
            </Button>
          </form>
        ) : (
          <div>
            <Button size="sm" onClick={() => setAdding(true)} disabled={financeHidden}>
              Add a holding
            </Button>
          </div>
        )}
      </div>
    </Panel>
  );
}
