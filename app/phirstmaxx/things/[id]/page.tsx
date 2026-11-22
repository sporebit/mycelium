import { notFound } from "next/navigation";
import { Shell } from "@/components/dashboard/Shell";
import { ThingDetail } from "@/components/phirstmaxx/ThingDetail";

export const dynamic = "force-dynamic";

/** /phirstmaxx/things/[id] — the full research for one thing, with sources (claude/phirstmaxx-spec.md §8). */
export default async function PhirstMaxxThingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();
  return (
    <Shell>
      <div className="mx-auto max-w-3xl">
        <ThingDetail id={id} />
      </div>
    </Shell>
  );
}
