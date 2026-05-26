import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { normaliseAlias } from "@/lib/people/normalise";
import type { Person, PersonAlias, PersonWithAliases } from "@/lib/people/types";

export const runtime = "nodejs";

const PERSON_FIELDS =
  "id, user_id, first_name, last_name, display_name, relationship, phone, email, birthday, address, where_we_met, mutual_interests, notes, needs_review, created_at, updated_at";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

/** GET — list people, optionally filtered to the review queue. */
export async function GET(req: NextRequest) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  const needsReview = req.nextUrl.searchParams.get("needs_review") === "true";

  try {
    const supabase = createServerClient();
    let q = supabase
      .from("people")
      .select(PERSON_FIELDS)
      .eq("user_id", uid)
      .order("updated_at", { ascending: false });
    if (needsReview) q = q.eq("needs_review", true);
    const { data: peopleRows, error } = await q;
    if (error) {
      console.error("[/api/people GET]", error);
      return NextResponse.json({ error: "fetch failed" }, { status: 500 });
    }
    const people = (peopleRows ?? []) as Person[];

    // Attach aliases + mention counts in a couple of batched queries
    const ids = people.map((p) => p.id);
    const aliasByPerson = new Map<string, PersonAlias[]>();
    const mentionCountByPerson = new Map<string, number>();
    const lastMentionByPerson = new Map<string, string>();
    if (ids.length > 0) {
      const [aliasRes, mentionRes] = await Promise.all([
        supabase
          .from("people_aliases")
          .select("id, person_id, alias, is_primary, created_at")
          .in("person_id", ids),
        supabase
          .from("people_mentions")
          .select("person_id, created_at")
          .in("person_id", ids),
      ]);
      for (const a of (aliasRes.data ?? []) as PersonAlias[]) {
        const list = aliasByPerson.get(a.person_id) ?? [];
        list.push(a);
        aliasByPerson.set(a.person_id, list);
      }
      type MentionAgg = { person_id: string; created_at: string };
      for (const m of (mentionRes.data ?? []) as MentionAgg[]) {
        mentionCountByPerson.set(
          m.person_id,
          (mentionCountByPerson.get(m.person_id) ?? 0) + 1
        );
        const prev = lastMentionByPerson.get(m.person_id);
        if (!prev || m.created_at > prev) lastMentionByPerson.set(m.person_id, m.created_at);
      }
      // Sort aliases — primary first, then by created_at
      for (const list of aliasByPerson.values()) {
        list.sort((a, b) => {
          if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
          return a.created_at.localeCompare(b.created_at);
        });
      }
    }

    const withAliases: PersonWithAliases[] = people.map((p) => ({
      ...p,
      aliases: aliasByPerson.get(p.id) ?? [],
      mention_count: mentionCountByPerson.get(p.id) ?? 0,
      last_mention_at: lastMentionByPerson.get(p.id) ?? null,
    }));

    // Review-count for the UI badge
    const reviewCount = withAliases.filter((p) => p.needs_review).length;

    return NextResponse.json({ people: withAliases, review_count: reviewCount });
  } catch (err) {
    console.error("[/api/people GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

type CreateBody = {
  first_name?: string;
  last_name?: string | null;
  display_name?: string | null;
  relationship?: string | null;
  phone?: string | null;
  email?: string | null;
  birthday?: string | null;
  address?: string | null;
  where_we_met?: string | null;
  mutual_interests?: string | null;
  notes?: string | null;
  aliases?: string[];
};

/** POST — create a person + at least one primary alias. */
export async function POST(req: NextRequest) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });

  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const firstName = body.first_name?.trim();
  if (!firstName) {
    return NextResponse.json({ error: "first_name required" }, { status: 400 });
  }
  const displayName = body.display_name?.trim() || null;
  const lastName = body.last_name?.trim() || null;

  try {
    const supabase = createServerClient();

    // Refuse duplicates with the exact same first+last name
    const { data: dup } = await supabase
      .from("people")
      .select("id, display_name")
      .eq("user_id", uid)
      .ilike("first_name", firstName)
      .is("last_name", lastName)
      .maybeSingle();
    if (dup?.id && !displayName) {
      return NextResponse.json(
        {
          error:
            "A person with this name exists. Use a different display_name to distinguish.",
        },
        { status: 409 }
      );
    }

    const { data: created, error } = await supabase
      .from("people")
      .insert({
        user_id: uid,
        first_name: firstName,
        last_name: lastName,
        display_name: displayName,
        relationship: body.relationship ?? null,
        phone: body.phone ?? null,
        email: body.email ?? null,
        birthday: body.birthday ?? null,
        address: body.address ?? null,
        where_we_met: body.where_we_met ?? null,
        mutual_interests: body.mutual_interests ?? null,
        notes: body.notes ?? null,
        needs_review: false,
      })
      .select(PERSON_FIELDS)
      .single();
    if (error || !created) {
      console.error("[/api/people POST]", error);
      return NextResponse.json({ error: "create failed" }, { status: 500 });
    }

    // Primary alias — display_name if present, else first_name
    const primary = normaliseAlias(displayName || firstName);
    const extras = (body.aliases ?? [])
      .map((a) => normaliseAlias(a))
      .filter((a) => a && a !== primary);
    const aliasRows: { person_id: string; alias: string; is_primary: boolean }[] = [
      { person_id: created.id, alias: primary, is_primary: true },
      ...Array.from(new Set(extras)).map((alias) => ({
        person_id: created.id,
        alias,
        is_primary: false,
      })),
    ];
    await supabase.from("people_aliases").insert(aliasRows);

    return NextResponse.json({ person: created as Person });
  } catch (err) {
    console.error("[/api/people POST]", err);
    return NextResponse.json({ error: "create failed" }, { status: 500 });
  }
}
