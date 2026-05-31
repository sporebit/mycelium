import Link from "next/link";

export type OverviewCard = {
  label: string;
  href: string;
  description: string;
};

/**
 * Shared landing-page pattern for every top-level section. Renders the
 * title, a short italic tagline, and a grid of click-through cards.
 * Mirrors the Health overview tile pattern (which itself was the
 * template for the rest of the sections).
 */
export function SectionOverview({
  title,
  tagline,
  cards,
}: {
  title: string;
  tagline: string;
  cards: OverviewCard[];
}) {
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="font-[family-name:var(--font-display)] italic text-2xl text-text-0">
          {title}
        </h1>
        <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
          {tagline}
        </p>
      </header>

      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {cards.map((c) => (
          <li key={c.href}>
            <Link
              href={c.href}
              className="block rounded-md bg-ink-1 border border-ink-2 hover:border-ink-3 px-4 py-3 transition-colors"
            >
              <div className="text-base text-ink-4">{c.label}</div>
              <div className="text-xs text-ink-3 italic font-[family-name:var(--font-display)] mt-1">
                {c.description}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
