"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Mono } from "@/components/dashboard/Mono";

type Venture = {
  id: string;
  name: string;
  tagline: string | null;
  parent_id: string | null;
  kind: string;
  status: string;
  description: string | null;
  problem: string | null;
  target_market: string | null;
  mvp: string | null;
  revenue_model: string | null;
  pricing_notes: string | null;
  cost_estimate_monthly: number | null;
  cost_estimate_setup: number | null;
  revenue_projection_monthly: number | null;
  brand_notes: string | null;
  competitors: string | null;
  website_url: string | null;
  accent_colour: string;
};

type Step = {
  id: string;
  venture_id: string;
  title: string;
  description: string | null;
  status: string;
  linked_task_id: string | null;
  sort_order: number;
};

type Ad = {
  id: string;
  venture_id: string;
  platform: string;
  campaign_name: string | null;
  headline: string | null;
  body_copy: string | null;
  media_url: string | null;
  media_type: string | null;
  start_date: string | null;
  end_date: string | null;
  budget_spent: number | null;
  impressions: number | null;
  clicks: number | null;
  conversions: number | null;
  roas: number | null;
  notes: string | null;
};

type Tab = "overview" | "plan" | "steps" | "ads" | "notes";

const STATUS_OPTIONS = ["idea", "exploring", "building", "launched", "paused", "closed"];
const STATUS_COLOURS: Record<string, string> = {
  launched: "bg-ok/20 text-ok",
  building: "bg-info/20 text-info",
  exploring: "bg-warn/20 text-warn",
  idea: "bg-ink-3/20 text-ink-3",
  paused: "bg-ink-3/20 text-ink-3",
  closed: "bg-danger/20 text-danger",
};

const PLATFORM_OPTIONS = ["meta", "tiktok", "google", "pinterest", "twitter", "youtube", "other"];
const PLATFORM_COLOURS: Record<string, string> = {
  meta: "bg-info/20 text-info",
  tiktok: "bg-[#f56db5]/20 text-[#f56db5]",
  google: "bg-warn/20 text-warn",
  pinterest: "bg-danger/20 text-danger",
  twitter: "bg-info/20 text-info",
  youtube: "bg-danger/20 text-danger",
  other: "bg-ink-3/20 text-ink-3",
};

const STEP_STATUS_CYCLE: Record<string, string> = {
  todo: "in_progress",
  in_progress: "done",
  done: "todo",
};

const STEP_STATUS_ICONS: Record<string, string> = {
  todo: "○",
  in_progress: "◐",
  done: "●",
};

