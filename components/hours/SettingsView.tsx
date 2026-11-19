"use client";

import { ImportCard } from "./ImportCard";

/** Settings (spec §5). Part 1 carries Import; targets, absences, bank holidays and the block-out text arrive with part 3. */
export function SettingsView() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-text-hi">Settings</h1>
      <ImportCard />
    </div>
  );
}
