import Link from "next/link";

const SECTIONS: { label: string; href: string; description: string }[] = [
  {
    label: "Nutrition",
    href: "/health/nutrition",
    description: "Daily macros, meal groups, barcode scan, foods library.",
  },
  {
    label: "Body metrics",
    href: "/fitness/body",
    description: "Weight, measurements, body composition over time.",
  },
  {
    label: "Pain tracking",
    href: "/health/pain",
    description: "Standalone pain logs + recent session pain notes.",
  },
];

export default function HealthOverviewPage() {
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="font-[family-name:var(--font-display)] italic text-2xl text-text-0">
          Health
        </h1>
        <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
          Bodies tracked across nutrition, metrics, and pain.
        </p>
      </header>

      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {SECTIONS.map((s) => (
          <li key={s.href}>
            <Link
              href={s.href}
              className="block rounded-md bg-ink-1 border border-ink-2 hover:border-ink-3 px-4 py-3 transition-colors"
            >
              <div className="text-base text-ink-4">{s.label}</div>
              <div className="text-xs text-ink-3 italic font-[family-name:var(--font-display)] mt-1">
                {s.description}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
