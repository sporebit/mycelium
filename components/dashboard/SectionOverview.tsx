import { DraggableCardGrid } from "./DraggableCardGrid";

export type OverviewCard = {
  key: string;
  label: string;
  href: string;
  description: string;
};

export function SectionOverview({
  title,
  tagline,
  section,
  cards,
}: {
  title: string;
  tagline: string;
  section: string;
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

      <DraggableCardGrid section={section} cards={cards} />
    </div>
  );
}
