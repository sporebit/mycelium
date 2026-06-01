import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { normaliseAlias } from "@/lib/people/normalise";

export const runtime = "nodejs";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

type ResolveBody = {
  action?: "create_new" | "link_existing" | "reject";
  /** When action='link_existing', the id of the existing entity. */
  link_to_id?: string;
};

/**
 * Resolve a pending-entity decision.
 *
 *   create_new   → create the entity (currently person-only; food /
 *                  project / workout are stubbed for follow-up
 *                  features), link any orphan mention rows to it.
 *   link_existing → write an alias on the existing entity so future
 *                  voice captures of the same name auto-route, then
 *                  re-bind orphan mentions.
 *   reject       → no entity created; mention rows stay unlinked.
 *                  We still mark the pending row resolved so it
 *                  drops off the review queue.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  const { id } = await ctx.params;
  let body: ResolveBody;
  try {
    body = (await req.json()) as ResolveBody;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const action = body.action;
  if (!action || !["create_new", "link_existing", "reject"].includes(action)) {
    return NextResponse.json({ error: "invalid action" }, { status: 400 });
  }
  try {
    const supabase = createServerClient();
    const { data: pending } = await supabase
      .from("pending_entities")
      .select("id, user_id, capture_id, entity_type, entity_name, resolved_at")
      .eq("id", id)
      .eq("user_id", uid)
      .maybeSingle();
    if (!pending) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    const row = pending as {
      id: string;
      user_id: string;
      capture_id: string | null;
      entity_type: string;
      entity_name: string;
      resolved_at: string | null;
    };
    if (row.resolved_at) {
      return NextResponse.json({ error: "already resolved" }, { status: 400 });
    }

    let resolvedId: string | null = null;

    if (action === "create_new") {
      if (row.entity_type === "person") {
        const { data: created } = await supabase
          .from("people")
          .insert({
            user_id: uid,
            first_name: row.entity_name,
            needs_review: false,
          })
          .select("id")
          .single();
        if (created?.id) {
          resolvedId = created.id as string;
          await supabase.from("people_aliases").insert({
            person_id: resolvedId,
            alias: normaliseAlias(row.entity_name) ?? row.entity_name,
            is_primary: true,
          });
        }
      }
      // Other entity types: future work — leaving resolvedId null
      // marks the row as resolved without creating.
    } else if (action === "link_existing") {
      if (!body.link_to_id) {
        return NextResponse.json(
          { error: "link_to_id required" },
          { status: 400 },
        );
      }
      resolvedId = body.link_to_id;
      if (row.entity_type === "person") {
        // Add the captured spelling as a non-primary alias so future
        // mentions of the same wording resolve to the existing person.
        const aliasText = normaliseAlias(row.entity_name);
        if (aliasText) {
          await supabase
            .from("people_aliases")
            .upsert(
              {
                person_id: body.link_to_id,
                alias: aliasText,
                is_primary: false,
              },
              { onConflict: "person_id,alias" },
            );
        }
      }
    }

    // Re-bind orphaned mention rows from the same capture to the
    // resolved person (when a person was created or linked).
    if (resolvedId && row.entity_type === "person" && row.capture_id) {
      await supabase
        .from("people_mentions")
        .update({
          person_id: resolvedId,
          needs_review: false,
        })
        .eq("user_id", uid)
        .eq("source_id", row.capture_id)
        .ilike("raw_alias", row.entity_name);
    }

    await supabase
      .from("pending_entities")
      .update({
        resolved_at: new Date().toISOString(),
        resolved_action: action,
        resolved_entity_id: resolvedId,
      })
      .eq("id", id);

    return NextResponse.json({
      ok: true,
      resolved_entity_id: resolvedId,
      action,
    });
  } catch (err) {
    console.error("[/api/pending-entities/:id/resolve POST]", err);
    return NextResponse.json({ error: "resolve failed" }, { status: 500 });
  }
}
