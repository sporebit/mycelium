import { Shell } from "@/components/dashboard/Shell";
import { Home } from "@/components/phirstmaxx/Home";

export const dynamic = "force-dynamic";

/** /phirstmaxx — Home (claude/phirstmaxx-spec.md §8): the next window, what is on, proposals waiting, newest drops, the drop box. */
export default function PhirstMaxxHomePage() {
  return (
    <Shell>
      <div className="mx-auto max-w-3xl">
        <Home />
      </div>
    </Shell>
  );
}
