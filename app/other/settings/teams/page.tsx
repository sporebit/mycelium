"use client";

import { Suspense } from "react";
import { PeopleAndTeams } from "@/components/settings/PeopleAndTeams";

/** Settings → Teams: the Teams sub-section of People & teams on its own route (MYC-190). */
export default function TeamsPage() {
  return (
    <Suspense fallback={null}>
      <PeopleAndTeams tab="teams" />
    </Suspense>
  );
}
