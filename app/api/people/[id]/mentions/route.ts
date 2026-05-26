import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import type { MentionWithSnippet, PersonMention } from "@/lib/people/types";

export const runtime = "nodejs";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  const { id: personId } = await ctx.params;
  const limit = Math.min(
    100,
    Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? 20) || 20)
  );

  try {
    const supabase = createServerClient();
    const { data: mentionRows } = await supabase
      .from("people_mentions")
      .select(
        "id, user_id, person_id, source_type, source_id, raw_alias, confidence, candidate_person_ids, needs_review, resolved_at, created_at"
      )
      .eq("user_id", uid)
      .eq("person_id", personId)
      .order("created_at", { ascending: false })
      .limit(limit);
    const mentions = (mentionRows ?? []) as PersonMention[];

    // Resolve snippets per source — fetch raw_captures, tasks, journal_entries.
    const captureIds = mentions.filter((m) => m.source_type === "capture").map((m) => m.source_id);
    const taskIds = mentions.filter((m) => m.source_type === "task").map((m) => m.source_id);
    const journalIds = mentions.filter((m) => m.source_type === "journal").map((m) => m.source_id);

    const captureBy = new Map<string, { text: string | null; at: string }>();
    const taskBy = new Map<string, { text: string; at: string }>();
    const journalBy = new Map<string, { text: string | null; at: string }>();

    if (captureIds.length > 0) {
      const { data } = await supabase
        .from("raw_captures")
        .select("id, raw_text, created_at")
        .in("id", captureIds);
      for (const r of (data ?? []) as Array<{
        id: string;
        raw_text: string | null;
        created_at: string;
      }>) {
        captureBy.set(r.id, { text: r.raw_text, at: r.created_at });
      }
    }
    if (taskIds.length > 0) {
      const { data } = await supabase
        .from("tasks")
        .select("id, title, created_at")
        .in("id", taskIds);
      for (const r of (data ?? []) as Array<{
        id: string;
        title: string;
        created_at: string;
      }>) {
        taskBy.set(r.id, { text: r.title, at: r.created_at });
      }
    }
    if (journalIds.length > 0) {
      const { data } = await supabase
        .from("journal_entries")
        .select("id, raw_text, created_at")
        .in("id", journalIds);
      for (const r of (data ?? []) as Array<{
        id: string;
        raw_text: string | null;
        created_at: string;
      }>) {
        journalBy.set(r.id, { text: r.raw_text, at: r.created_at });
      }
    }

    const withSnippet: MentionWithSnippet[] = mentions.map((m) => {
      let snippet: string | null = null;
      let source_at: string | null = null;
      if (m.source_type === "capture") {
        const row = captureBy.get(m.source_id);
        if (row) {
          snippet = row.text;
          source_at = row.at;
        }
      } else if (m.source_type === "task") {
        const row = taskBy.get(m.source_id);
        if (row) {
          snippet = row.text;
          source_at = row.at;
        }
      } else {
        const row = journalBy.get(m.source_id);
        if (row) {
          snippet = row.text;
          source_at = row.at;
        }
      }
      return { ...m, snippet, source_at };
    });

    return NextResponse.json({ mentions: withSnippet });
  } catch (err) {
    console.error("[/api/people/:id/mentions GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
