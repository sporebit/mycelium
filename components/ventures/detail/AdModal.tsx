"use client";

import { useState } from "react";
import { Sheet, Button, Label } from "@/components/ui";
import { PLATFORM_OPTIONS, type Ad } from "@/lib/ventures/types";
import { mutateApi } from "@/lib/data/mutateApi";

type AdsPayload = { ads: Ad[] };

/**
 * Sheet-based ad editor (P3 Part 4 restyle). Right panel on desktop,
 * bottom sheet on mobile — Sheet primitive handles the auto-side detection.
 */
export function AdModal({
  ventureId,
  adsKey,
  existing,
  onClose,
  onSaved,
}: {
  ventureId: string;
  adsKey: string;
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

    const optimisticId = existing?.id ?? `optimistic-${Date.now()}`;

    await mutateApi<AdsPayload>(
      adsKey,
      (current) => {
        const list = current?.ads ?? [];
        if (existing) {
          return {
            ads: list.map((a) =>
              a.id === existing.id ? ({ ...a, ...payload } as Ad) : a,
            ),
          };
        }
        return {
          ads: [
            ...list,
            { id: optimisticId, venture_id: ventureId, ...(payload as object) } as Ad,
          ],
        };
      },
      async () => {
        if (existing) {
          const res = await fetch(
            `/api/ventures/${ventureId}/ads/${existing.id}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            },
          );
          if (!res.ok) throw new Error(`ad update failed (${res.status})`);
        } else {
          const res = await fetch(`/api/ventures/${ventureId}/ads`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (!res.ok) throw new Error(`ad create failed (${res.status})`);
        }
      },
    );
    onSaved();
  }

  const inputCls =
    "w-full bg-surface-0 border border-hairline rounded-v2-sm text-sm text-text-hi px-3 py-2 outline-none focus:border-glow";

  return (
    <Sheet open onClose={onClose} title={existing ? "Edit ad" : "Add ad"}>
      <div className="flex flex-col gap-3">
        <div>
          <Label>Platform</Label>
          <select
            value={form.platform}
            onChange={(e) => set("platform", e.target.value)}
            className={`${inputCls} mt-1`}
          >
            {PLATFORM_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Campaign name</Label>
          <input
            className={`${inputCls} mt-1`}
            value={form.campaign_name}
            onChange={(e) => set("campaign_name", e.target.value)}
          />
        </div>
        <div>
          <Label>Headline</Label>
          <input
            className={`${inputCls} mt-1`}
            value={form.headline}
            onChange={(e) => set("headline", e.target.value)}
          />
        </div>
        <div>
          <Label>Body copy</Label>
          <textarea
            className={`${inputCls} mt-1`}
            rows={3}
            value={form.body_copy}
            onChange={(e) => set("body_copy", e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Media URL</Label>
            <input
              className={`${inputCls} mt-1`}
              value={form.media_url}
              onChange={(e) => set("media_url", e.target.value)}
            />
          </div>
          <div>
            <Label>Media type</Label>
            <select
              value={form.media_type}
              onChange={(e) => set("media_type", e.target.value)}
              className={`${inputCls} mt-1`}
            >
              <option value="image">Image</option>
              <option value="video">Video</option>
              <option value="carousel">Carousel</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Start date</Label>
            <input
              type="date"
              className={`${inputCls} mt-1`}
              value={form.start_date}
              onChange={(e) => set("start_date", e.target.value)}
            />
          </div>
          <div>
            <Label>End date</Label>
            <input
              type="date"
              className={`${inputCls} mt-1`}
              value={form.end_date}
              onChange={(e) => set("end_date", e.target.value)}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <Label>Budget £</Label>
            <input
              type="number"
              className={`${inputCls} mt-1`}
              value={form.budget_spent}
              onChange={(e) => set("budget_spent", e.target.value)}
            />
          </div>
          <div>
            <Label>Impressions</Label>
            <input
              type="number"
              className={`${inputCls} mt-1`}
              value={form.impressions}
              onChange={(e) => set("impressions", e.target.value)}
            />
          </div>
          <div>
            <Label>Clicks</Label>
            <input
              type="number"
              className={`${inputCls} mt-1`}
              value={form.clicks}
              onChange={(e) => set("clicks", e.target.value)}
            />
          </div>
          <div>
            <Label>ROAS</Label>
            <input
              type="number"
              step="0.1"
              className={`${inputCls} mt-1`}
              value={form.roas}
              onChange={(e) => set("roas", e.target.value)}
            />
          </div>
        </div>
        <div>
          <Label>Notes</Label>
          <textarea
            className={`${inputCls} mt-1`}
            rows={2}
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" size="sm" onClick={save}>
          {existing ? "Update" : "Add"}
        </Button>
      </div>
    </Sheet>
  );
}
