"use client";

import Link from "next/link";
import { Mono } from "@/components/dashboard/Mono";
import { EditableField } from "./EditableField";
import {
  STATUS_COLOURS,
  STATUS_OPTIONS,
  type Venture,
} from "@/lib/ventures/types";

export function OverviewTab({
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
