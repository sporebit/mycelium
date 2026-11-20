"use client";

/**
 * "Gone quiet" (master run §6; Phil's version: direct, not softened). The
 * parts of the app nothing has been added to or changed in for longer than
 * their own rhythm, with how long. Nothing is shown when everything is in
 * use. A feature never used is not listed: there was nothing to stop.
 */
import Link from "next/link";
import { useApi } from "@/lib/data/useApi";
import type { FeatureState } from "@/lib/dormant/features";

export const DORMANT_KEY = "/api/dormant";
export type DormantView = { ok: boolean; quiet: FeatureState[]; hrefs: string[]; question: string | null };

export function useGoneQuiet() {
  return useApi<DormantView>(DORMANT_KEY, { revalidateOnFocus: false, dedupingInterval: 5 * 60_000 });
}

export function GoneQuiet() {
  const { data } = useGoneQuiet();
  const quiet = data?.quiet ?? [];
  if (!quiet.length) return null;
  return (
    <section aria-label="Gone quiet" className="mb-4 rounded-v2-md border border-hairline bg-surface-1 p-4" data-testid="gone-quiet">
      <h2 className="text-[11px] uppercase tracking-[0.18em] text-text-lo">Gone quiet</h2>
      <ul className="mt-2 flex flex-col">
        {quiet.map((f) => (
          <li key={f.key}>
            <Link href={f.href} className="flex min-h-[36px] items-center justify-between gap-4 rounded-v2-sm px-1 text-sm hover:bg-surface-2">
              <span className="text-text-hi">{f.label}</span>
              <span className="text-text-lo">untouched for {f.how_long}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
