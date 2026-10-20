import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { auditListRead } from "@/lib/system/readAudit";
import type {
  Person,
  PersonMention,
  ReviewQueueItem,
} from "@/lib/people/types";

export const runtime = "nodejs";

import { PERSON_SELECT as PERSON_FIELDS } from "@/lib/people/contacts";
import { mentionSnippets } from "@/lib/people/snippets";

export async function GET(req: NextRequest) {

  try {
    const supabase = await createUserClient();

    // 1. Ambiguous / low-confidence mentions waiting for the user to pick a person.
    const { data: mentionRows } = await supabase
      .from("people_mentions")
      .select(
        "id, person_id, source_type, source_id, raw_alias, confidence, candidate_person_ids, needs_review, resolved_at, created_at, space_id"
      )
      .eq("needs_review", true)
      .order("created_at", { ascending: false });
    const mentions = (mentionRows ?? []) as PersonMention[];

    const candidateIds = new Set<string>();
    for (const m of mentions) {
      for (const id of m.candidate_person_ids ?? []) candidateIds.add(id);
    }
    const candidatesById = new Map<string, Person>();
    if (candidateIds.size > 0) {
      const { data: candidates } = await supabase
        .from("people")
        .select(PERSON_FIELDS)
        .in("id", Array.from(candidateIds));
      for (const p of (candidates ?? []) as Person[]) candidatesById.set(p.id, p);
    }

    // Snippet pull
    const snippetByKey = await mentionSnippets(supabase, mentions);

    const ambiguousItems: ReviewQueueItem[] = mentions.map((m) => ({
      kind: "ambiguous_mention",
      mention: m,
      candidates: (m.candidate_person_ids ?? [])
        .map((id) => candidatesById.get(id))
        .filter((p): p is Person => !!p),
      snippet: snippetByKey.get(`${m.source_type}:${m.source_id}`) ?? null,
      created_at: m.created_at,
    }));

    // 2. Auto-created people who still need review (archived ones made their decision, R3).
    const { data: peopleRows } = await supabase
      .from("people")
      .select(PERSON_FIELDS)
      .is("deleted_at", null)
      .is("archived_at", null)
      .eq("needs_review", true)
      .order("created_at", { ascending: false });
    const people = (peopleRows ?? []) as Person[];
    auditListRead(req, [...(mentionRows ?? []), ...(peopleRows ?? [])], "organisation", "people");
    // Mention counts per person — for the "Auto-created from capture on …" subtitle —
    // and the first mention's source text, so the Keep / Archive / Reject call is quick (R6).
    const countByPerson = new Map<string, number>();
    const firstSeenByPerson = new Map<string, string>();
    const snippetByPerson = new Map<string, string | null>();
    if (people.length > 0) {
      const { data: cnt } = await supabase
        .from("people_mentions")
        .select("person_id, source_type, source_id, created_at")
        .in("person_id", people.map((p) => p.id));
      const firstMention = new Map<string, { source_type: string; source_id: string; created_at: string }>();
      for (const r of (cnt ?? []) as Array<{ person_id: string; source_type: string; source_id: string; created_at: string }>) {
        countByPerson.set(r.person_id, (countByPerson.get(r.person_id) ?? 0) + 1);
        const prev = firstSeenByPerson.get(r.person_id);
        if (!prev || r.created_at < prev) {
          firstSeenByPerson.set(r.person_id, r.created_at);
          firstMention.set(r.person_id, r);
        }
      }
      const snippets = await mentionSnippets(supabase, Array.from(firstMention.values()));
      for (const [pid, m] of firstMention) snippetByPerson.set(pid, snippets.get(`${m.source_type}:${m.source_id}`) ?? null);
    }
    const personItems: ReviewQueueItem[] = people.map((p) => ({
      kind: "auto_created_person",
      person: p,
      mention_count: countByPerson.get(p.id) ?? 0,
      first_seen_at: firstSeenByPerson.get(p.id) ?? p.created_at,
      snippet: snippetByPerson.get(p.id) ?? null,
    }));

    const items = [...ambiguousItems, ...personItems];
    return NextResponse.json({ items });
  } catch (err) {
    console.error("[/api/people/review-queue GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
