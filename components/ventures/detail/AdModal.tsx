"use client";

import { useState } from "react";
import { Mono } from "@/components/dashboard/Mono";
import { PLATFORM_OPTIONS, type Ad } from "@/lib/ventures/types";

export function AdModal({
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