export default function VentureDetailPage() {
  const params = useParams();
  const ventureId = params.id as string;
  const [venture, setVenture] = useState<Venture | null>(null);
  const [allVentures, setAllVentures] = useState<Venture[]>([]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [ads, setAds] = useState<Ad[]>([]);
  const [tab, setTab] = useState<Tab>("overview");
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

  const tabs: { id: Tab; label: string }[] = [
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

function EditableField({
  label,
  value,
  onSave,
  multiline,
  type = "text",
}: {
  label: string;
  value: string | number | null;
  onSave: (val: string) => void;
  multiline?: boolean;
  type?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value ?? ""));

  function commit() {
    setEditing(false);
    if (draft !== String(value ?? "")) onSave(draft);
  }

  if (!editing) {
    return (
      <div className="group">
        <Mono className="text-[10px] text-ink-3 mb-1">{label}</Mono>
        <div
          onClick={() => {
            setDraft(String(value ?? ""));
            setEditing(true);
          }}
          className="text-sm text-text-1 cursor-pointer hover:text-text-0 min-h-[1.5rem] whitespace-pre-wrap"
        >
          {value || (
            <span className="text-ink-3 italic text-xs">Click to edit</span>
          )}
        </div>
      </div>
    );
  }

  if (multiline) {
    return (
      <div>
        <Mono className="text-[10px] text-ink-3 mb-1">{label}</Mono>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          rows={4}
          autoFocus
          className="w-full bg-ink-0 border border-ink-2 rounded-md text-sm text-text-0 px-3 py-2 outline-none focus:border-accent resize-y"
        />
      </div>
    );
  }

  return (
    <div>
      <Mono className="text-[10px] text-ink-3 mb-1">{label}</Mono>
      <input
        type={type}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
        autoFocus
        className="w-full bg-ink-0 border border-ink-2 rounded-md text-sm text-text-0 px-3 py-2 outline-none focus:border-accent"
      />
    </div>
  );
}

function OverviewTab({
  venture,
  childVentures,
  stepsComplete,
  stepsTotal,
  adsCount,
  onPatch,
}: {
  venture: Venture;
  childVentures: Venture[];
  stepsComplete: number;
  stepsTotal: number;
  adsCount: number;
  onPatch: (fields: Partial<Venture>) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <EditableField
          label="NAME"
          value={venture.name}
          onSave={(v) => onPatch({ name: v })}
        />
        <EditableField
          label="TAGLINE"
          value={venture.tagline}
          onSave={(v) => onPatch({ tagline: v })}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div>
          <Mono className="text-[10px] text-ink-3 mb-1">STATUS</Mono>
          <select
            value={venture.status}
            onChange={(e) => onPatch({ status: e.target.value })}
            className="bg-ink-2 rounded-sm text-[11px] text-text-1 px-3 py-1.5 outline-none focus:outline-accent font-[family-name:var(--font-mono)] tracking-[0.1em]"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s.toUpperCase()}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Mono className="text-[10px] text-ink-3 mb-1">ACCENT</Mono>
          <input
            type="color"
            value={venture.accent_colour}
            onChange={(e) => onPatch({ accent_colour: e.target.value })}
            className="w-8 h-8 bg-transparent border-none cursor-pointer"
          />
        </div>
      </div>

      <EditableField
        label="DESCRIPTION"
        value={venture.description}
        onSave={(v) => onPatch({ description: v })}
        multiline
      />
      <EditableField
        label="PROBLEM"
        value={venture.problem}
        onSave={(v) => onPatch({ problem: v })}
        multiline
      />
      <EditableField
        label="TARGET MARKET"
        value={venture.target_market}
        onSave={(v) => onPatch({ target_market: v })}
        multiline
      />

      <div className="flex flex-wrap gap-4 text-xs font-[family-name:var(--font-mono)] text-ink-3">
        <span>
          Steps: {stepsComplete}/{stepsTotal} complete
        </span>
        <span>Ads: {adsCount}</span>
      </div>

      {childVentures.length > 0 && (
        <div>
          <Mono className="text-[10px] text-ink-3 mb-2">CHILD VENTURES</Mono>
          <div className="flex flex-wrap gap-2">
            {childVentures.map((c) => (
              <Link
                key={c.id}
                href={`/ventures/${c.id}`}
                className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-ink-2 hover:bg-ink-3/30 transition-colors"
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: c.accent_colour }}
                />
                <span className="text-xs text-text-0">{c.name}</span>
                <span
                  className={`text-[9px] px-1.5 py-0.5 rounded font-[family-name:var(--font-mono)] ${STATUS_COLOURS[c.status] ?? ""}`}
                >
                  {c.status}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PlanTab({
  venture,
  onPatch,
}: {
  venture: Venture;
  onPatch: (fields: Partial<Venture>) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <EditableField
        label="MVP"
        value={venture.mvp}
        onSave={(v) => onPatch({ mvp: v })}
        multiline
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <EditableField
          label="REVENUE MODEL"
          value={venture.revenue_model}
          onSave={(v) => onPatch({ revenue_model: v })}
          multiline
        />
        <EditableField
          label="PRICING NOTES"
          value={venture.pricing_notes}
          onSave={(v) => onPatch({ pricing_notes: v })}
          multiline
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <EditableField
          label="MONTHLY COST ESTIMATE (£)"
          value={venture.cost_estimate_monthly}
          onSave={(v) =>
            onPatch({ cost_estimate_monthly: v ? Number(v) : null } as Partial<Venture>)
          }
          type="number"
        />
        <EditableField
          label="SETUP COST ESTIMATE (£)"
          value={venture.cost_estimate_setup}
          onSave={(v) =>
            onPatch({ cost_estimate_setup: v ? Number(v) : null } as Partial<Venture>)
          }
          type="number"
        />
        <EditableField
          label="MONTHLY REVENUE PROJECTION (£)"
          value={venture.revenue_projection_monthly}
          onSave={(v) =>
            onPatch({
              revenue_projection_monthly: v ? Number(v) : null,
            } as Partial<Venture>)
          }
          type="number"
        />
      </div>
      <EditableField
        label="BRAND NOTES"
        value={venture.brand_notes}
        onSave={(v) => onPatch({ brand_notes: v })}
        multiline
      />
      <EditableField
        label="COMPETITORS"
        value={venture.competitors}
        onSave={(v) => onPatch({ competitors: v })}
        multiline
      />
    </div>
  );
}

function StepsTab({
  ventureId,
  steps,
  onReload,
}: {
  ventureId: string;
  steps: Step[];
  onReload: () => void;
}) {
  const [newTitle, setNewTitle] = useState("");
  const done = steps.filter((s) => s.status === "done").length;
  const pct = steps.length > 0 ? Math.round((done / steps.length) * 100) : 0;

  async function addStep() {
    if (!newTitle.trim()) return;
    await fetch(`/api/ventures/${ventureId}/steps`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle.trim() }),
    });
    setNewTitle("");
    onReload();
  }

  async function toggleStatus(step: Step) {
    const next = STEP_STATUS_CYCLE[step.status] ?? "todo";
    await fetch(`/api/ventures/${ventureId}/steps/${step.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    onReload();
  }

  async function deleteStep(stepId: string) {
    await fetch(`/api/ventures/${ventureId}/steps/${stepId}`, {
      method: "DELETE",
    });
    onReload();
  }

  async function createAsTask(step: Step) {
    const r = await fetch("/api/ventures", { cache: "no-store" });
    let ventureName = "";
    if (r.ok) {
      const j = await r.json();
      const v = (j.ventures as Venture[])?.find((v) => v.id === ventureId);
      ventureName = v?.name ?? "";
    }
    const taskRes = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: `[${ventureName}] ${step.title}`,
        description: step.description || undefined,
        urgency: "someday",
      }),
    });
    if (taskRes.ok) {
      const taskData = await taskRes.json();
      const taskId = taskData.task?.id ?? taskData.id;
      if (taskId) {
        await fetch(`/api/ventures/${ventureId}/steps/${step.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ linked_task_id: taskId }),
        });
      }
    }
    onReload();
  }

  return (
    <div className="flex flex-col gap-4">
      {steps.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <Mono className="text-[10px] text-ink-3">
              {done}/{steps.length} complete
            </Mono>
            <Mono className="text-[10px] text-ink-3">{pct}%</Mono>
          </div>
          <div className="h-1.5 bg-ink-2 rounded-full overflow-hidden">
            <div
              className="h-full bg-ok rounded-full transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1">
        {steps.map((s) => (
          <div
            key={s.id}
            className="flex items-center gap-3 py-2 px-3 rounded-md bg-ink-1 hover:bg-ink-2/60 group transition-colors"
          >
            <button
              type="button"
              onClick={() => toggleStatus(s)}
              className={`text-base shrink-0 ${
                s.status === "done"
                  ? "text-ok"
                  : s.status === "in_progress"
                    ? "text-info"
                    : "text-ink-3"
              }`}
            >
              {STEP_STATUS_ICONS[s.status] ?? "○"}
            </button>
            <div className="flex-1 min-w-0">
              <div
                className={`text-sm ${
                  s.status === "done"
                    ? "text-ink-3 line-through"
                    : "text-text-0"
                }`}
              >
                {s.title}
              </div>
              {s.description && (
                <div className="text-xs text-ink-3 mt-0.5">
                  {s.description}
                </div>
              )}
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {!s.linked_task_id && (
                <button
                  type="button"
                  onClick={() => createAsTask(s)}
                  className="text-[9px] text-ink-3 hover:text-accent font-[family-name:var(--font-mono)] tracking-[0.1em] px-1.5 py-0.5"
                >
                  → TASK
                </button>
              )}
              {s.linked_task_id && (
                <Mono className="text-[9px] text-ok">LINKED</Mono>
              )}
              <button
                type="button"
                onClick={() => deleteStep(s.id)}
                className="text-[9px] text-ink-3 hover:text-danger font-[family-name:var(--font-mono)] px-1.5 py-0.5"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="New step…"
          className="flex-1 bg-ink-0 border border-ink-2 rounded-md text-sm text-text-0 px-3 py-2 outline-none focus:border-accent"
          onKeyDown={(e) => e.key === "Enter" && addStep()}
        />
        <button
          type="button"
          onClick={addStep}
          disabled={!newTitle.trim()}
          className="px-3 py-2 rounded-md bg-accent/15 border border-accent/40 text-accent text-xs font-[family-name:var(--font-mono)] tracking-[0.12em] disabled:opacity-40"
        >
          ADD
        </button>
      </div>
    </div>
  );
}

function AdsTab({
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

function NotesTab({
  venture,
  onPatch,
}: {
  venture: Venture;
  onPatch: (fields: Partial<Venture>) => void;
}) {
  const [draft, setDraft] = useState(venture.brand_notes ?? "");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!cancelled) setDraft(venture.brand_notes ?? "");
    })();
    return () => { cancelled = true; };
  }, [venture.brand_notes]);

  return (
    <div className="flex flex-col gap-3">
      <Mono className="text-[10px] text-ink-3">
        Free-form scratchpad. Auto-saves on blur.
      </Mono>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== (venture.brand_notes ?? "")) {
            onPatch({ brand_notes: draft });
          }
        }}
        rows={12}
        className="w-full bg-ink-0 border border-ink-2 rounded-md text-sm text-text-0 px-4 py-3 outline-none focus:border-accent resize-y"
        placeholder="Notes, ideas, brain dump…"
      />
    </div>
  );
}

