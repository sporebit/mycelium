"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Mono } from "@/components/dashboard/Mono";

type Venture = {
  id: string;
  name: string;
  accent_colour: string;
};

type Ad = {
  id: string;
  venture_id: string;
  platform: string;
  campaign_name: string | null;
  headline: string | null;
  start_date: string | null;
  end_date: string | null;
  budget_spent: number | null;
  roas: number | null;
  impressions: number | null;
  clicks: number | null;
};

const PLATFORM_COLOURS: Record<string, string> = {
  meta: "bg-info/20 text-info",
  tiktok: "bg-[#f56db5]/20 text-[#f56db5]",
  google: "bg-warn/20 text-warn",
  pinterest: "bg-danger/20 text-danger",
  twitter: "bg-info/20 text-info",
  youtube: "bg-danger/20 text-danger",
  other: "bg-ink-3/20 text-ink-3",
};

export default function VentureAdsOverviewPage() {
  const [ventures, setVentures] = useState<Venture[]>([]);
  const [allAds, setAllAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/ventures", { cache: "no-store" });
        if (!r.ok || cancelled) return;
        const j = await r.json();
        const vents = (j.ventures ?? []) as Venture[];
        if (cancelled) return;
        setVentures(vents);

        const adResults = await Promise.all(
          vents.map((v) =>
            fetch(`/api/ventures/${v.id}/ads`, { cache: "no-store" })
              .then((r) => r.json())
              .then((j) => (j.ads ?? []) as Ad[])
              .catch(() => [] as Ad[]),
          ),
        );
        if (cancelled) return;
        setAllAds(adResults.flat());
      } catch {
        /* noop */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const ventureMap = new Map(ventures.map((v) => [v.id, v]));

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="font-[family-name:var(--font-display)] italic text-2xl text-text-0">
          All Ads
        </h1>
        <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
          Advertising across all ventures.
        </p>
      </header>

      {loading ? (
        <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-12 text-center">
          Loading…
        </div>
      ) : allAds.length === 0 ? (
        <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-12 text-center">
          No ads yet. Add them from a venture&apos;s detail page.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {allAds.map((ad) => {
            const v = ventureMap.get(ad.venture_id);
            return (
              <Link
                key={ad.id}
                href={`/ventures/${ad.venture_id}`}
                className="rounded-md bg-ink-1 hover:bg-ink-2 transition-colors p-4 flex items-center gap-4"
              >
                <span
                  className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-[family-name:var(--font-mono)] tracking-[0.1em] uppercase ${PLATFORM_COLOURS[ad.platform] ?? ""}`}
                >
                  {ad.platform}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-text-0 truncate">
                    {ad.headline || ad.campaign_name || "Untitled"}
                  </div>
                  {v && (
                    <Mono className="text-[10px] text-ink-3">{v.name}</Mono>
                  )}
                </div>
                <div className="flex gap-3 text-[10px] font-[family-name:var(--font-mono)] text-ink-3">
                  {ad.budget_spent != null && (
                    <span>£{Number(ad.budget_spent).toFixed(2)}</span>
                  )}
                  {ad.roas != null && (
                    <span className="text-ok">
                      {Number(ad.roas).toFixed(1)}x
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
