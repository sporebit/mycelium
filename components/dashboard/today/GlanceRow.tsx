"use client";

import Link from "next/link";
import { Surface, Skeleton, Label, Num } from "@/components/ui";
import { useApi } from "@/lib/data/useApi";
import { localDateKey } from "@/lib/util/date";

type DailyLogResponse = {
  notes?: { habits?: { done?: string[] } } & Record<string, unknown>;
};

type PendingCount = { count?: number };

type SuppData = { progress: { taken: number; total: number } };

export function GlanceRow() {
  const today = localDateKey();
  const { data: daily, isLoading: dailyLoading } =
    useApi<DailyLogResponse>("/api/daily-log/today");
  const { data: pending } =
    useApi<PendingCount>("/api/captures/review/pending-count");
  const { data: supp } =
    useApi<SuppData>(`/api/supplements/daily?date=${today}`);

  const doneCount = daily?.notes?.habits?.done?.length ?? 0;
  const suppTaken = supp?.progress?.taken ?? 0;
  const suppTotal = supp?.progress?.total ?? 0;
  const captureCount = pending?.count ?? 0;

  return (
    <div>
      <div className="flex items-baseline mb-2 px-1">
        <Label>Glance</Label>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile
          href="/organisation/habits"
          caption="Habits done"
          loading={dailyLoading}
        >
          <Num value={doneCount} />
        </Tile>
        <Tile
          href="/health/supplements"
          caption="Supplements taken"
          loading={!supp}
        >
          <span className="font-[family-name:var(--font-jetbrains-mono)] tabular-nums text-text-hi">
            {suppTaken}/{suppTotal}
          </span>
        </Tile>
        <Tile
          href="/organisation/captures/review"
          caption="Captures to review"
          loading={!pending}
        >
          <Num value={captureCount} />
        </Tile>
        <Tile href="/health/nutrition" caption="Nutrition" loading={false}>
          <span className="text-sm text-text-lo">Open →</span>
        </Tile>
      </div>
    </div>
  );
}

function Tile({
  href,
  caption,
  loading,
  children,
}: {
  href: string;
  caption: string;
  loading: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className="block">
      <Surface level={1} interactive className="p-4 h-full">
        <div className="text-2xl leading-none">
          {loading ? <Skeleton className="h-6 w-12" /> : children}
        </div>
        <div className="mt-2 text-[11px] uppercase tracking-[0.08em] text-text-lo font-[family-name:var(--font-jetbrains-mono)]">
          {caption}
        </div>
      </Surface>
    </Link>
  );
}
