import type { Metadata } from "next";
import Link from "next/link";
import { Shell } from "@/components/dashboard/Shell";
import { Thread } from "@/components/guide/Thread";
import { listGuides, type GuideListItem } from "@/lib/guides/list";
import { createUserClient } from "@/lib/supabase/user";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Guides" };

/** Research rule 4: no view shows more than seven rows without "Show more". */
const FIRST = 7;

function Row({ g }: { g: GuideListItem }) {
  const line = g.parked ? `Parked at ${g.parked}.` : g.resume ?? (g.done === 0 ? `Not started. First: ${g.next ?? "step 1"}.` : g.done === g.total ? "Finished." : null);
  return (
    <li className="fg-card rounded-xl p-3 sm:p-4" data-testid="guide-row" data-key={g.key}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <div className="fg-ui fg-soft text-[12px]">
            <span className="fg-mono">{g.key}</span>
            {g.project_name ? ` · ${g.project_name}` : ""} · {g.kind}
          </div>
          <h2 className="fg-ink mt-0.5 text-[18px] leading-snug">{g.title}</h2>
        </div>
        <div className="fg-ui fg-soft text-right text-[13px]">
          <span className="fg-mono fg-ink text-[20px]">{g.pct}</span>
          <span className="fg-mono">%</span>
          <div>
            <span className="fg-mono">{g.done}</span> of <span className="fg-mono">{g.total}</span> steps
          </div>
        </div>
      </div>
      <Thread phases={g.phases} pct={g.pct} level="reduced" mini className="mt-2" />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        {line && <p className="fg-ui fg-soft min-w-0 text-[14px]">{line}</p>}
        <Link href={`/guides/${encodeURIComponent(g.key)}`} className="fg-btn fg-ui ml-auto inline-flex min-h-[40px] items-center rounded-lg px-3 text-[14px]">
          Open guide
        </Link>
      </div>
    </li>
  );
}

/**
 * /guides (design §3.1): every run-book kind ticket the caller can see that
 * has a definition, newest activity first, each with its thread in
 * miniature, the percentage, the resume line and Open guide.
 */
export default async function GuidesPage() {
  const supabase = await createUserClient();
  const guides = await listGuides(supabase);
  const first = guides.slice(0, FIRST);
  const rest = guides.slice(FIRST);
  return (
    <Shell>
      <div className="fg-root -mx-4 -my-4 min-h-[calc(100vh-2rem)] px-4 py-6 sm:-mx-6 sm:-my-6 sm:px-6">
        <div className="mx-auto flex max-w-[880px] flex-col gap-4">
          <header>
            <h1 className="fg-ink text-[26px] sm:text-[30px]">Guides</h1>
            <p className="fg-ui fg-soft text-[14px]">Run-books, tests, guides, setups and audits with steps, the most recently touched first.</p>
          </header>
          {guides.length === 0 ? (
            <p className="fg-soft">No guides yet. A run-book, test, guide, setup or audit ticket with steps shows here.</p>
          ) : (
            <>
              <ul className="flex flex-col gap-3">
                {first.map((g) => (
                  <Row key={g.key} g={g} />
                ))}
              </ul>
              {rest.length > 0 && (
                <details className="fg-fold">
                  <summary className="fg-ui fg-soft cursor-pointer text-[14px]">Show {rest.length} more</summary>
                  <ul className="mt-3 flex flex-col gap-3">
                    {rest.map((g) => (
                      <Row key={g.key} g={g} />
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}
        </div>
      </div>
    </Shell>
  );
}
