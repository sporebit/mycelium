"use client";

import { PLATFORM_COLOURS, PLATFORM_OPTIONS, type Ad } from "@/lib/ventures/types";

export function AdsTab({
  ventureId,
  ads,
  platformFilter,
  onPlatformFilter,
  onAdd,
  onEdit,
  onReload,
}: {
  ventureId: string;
  ads: Ad[];
  platformFilter: string;
  onPlatformFilter: (v: string) => void;
  onAdd: () => void;
  onEdit: (ad: Ad) => void;
  onReload: () => void;
}) {
  const filtered =
    platformFilter === "all"
      ? ads
      : ads.filter((a) => a.platform === platformFilter);

  async function deleteAd(adId: string) {
    await fetch(`/api/ventures/${ventureId}/ads/${adId}`, {
      method: "DELETE",
    });
    onReload();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {["all", ...PLATFORM_OPTIONS].map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPlatformFilter(p)}
            className={`px-2.5 py-1 rounded-md text-[10px] font-[family-name:var(--font-mono)] tracking-[0.12em] uppercase border transition-colors ${
              platformFilter === p
                ? "border-accent/50 bg-accent/15 text-accent"
                : "border-ink-2 text-ink-3 hover:text-ink-4"
            }`}
          >
            {p}
          </button>
        ))}
        <button
          type="button"
          onClick={onAdd}
          className="ml-auto px-3 py-1.5 rounded-md bg-glow-2 text-text-0 hover:bg-glow-1 text-[11px] font-[family-name:var(--font-mono)] tracking-[0.12em]"
        >
          + ADD AD
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-8 text-center">
          No ads yet.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((ad) => (
            <div
              key={ad.id}
              className="rounded-md bg-ink-1 p-4 flex gap-4 group"
            >
              {ad.media_url && (
                <div className="shrink-0 w-16 h-16 rounded-md bg-ink-2 overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={ad.media_url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[9px] font-[family-name:var(--font-mono)] tracking-[0.1em] uppercase ${PLATFORM_COLOURS[ad.platform] ?? ""}`}
                  >
                    {ad.platform}
                  </span>
                  {ad.campaign_name && (
                    <span className="text-xs text-ink-3 truncate">
                      {ad.campaign_name}
                    </span>
                  )}
                </div>
                {ad.headline && (
                  <div className="text-sm text-text-0 font-medium">
                    {ad.headline}
                  </div>
                )}
                <div className="flex flex-wrap gap-3 mt-1.5 text-[10px] font-[family-name:var(--font-mono)] text-ink-3">
                  {ad.start_date && (
                    <span>
                      {ad.start_date}
                      {ad.end_date ? ` → ${ad.end_date}` : " → ongoing"}
                    </span>
                  )}
                  {ad.budget_spent != null && (
                    <span>£{Number(ad.budget_spent).toFixed(2)}</span>
                  )}
                  {ad.roas != null && (
                    <span className="text-ok">
                      ROAS {Number(ad.roas).toFixed(1)}x
                    </span>
                  )}
                  {ad.impressions != null && (
                    <span>{ad.impressions.toLocaleString()} impr</span>
                  )}
                  {ad.clicks != null && <span>{ad.clicks} clicks</span>}
                </div>
              </div>
              <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={() => onEdit(ad)}
                  className="text-[9px] text-ink-3 hover:text-accent font-[family-name:var(--font-mono)]"
                >
                  EDIT
                </button>
                <button
                  type="button"
                  onClick={() => deleteAd(ad.id)}
                  className="text-[9px] text-ink-3 hover:text-danger font-[family-name:var(--font-mono)]"
                >
                  DEL
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
