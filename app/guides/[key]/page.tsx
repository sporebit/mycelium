import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GuidePage } from "@/components/guide/GuidePage";
import { createUserClient } from "@/lib/supabase/user";
import { countSteps, normaliseState, type StepsDefinition } from "@/lib/tickets/steps";
import { resolveTicketRef } from "@/lib/tickets/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Field guide", robots: { index: false, follow: false } };

/**
 * /guides/[key]: the standalone Field guide (design §3.1, D4). Behind the
 * session gate like every page; the ticket is read through the caller's
 * own client, so a ticket they cannot see is a 404. No app shell: the
 * guide has its own header.
 */
export default async function GuideStandalonePage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const supabase = await createUserClient();
  const ref = await resolveTicketRef(supabase, decodeURIComponent(key));
  if (!ref) notFound();
  const { data } = await supabase
    .from("tickets")
    .select("ticket_key, title, kind, steps_definition, steps_state, projects(name)")
    .eq("id", ref.id)
    .maybeSingle();
  if (!data || !data.steps_definition) notFound();
  const def = data.steps_definition as StepsDefinition;
  const state = normaliseState(data.steps_state);
  const proj = Array.isArray(data.projects) ? data.projects[0] : data.projects;
  return (
    <GuidePage
      initial={{
        key: (data.ticket_key as string | null) ?? key,
        title: data.title as string,
        kind: data.kind as string,
        definition: def,
        state,
        counts: countSteps(def, state),
      }}
      projectName={(proj as { name?: string } | null)?.name ?? null}
    />
  );
}
