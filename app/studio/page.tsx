import Link from "next/link";
import { PCOverviewCard } from "@/components/studio/PCOverviewCard";

const STATIC_CARDS = [
  {
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {STATIC_CARDS.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="block rounded-md bg-ink-1 border border-ink-2 hover:border-ink-3 px-4 py-3 transition-colors"
          >
            <div className="text-base text-ink-4">{c.label}</div>
            <div className="text-xs text-ink-3 italic font-[family-name:var(--font-display)] mt-1">
              {c.description}
            </div>
          </Link>
        ))}
        <PCOverviewCard />
      </div>
    </div>
  );
}
