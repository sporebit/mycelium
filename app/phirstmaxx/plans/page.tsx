import { Shell } from "@/components/dashboard/Shell";
import { Plans } from "@/components/phirstmaxx/Plans";

export const dynamic = "force-dynamic";

/** /phirstmaxx/plans — proposals, holds and what is agreed (claude/phirstmaxx-spec.md §7). */
export default function PhirstMaxxPlansPage() {
  return (
    <Shell>
      <div className="mx-auto max-w-3xl">
        <Plans />
      </div>
    </Shell>
  );
}
