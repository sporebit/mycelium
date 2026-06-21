"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Mono } from "@/components/dashboard/Mono";
import Link from "next/link";

type Guide = {
  id: string;
  retailer: string;
  retailer_url: string | null;
  region: string;
  difficulty: string | null;
  account_age_required: string | null;
  payment_tips: string | null;
  size_selection_tips: string | null;
  checkout_tips: string | null;
  raffle_tips: string | null;
  vpn_recommended: boolean;
  bot_compatible: boolean;
  success_rate: string | null;
  last_updated: string | null;
  notes: string | null;
};

const DIFF_LABELS: Record<string, string> = {
  easy: "EASY",
  medium: "MEDIUM",
  hard: "HARD",
  bot_only: "BOT ONLY",
};

export default function CookGuideDetailPage() {
  const params = useParams();
  const slug = params.slug as string;
  const [guide, setGuide] = useState<Guide | null>(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  const fetchGuide = useCallback(async () => {
    try {
      const r = await fetch(`/api/drops/cook-guides/${slug}`);
      if (r.ok) {
        const j = await r.json();
        setGuide(j.guide);
      }
    } catch {
      /* noop */
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await fetchGuide();
      if (cancelled) return;
    })();
    return () => { cancelled = true; };
  }, [fetchGuide]);

  async function saveField(field: string, value: unknown) {
    if (!guide) return;
    await fetch(`/api/drops/cook-guides/${slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    await fetchGuide();
  }

  if (loading) {
    return (
      <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
        Loading guide…
      </div>
    );
  }

  if (!guide) {
    return (
      <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
        Guide not found.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link
          href="/drops/cook-guides"
          className="text-[10px] font-[family-name:var(--font-mono)] tracking-[0.12em] text-ink-3 hover:text-text-0"
        >
          ← GUIDES
        </Link>
        {saved && (
          <Mono className="text-[9px] text-accent tracking-[0.12em]">
            SAVED
          </Mono>
        )}
      </div>

      <header>
        <h1 className="font-[family-name:var(--font-display)] italic text-2xl text-text-0">
          {guide.retailer}
        </h1>
        {guide.retailer_url && (
          <a
            href={guide.retailer_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-accent hover:text-accent/80"
          >
            {guide.retailer_url}
          </a>
        )}
      </header>

      <div className="flex gap-2 flex-wrap">
        <select
          value={guide.difficulty ?? ""}
          onChange={(e) => saveField("difficulty", e.target.value || null)}
          className="bg-ink-1 border border-ink-2 rounded-md text-[10px] font-[family-name:var(--font-mono)] text-text-0 px-2 py-1 outline-none focus:border-accent"
        >
          <option value="">No difficulty set</option>
          {Object.entries(DIFF_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select
          value={guide.region}
          onChange={(e) => saveField("region", e.target.value)}
          className="bg-ink-1 border border-ink-2 rounded-md text-[10px] font-[family-name:var(--font-mono)] text-text-0 px-2 py-1 outline-none focus:border-accent"
        >
          {["UK", "EU", "US", "Global"].map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-5">
        <TextSection
          label="Account age required"
          value={guide.account_age_required ?? ""}
          onSave={(v) => saveField("account_age_required", v || null)}
        />
        <TextSection
          label="Payment tips"
          value={guide.payment_tips ?? ""}
          onSave={(v) => saveField("payment_tips", v || null)}
          multiline
        />
        <TextSection
          label="Size selection tips"
          value={guide.size_selection_tips ?? ""}
          onSave={(v) => saveField("size_selection_tips", v || null)}
          multiline
        />
        <TextSection
          label="Checkout tips"
          value={guide.checkout_tips ?? ""}
          onSave={(v) => saveField("checkout_tips", v || null)}
          multiline
        />
        <TextSection
          label="Raffle entry tips"
          value={guide.raffle_tips ?? ""}
          onSave={(v) => saveField("raffle_tips", v || null)}
          multiline
        />

        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={guide.vpn_recommended}
              onChange={(e) =>
                saveField("vpn_recommended", e.target.checked)
              }
              className="accent-accent"
            />
            <span className="text-sm text-text-1">VPN recommended</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={guide.bot_compatible}
              onChange={(e) =>
                saveField("bot_compatible", e.target.checked)
              }
              className="accent-accent"
            />
            <span className="text-sm text-text-1">Bot compatible</span>
          </label>
        </div>

        <TextSection
          label="Success rate"
          value={guide.success_rate ?? ""}
          onSave={(v) => saveField("success_rate", v || null)}
          placeholder="e.g. ~30% manual, ~80% bot"
        />
        <TextSection
          label="Notes"
          value={guide.notes ?? ""}
          onSave={(v) => saveField("notes", v || null)}
          multiline
        />
      </div>
    </div>
  );
}

function TextSection({
  label,
  value,
  onSave,
  multiline,
  placeholder,
}: {
  label: string;
  value: string;
  onSave: (v: string) => void;
  multiline?: boolean;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!cancelled) setDraft(value);
    })();
    return () => { cancelled = true; };
  }, [value]);

  const Component = multiline ? "textarea" : "input";

  return (
    <div className="rounded-md bg-ink-1 p-4">
      <Mono className="text-[9px] text-ink-3 tracking-[0.12em] mb-2 block">
        {label.toUpperCase()}
      </Mono>
      <Component
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== value) onSave(draft);
        }}
        placeholder={placeholder}
        className={`w-full bg-ink-0 border border-ink-2 rounded-md text-sm text-text-0 px-3 py-2 outline-none focus:border-accent ${
          multiline ? "resize-none min-h-[80px]" : ""
        }`}
      />
    </div>
  );
}