function AdModal({
  ventureId,
  existing,
  onClose,
  onSaved,
}: {
  ventureId: string;
  existing: Ad | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    platform: existing?.platform ?? "meta",
    campaign_name: existing?.campaign_name ?? "",
    headline: existing?.headline ?? "",
    body_copy: existing?.body_copy ?? "",
    media_url: existing?.media_url ?? "",
    media_type: existing?.media_type ?? "image",
    start_date: existing?.start_date ?? "",
    end_date: existing?.end_date ?? "",
    budget_spent: existing?.budget_spent ?? "",
    impressions: existing?.impressions ?? "",
    clicks: existing?.clicks ?? "",
    conversions: existing?.conversions ?? "",
    roas: existing?.roas ?? "",
    notes: existing?.notes ?? "",
  });

  function set(k: string, v: string) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  async function save() {
    const payload: Record<string, unknown> = {
      platform: form.platform,
      campaign_name: form.campaign_name || null,
      headline: form.headline || null,
      body_copy: form.body_copy || null,
      media_url: form.media_url || null,
      media_type: form.media_type || null,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      budget_spent: form.budget_spent ? Number(form.budget_spent) : null,
      impressions: form.impressions ? Number(form.impressions) : null,
      clicks: form.clicks ? Number(form.clicks) : null,
      conversions: form.conversions ? Number(form.conversions) : null,
      roas: form.roas ? Number(form.roas) : null,
      notes: form.notes || null,
    };

    if (existing) {
      await fetch(`/api/ventures/${ventureId}/ads/${existing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } else {
      await fetch(`/api/ventures/${ventureId}/ads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }
    onSaved();
  }

  const inputCls =
    "w-full bg-ink-0 border border-ink-2 rounded-md text-sm text-text-0 px-3 py-2 outline-none focus:border-accent";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-0/60 backdrop-blur-sm overflow-y-auto py-8">
      <div className="bg-ink-1 border border-ink-2 rounded-lg p-6 w-full max-w-lg">
        <div className="text-base text-text-0 font-[family-name:var(--font-display)] mb-4">
          {existing ? "Edit Ad" : "Add Ad"}
        </div>
        <div className="flex flex-col gap-3">
          <div>
            <Mono className="text-[10px] text-ink-3 mb-1">PLATFORM</Mono>
            <select
              value={form.platform}
              onChange={(e) => set("platform", e.target.value)}
              className={inputCls}
            >
              {PLATFORM_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Mono className="text-[10px] text-ink-3 mb-1">CAMPAIGN NAME</Mono>
            <input
              className={inputCls}
              value={form.campaign_name}
              onChange={(e) => set("campaign_name", e.target.value)}
            />
          </div>
          <div>
            <Mono className="text-[10px] text-ink-3 mb-1">HEADLINE</Mono>
            <input
              className={inputCls}
              value={form.headline}
              onChange={(e) => set("headline", e.target.value)}
            />
          </div>
          <div>
            <Mono className="text-[10px] text-ink-3 mb-1">BODY COPY</Mono>
            <textarea
              className={inputCls}
              rows={3}
              value={form.body_copy}
              onChange={(e) => set("body_copy", e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Mono className="text-[10px] text-ink-3 mb-1">MEDIA URL</Mono>
              <input
                className={inputCls}
                value={form.media_url}
                onChange={(e) => set("media_url", e.target.value)}
              />
            </div>
            <div>
              <Mono className="text-[10px] text-ink-3 mb-1">MEDIA TYPE</Mono>
              <select
                value={form.media_type}
                onChange={(e) => set("media_type", e.target.value)}
                className={inputCls}
              >
                <option value="image">Image</option>
                <option value="video">Video</option>
                <option value="carousel">Carousel</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Mono className="text-[10px] text-ink-3 mb-1">START DATE</Mono>
              <input
                type="date"
                className={inputCls}
                value={form.start_date}
                onChange={(e) => set("start_date", e.target.value)}
              />
            </div>
            <div>
              <Mono className="text-[10px] text-ink-3 mb-1">END DATE</Mono>
              <input
                type="date"
                className={inputCls}
                value={form.end_date}
                onChange={(e) => set("end_date", e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <Mono className="text-[10px] text-ink-3 mb-1">BUDGET (£)</Mono>
              <input
                type="number"
                className={inputCls}
                value={form.budget_spent}
                onChange={(e) => set("budget_spent", e.target.value)}
              />
            </div>
            <div>
              <Mono className="text-[10px] text-ink-3 mb-1">IMPRESSIONS</Mono>
              <input
                type="number"
                className={inputCls}
                value={form.impressions}
                onChange={(e) => set("impressions", e.target.value)}
              />
            </div>
            <div>
              <Mono className="text-[10px] text-ink-3 mb-1">CLICKS</Mono>
              <input
                type="number"
                className={inputCls}
                value={form.clicks}
                onChange={(e) => set("clicks", e.target.value)}
              />
            </div>
            <div>
              <Mono className="text-[10px] text-ink-3 mb-1">ROAS</Mono>
              <input
                type="number"
                step="0.1"
                className={inputCls}
                value={form.roas}
                onChange={(e) => set("roas", e.target.value)}
              />
            </div>
          </div>
          <div>
            <Mono className="text-[10px] text-ink-3 mb-1">NOTES</Mono>
            <textarea
              className={inputCls}
              rows={2}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-ink-3 hover:text-text-0"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            className="px-4 py-1.5 rounded-md bg-accent/15 border border-accent/40 text-accent text-xs font-[family-name:var(--font-mono)] tracking-[0.12em]"
          >
            {existing ? "UPDATE" : "ADD"}
          </button>
        </div>
      </div>
    </div>
  );
}
