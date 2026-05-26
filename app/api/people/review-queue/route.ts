import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import type {
  Person,
  PersonMention,
  ReviewQueueItem,
} from "@/lib/people/types";

export const runtime = "nodejs";

const PERSON_FIELDS =
  "id, user_id, first_name, last_name, display_name, relationship, phone, email, birthday, address, where_we_met, mutual_interests, notes, needs_review, created_at, updated_at";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

export async function GET() {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });

  try {
    const supabase = createServerClient();

    // 1. Ambiguous / low-confidence mentions waiting for the user to pick a person.
    const { data: mentionRows } = await supabase
      .from("people_mentions")
      .select(
        "id, user_id, person_id, source_type, source_id, raw_alias, confidence, candidate_person_ids, needs_review, resolved_at, created_at"
      )
      .eq("user_id", uid)
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
    const captureIds = mentions
      .filter((m) => m.source_type === "capture")
      .map((m) => m.source_id);
    const taskIds = mentions
      .filter((m) => m.source_type === "task")
      .map((m) => m.source_id);
    const journalIds = mentions
      .filter((m) => m.source_type === "journal")
      .map((m) => m.source_id);
    const snippetByKey = new Map<string, string | null>();
    if (captureIds.length > 0) {
      const { data } = await supabase
        .from("raw_captures")
        .select("id, raw_text")
        .in("id", captureIds);
      for (const r of (data ?? []) as Array<{ id: string; raw_text: string | null }>) {
        snippetByKey.set(`capture:${r.id}`, r.raw_text);
      }
    }
    if (taskIds.length > 0) {
      const { data } = await supabase
        .from("tasks")
        .select("id, title")
        .in("id", taskIds);
      for (const r of (data ?? []) as Array<{ id: string; title: string }>) {
        snippetByKey.set(`task:${r.id}`, r.title);
      }
    }
    if (journalIds.length > 0) {
      const { data } = await supabase
        .from("journal_entries")
        .select("id, raw_text")
        .in("id", journalIds);
      for (const r of (data ?? []) as Array<{ id: string; raw_text: string | null }>) {
        snippetByKey.set(`journal:${r.id}`, r.raw_text);
      }
    }

    const ambiguousItems: ReviewQueueItem[] = mentions.map((m) => ({
      kind: "ambiguous_mention",
      mention: m,
      candidates: (m.candidate_person_ids ?? [])
        .map((id) => candidatesById.get(id))
        .filter((p): p is Person => !!p),
      snippet: snippetByKey.get(`${m.source_type}:${m.source_id}`) ?? null,
      created_at: m.created_at,
    }));

    // 2. Auto-created people who still need review.
    const { data: peopleRows } = await supabase
      .from("people")
      .select(PERSON_FIELDS)
      .eq("user_id", uid)
      .eq("needs_review", true)
      .order("created_at", { ascending: false });
    const people = (peopleRows ?? []) as Person[];
    // Mention counts per person — for the "Auto-created from capture on …" subtitle.
    const countByPerson = new Map<string, number>();
    const firstSeenByPerson = new Map<string, string>();
    if (people.length > 0) {
      const { data: cnt } = await supabase
        .from("people_mentions")
        .select("person_id, created_at")
        .in("person_id", people.map((p) => p.id));
      for (const r of (cnt ?? []) as Array<{ person_id: string; created_at: string }>) {
        countByPerson.set(r.person_id, (countByPerson.get(r.person_id) ?? 0) + 1);
        const prev = firstSeenByPerson.get(r.person_id);
        if (!prev || r.created_at < prev) firstSeenByPerson.set(r.person_id, r.created_at);
      }
    }
    const personItems: ReviewQueueItem[] = people.map((p) => ({
      kind: "auto_created_person",
      person: p,
      mention_count: countByPerson.get(p.id) ?? 0,
      first_seen_at: firstSeenByPerson.get(p.id) ?? p.created_at,
    }));

    const items = [...ambiguousItems, ...personItems];
    return NextResponse.json({ items });
  } catch (err) {
    console.error("[/api/people/review-queue GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
