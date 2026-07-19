"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { OverviewTab } from "@/components/ventures/detail/OverviewTab";
import { PlanTab } from "@/components/ventures/detail/PlanTab";
import { StepsTab } from "@/components/ventures/detail/StepsTab";
import { AdsTab } from "@/components/ventures/detail/AdsTab";
import { NotesTab } from "@/components/ventures/detail/NotesTab";
import { AdModal } from "@/components/ventures/detail/AdModal";
import {
  type Ad,
  type Step,
  type Venture,
  type VentureTab,
} from "@/lib/ventures/types";
import { useApi } from "@/lib/data/useApi";
import { mutateApi } from "@/lib/data/mutateApi";

export default function VentureDetailPage() {
  const params = useParams();
  const ventureId = params.id as string;

  const ventureKey = `/api/ventures/${ventureId}`;
  const allVenturesKey = "/api/ventures";
  const stepsKey = `/api/ventures/${ventureId}/steps`;
  const adsKey = `/api/ventures/${ventureId}/ads`;

  const { data: ventureData } = useApi<{ venture: Venture }>(ventureKey);
  const { data: allData } = useApi<{ ventures: Venture[] }>(allVenturesKey);
  const { data: stepsData } = useApi<{ steps: Step[] }>(stepsKey);
  const { data: adsData } = useApi<{ ads: Ad[] }>(adsKey);

  const venture = ventureData?.venture ?? null;
  const allVentures = allData?.ventures ?? [];
  const steps = stepsData?.steps ?? [];
  const ads = adsData?.ads ?? [];

  const [tab, setTab] = useState<VentureTab>("overview");
  const [showAdModal, setShowAdModal] = useState(false);
  const [editingAd, setEditingAd] = useState<Ad | null>(null);
  const [adPlatformFilter, setAdPlatformFilter] = useState("all");

  const parent = useMemo(
    () => allVentures.find((v) => v.id === venture?.parent_id),
    [allVentures, venture],
  );
  const children = useMemo(
    () => allVentures.filter((v) => v.parent_id === ventureId),
    [allVentures, ventureId],
  );
  const stepsComplete = steps.filter((s) => s.status === "done").length;

  async function patchVenture(fields: Partial<Venture>) {
    await mutateApi<{ venture: Venture }>(
      ventureKey,
      (current) => ({
        venture: current?.venture
          ? { ...current.venture, ...fields }
          : ({ ...fields } as Venture),
      }),
      async () => {
        const res = await fetch(ventureKey, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(fields),
        });
        if (!res.ok) throw new Error(`venture update failed (${res.status})`);
      },
    );
  }

  if (!venture)
    return (
      <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-12 text-center">
        Loading…
      </div>
    );

  // Ads tab hidden unless there's activity — keeps a fresh venture's
  // tab row lean. "Activity" = any ad row OR any recorded spend.
  const hasAdActivity =
    ads.length > 0 || ads.some((a) => (a.budget_spent ?? 0) > 0);
  const tabs: { id: VentureTab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "plan", label: "Plan" },
    { id: "steps", label: `Steps (${stepsComplete}/${steps.length})` },
    ...(hasAdActivity
      ? [{ id: "ads" as const, label: `Ads (${ads.length})` }]
      : []),
    { id: "notes", label: "Notes" },
  ];
  // If Ads was previously active but now hidden, snap back to Overview.
  if (tab === "ads" && !hasAdActivity) {
    setTab("overview");
  }

  return (
    <div className="flex flex-col gap-5">
      {parent && (
        <Link
          href={`/ventures/${parent.id}`}
          className="text-xs text-ink-3 hover:text-accent font-[family-name:var(--font-mono)] tracking-[0.08em]"
        >
          ← {parent.name}
        </Link>
      )}

      <div className="flex items-start gap-3 flex-wrap">
        <div
          className="w-1.5 h-8 rounded-full shrink-0 mt-1"
          style={{ backgroundColor: venture.accent_colour }}
        />
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-semibold text-text-hi tracking-[-0.02em] leading-[1.15]">
            {venture.name}
          </h1>
          {venture.tagline && (
            <p className="text-sm text-text-mid">
              {venture.tagline}
            </p>
          )}
        </div>
      </div>

      {/* 5-tab row: horizontal scroll on narrow — SegmentedControl's
          sliding pill assumes similar-width labels, but the counter labels
          (e.g. "Steps (3/12)") vary too much for that to look clean. */}
      <div className="-mx-4 sm:mx-0 overflow-x-auto no-scrollbar">
        <div className="inline-flex items-center gap-1 px-4 sm:px-0 bg-surface-1 border border-hairline rounded-v2-md p-0.5">
          {tabs.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded-v2-sm text-[12px] font-[family-name:var(--font-inter-tight)] transition-colors duration-[var(--dur-fast)] [transition-timing-function:var(--ease-out)] ${
                  active
                    ? "bg-surface-3 text-text-hi"
                    : "text-text-lo hover:text-text-mid"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {tab === "overview" && (
        <OverviewTab
          venture={venture}
          childVentures={children}
          stepsComplete={stepsComplete}
          stepsTotal={steps.length}
          adsCount={ads.length}
          onPatch={patchVenture}
        />
      )}
      {tab === "plan" && <PlanTab venture={venture} onPatch={patchVenture} />}
      {tab === "steps" && (
        <StepsTab ventureId={ventureId} steps={steps} stepsKey={stepsKey} />
      )}
      {tab === "ads" && (
        <AdsTab
          ventureId={ventureId}
          ads={ads}
          adsKey={adsKey}
          platformFilter={adPlatformFilter}
          onPlatformFilter={setAdPlatformFilter}
          onAdd={() => {
            setEditingAd(null);
            setShowAdModal(true);
          }}
          onEdit={(ad) => {
            setEditingAd(ad);
            setShowAdModal(true);
          }}
        />
      )}
      {tab === "notes" && <NotesTab venture={venture} onPatch={patchVenture} />}

      {showAdModal && (
        <AdModal
          ventureId={ventureId}
          adsKey={adsKey}
          existing={editingAd}
          onClose={() => setShowAdModal(false)}
          onSaved={() => setShowAdModal(false)}
        />
      )}
    </div>
  );
}
