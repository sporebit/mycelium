import { DraggableCardGrid } from "@/components/dashboard/DraggableCardGrid";
import { PCOverviewCard } from "@/components/studio/PCOverviewCard";

const CARDS = [
  {
    key: "spotify",
    label: "Spotify",
    href: "/studio/spotify",
    description: "Listening stats, top tracks, play history.",
  },
];

export default function StudioPage() {
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="font-[family-name:var(--font-display)] italic text-2xl text-text-0">
          Studio
        </h1>
        <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
          Music, media, hardware, and creative tools.
        </p>
      </header>

      <DraggableCardGrid
        section="studio"
        cards={CARDS}
        suffix={<PCOverviewCard />}
      />
    </div>
  );
}
