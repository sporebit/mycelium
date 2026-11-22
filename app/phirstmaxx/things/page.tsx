import { Shell } from "@/components/dashboard/Shell";
import { Things } from "@/components/phirstmaxx/Things";

export const dynamic = "force-dynamic";

/** /phirstmaxx/things — everything dropped in, researched (claude/phirstmaxx-spec.md §8). `?drop=` puts that drop first. */
export default async function PhirstMaxxThingsPage({ searchParams }: { searchParams: Promise<{ drop?: string }> }) {
  const { drop } = await searchParams;
  return (
    <Shell>
      <div className="mx-auto max-w-4xl">
        <Things highlightDrop={drop && /^[0-9a-f-]{36}$/i.test(drop) ? drop : null} />
      </div>
    </Shell>
  );
}
