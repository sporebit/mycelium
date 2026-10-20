import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { rejectPerson, setPersonArchived } from "@/lib/people/contacts";

export const runtime = "nodejs";

type BulkAction = "keep" | "archive" | "unarchive" | "reject";
type Body = { ids?: unknown; action?: unknown };

const MAX_IDS = 500;

/**
 * POST /api/people/bulk { ids, action: keep | archive | unarchive | reject }
 * — the Select-mode actions on People → Review Needed and → Archived
 * (people-review R6).
 *   keep      → clear needs_review
 *   archive   → hidden, never matched (R3); unarchive restores both
 *   reject    → the bin + every alias on the ignore list (R2)
 * One failure does not stop the rest; the response says what happened.
 */
export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const action = body.action;
  if (action !== "keep" && action !== "archive" && action !== "unarchive" && action !== "reject") {
    return NextResponse.json({ error: "action must be keep, archive, unarchive or reject" }, { status: 400 });
  }
  const ids = Array.isArray(body.ids) ? Array.from(new Set(body.ids.filter((x): x is string => typeof x === "string" && x.length > 0))) : [];
  if (ids.length === 0) return NextResponse.json({ error: "ids required" }, { status: 400 });
  if (ids.length > MAX_IDS) return NextResponse.json({ error: `at most ${MAX_IDS} ids` }, { status: 400 });

  try {
    const supabase = await createUserClient();
    const done: string[] = [];
    const failed: string[] = [];
    let ignored = 0;
    if (action === "keep") {
      const { data, error } = await supabase
        .from("people")
        .update({ needs_review: false, updated_at: new Date().toISOString() })
        .in("id", ids)
        .is("deleted_at", null)
        .select("id");
      if (error) throw error;
      for (const r of (data ?? []) as Array<{ id: string }>) done.push(r.id);
      for (const id of ids) if (!done.includes(id)) failed.push(id);
    } else {
      for (const id of ids) {
        try {
          if (action === "archive" || action === "unarchive") {
            (await setPersonArchived(supabase, id, action === "archive")) ? done.push(id) : failed.push(id);
          } else {
            const r = await rejectPerson(supabase, id);
            if (r.ok) {
              done.push(id);
              ignored += r.ignored;
            } else failed.push(id);
          }
        } catch (err) {
          console.error("[/api/people/bulk] per-id soft-fail:", err);
          failed.push(id);
        }
      }
    }
    return NextResponse.json({ ok: failed.length === 0, action: action as BulkAction, done, failed, ignored });
  } catch (err) {
    console.error("[/api/people/bulk POST]", err);
    return NextResponse.json({ error: "bulk action failed" }, { status: 500 });
  }
}
