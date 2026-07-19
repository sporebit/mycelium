"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

export default function VentureDetailPage() {
  const params = useParams();
  const ventureId = params.id as string;
  const [venture, setVenture] = useState<Venture | null>(null);
  const [allVentures, setAllVentures] = useState<Venture[]>([]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [ads, setAds] = useState<Ad[]>([]);
  const [tab, setTab] = useState<VentureTab>("overview");
  const [showAdModal, setShowAdModal] = useState(false);
  const [editingAd, setEditingAd] = useState<Ad | null>(null);
  const [adPlatformFilter, setAdPlatformFilter] = useState("all");

  const load = useCallback(async () => {
    const [vr, ar, sr, adr] = await Promise.all([
      fetch(`/api/ventures/${ventureId}`, { cache: "no-store" }),
      fetch("/api/ventures", { cache: "no-store" }),
      fetch(`/api/ventures/${ventureId}/steps`, { cache: "no-store" }),
      fetch(`/api/ventures/${ventureId}/ads`, { cache: "no-store" }),
    ]);
    if (vr.ok) {
      const j = await vr.json();
      setVenture(j.venture);
    }
    if (ar.ok) {
      const j = await ar.json();
      setAllVentures(j.ventures ?? []);
    }
    if (sr.ok) {
      const j = await sr.json();
      setSteps(j.steps ?? []);
    }
    if (adr.ok) {
      const j = await adr.json();
      setAds(j.ads ?? []);
    }
  }, [ventureId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await load();
      if (cancelled) return;
    })();
    return () => { cancelled = true; };
  }, [load]);

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
    await fetch(`/api/ventures/${ventureId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    setVenture((prev) => (prev ? { ...prev, ...fields } : prev));
  }

  if (!venture)
    return (
      <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-12 text-center">
        Loading…
      </div>
    );

  const tabs: { id: VentureTab; label: string }[] = [
    { id: "overview", label: "OVERVIEW" },
    { id: "plan", label: "PLAN" },
    { id: "steps", label: `STEPS (${stepsComplete}/${steps.length})` },
    { id: "ads", label: `ADS (${ads.length})` },
    { id: "notes", label: "NOTES" },
  ];

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
          <h1 className="font-[family-name:var(--font-display)] italic text-2xl text-text-0">
            {venture.name}
          </h1>
          {venture.tagline && (
            <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
              {venture.tagline}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {tabs.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 rounded-md text-[11px] font-[family-name:var(--font-mono)] tracking-[0.15em] border transition-colors ${
                active
                  ? "border-accent/50 bg-accent/15 text-accent"
                  : "border-ink-2 text-ink-3 hover:text-ink-4 hover:border-ink-3"
              }`}
            >
              {t.label}
            </button>
          );
        })}
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
        <StepsTab
          ventureId={ventureId}
          steps={steps}
          onReload={load}
        />
      )}
      {tab === "ads" && (
        <AdsTab
          ventureId={ventureId}
          ads={ads}
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
          onReload={load}
        />
      )}
      {tab === "notes" && <NotesTab venture={venture} onPatch={patchVenture} />}

      {showAdModal && (
        <AdModal
          ventureId={ventureId}
          existing={editingAd}
          onClose={() => setShowAdModal(false)}
          onSaved={() => {
            setShowAdModal(false);
            void load();
          }}
        />
      )}
    </div>
  );
}
