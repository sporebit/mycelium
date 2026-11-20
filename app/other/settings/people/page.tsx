"use client";

import { Suspense } from "react";
import { PeopleAndTeams } from "@/components/settings/PeopleAndTeams";

/** Settings → People & teams: People (bin, ignored words), Sharing, and Teams (its own route). */
export default function PeopleAndTeamsPage() {
  return (
    <Suspense fallback={null}>
      <PeopleAndTeams />
    </Suspense>
  );
}
