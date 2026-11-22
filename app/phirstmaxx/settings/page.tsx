import { Shell } from "@/components/dashboard/Shell";
import { Settings } from "@/components/phirstmaxx/Settings";

export const dynamic = "force-dynamic";

/** /phirstmaxx/settings — places, block types, waking hours, buffers, pets, the inbox link, research status (claude/phirstmaxx-spec.md §8). */
export default function PhirstMaxxSettingsPage() {
  return (
    <Shell>
      <div className="mx-auto max-w-4xl">
        <Settings />
      </div>
    </Shell>
  );
}
