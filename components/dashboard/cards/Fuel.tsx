"use client";

import { useEffect, useState } from "react";
import { Panel } from "../Panel";
import { Mono } from "../Mono";
import { Money } from "@/components/finance/Money";
import type { FuelApiResponse, Station } from "@/lib/fuel/types";
import type { CardWidth } from "@/lib/dashboard/card-registry";

const REFRESH_MS = 30 * 60_000;

function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "just now";
  const m = ms / 60_000;
  if (m < 1) return "just now";
  if (m < 60) return `${Math.floor(m)}m ago`;
  const h = m / 60;
  if (h < 24) return `${Math.floor(h)}h ago`;
  const d = h / 24;
  return `${Math.floor(d)}d ago`;
}

function shortAddress(s: Station): string {
  // Truncate at the first comma if there is one; otherwise first 24 chars.
  const a = s.address.split(",")[0]?.trim() || s.postcode || "";
  return a.length > 24 ? a.slice(0, 23) + "…" : a || s.brand;
}

function StationRow({
  station,
  price,
}: {
  station: Station;
  price: number;
}) {
  const dist = station.distanceMiles?.toFixed(1) ?? "—";
  return (
    <li className="flex items-center justify-between gap-2 py-1.5 first:pt-0 last:pb-0">
      <div className="flex-1 min-w-0">
        <div className="text-sm text-ink-4 truncate">
          <span className="text-ink-3">{station.brand}</span> · {shortAddress(station)}
        </div>
      </div>
      <Mono className="text-[11px] text-ink-4 shrink-0"><Money value={price} format="pence" /></Mono>
      <Mono className="text-[10px] text-ink-3 shrink-0 w-12 text-right">
        {dist}mi
      </Mono>
    </li>
  );
}

function topNCheapest(
  stations: Station[],
  field: "e10" | "b7",
  n = 3
): Array<{ station: Station; price: number }> {
  const filtered = stations
    .filter((s): s is Station & { [k in typeof field]: number } => s[field] !== null)
    .sort((a, b) => a[field] - b[field])
    .slice(0, n);
  return filtered.map((s) => ({ station: s, price: s[field] }));
}

export function Fuel({ width = 1 }: { width?: CardWidth } = {}) {
  const [data, setData] = useState<FuelApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const res = await fetch("/api/fuel", { cache: "no-store" });
        if (!mounted) return;
        if (!res.ok) {
          if (res.status !== 502) setError(`Load failed (${res.status})`);
          return;
        }
        const j = (await res.json()) as FuelApiResponse;
        if (!mounted) return;
        setData(j);
      } catch {
        if (mounted) setError("Network error");
      }
    }
    void load();
    const id = setInterval(load, REFRESH_MS);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      mounted = false;
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(id);
  }, [error]);

  const stationCount = data?.summary.stationCount ?? 0;
  const e10Cheapest = data ? topNCheapest(data.stations, "e10") : [];
  const b7Cheapest = data ? topNCheapest(data.stations, "b7") : [];

  return (
    <Panel
      borderless
      title="FUEL"
      topRight={<Mono>ARMTHORPE 5MI</Mono>}
    >
      {error && (
        <div className="mb-3 text-[10px] uppercase tracking-[0.18em] text-danger font-[family-name:var(--font-mono)]">
          ⚠ {error}
        </div>
      )}

      {data === null ? (
        <div className="text-xs text-ink-3 italic font-[family-name:var(--font-display)] py-3">
          Loading…
        </div>
      ) : stationCount === 0 ? (
        <div className="text-xs text-ink-3 italic font-[family-name:var(--font-display)] py-3 leading-relaxed">
          No fuel data — sources may be down. Try refreshing later.
        </div>
      ) : (
        <>
          {width >= 3 ? (
            <div className="grid grid-cols-3 gap-6">
              <div className="flex flex-col gap-4">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
                    E10 avg
                  </div>
                  <Mono className="block text-2xl text-ink-4 mt-1">
                    {data.summary.avgE10 != null ? <Money value={data.summary.avgE10} format="pence" /> : "—"}
                  </Mono>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
                    B7 avg
                  </div>
                  <Mono className="block text-2xl text-ink-4 mt-1">
                    {data.summary.avgB7 != null ? <Money value={data.summary.avgB7} format="pence" /> : "—"}
                  </Mono>
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] mb-1">
                  Cheapest E10
                </div>
                {e10Cheapest.length === 0 ? (
                  <div className="text-xs text-ink-3 italic font-[family-name:var(--font-display)] py-1">
                    None nearby.
                  </div>
                ) : (
                  <ul className="flex flex-col divide-y divide-ink-2">
                    {e10Cheapest.map((c) => (
                      <StationRow
                        key={`e10-${c.station.siteId}`}
                        station={c.station}
                        price={c.price}
                      />
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] mb-1">
                  Cheapest B7
                </div>
                {b7Cheapest.length === 0 ? (
                  <div className="text-xs text-ink-3 italic font-[family-name:var(--font-display)] py-1">
                    None nearby.
                  </div>
                ) : (
                  <ul className="flex flex-col divide-y divide-ink-2">
                    {b7Cheapest.map((c) => (
                      <StationRow
                        key={`b7-${c.station.siteId}`}
                        station={c.station}
                        price={c.price}
                      />
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* Averages */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
                    E10 avg
                  </div>
                  <Mono className="block text-xl text-ink-4 mt-1">
                    {data.summary.avgE10 != null ? <Money value={data.summary.avgE10} format="pence" /> : "—"}
                  </Mono>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
                    B7 avg
                  </div>
                  <Mono className="block text-xl text-ink-4 mt-1">
                    {data.summary.avgB7 != null ? <Money value={data.summary.avgB7} format="pence" /> : "—"}
                  </Mono>
                </div>
              </div>

              {/* Cheapest E10 */}
              <div className="mt-4">
                <div className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] mb-1">
                  Cheapest E10
                </div>
                {e10Cheapest.length === 0 ? (
                  <div className="text-xs text-ink-3 italic font-[family-name:var(--font-display)] py-1">
                    None nearby.
                  </div>
                ) : (
                  <ul className="flex flex-col divide-y divide-ink-2">
                    {e10Cheapest.map((c) => (
                      <StationRow
                        key={`e10-${c.station.siteId}`}
                        station={c.station}
                        price={c.price}
                      />
                    ))}
                  </ul>
                )}
              </div>

              {/* Cheapest B7 */}
              <div className="mt-3">
                <div className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] mb-1">
                  Cheapest B7
                </div>
                {b7Cheapest.length === 0 ? (
                  <div className="text-xs text-ink-3 italic font-[family-name:var(--font-display)] py-1">
                    None nearby.
                  </div>
                ) : (
                  <ul className="flex flex-col divide-y divide-ink-2">
                    {b7Cheapest.map((c) => (
                      <StationRow
                        key={`b7-${c.station.siteId}`}
                        station={c.station}
                        price={c.price}
                      />
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}

          <div className="mt-3 pt-2 border-t border-ink-2 text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] flex items-center justify-between">
            <span>
              {stationCount} {stationCount === 1 ? "station" : "stations"}
            </span>
            <Mono className="text-ink-3">
              updated {relativeTime(data.lastUpdated)}
            </Mono>
          </div>
        </>
      )}
    </Panel>
  );
}
