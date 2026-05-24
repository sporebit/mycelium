import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { JOURNAL_SELECT, type JournalEntry } from "@/lib/journal/types";

export const runtime = "nodejs";

const SYSTEM_PROMPT = `Summarise this day from these journal entries. 2-3 sentences, conversational, past tense, write as if narrating the day. UK English. Don't list events — synthesise.`;

async function generateSummary(entries: JournalEntry[]): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.ANTHROPIC_MODEL;
  if (!apiKey || !model) return null;
  if (entries.length === 0) return null;

  const userMessage = entries
    .map(
      (e, i) =>
        `Entry ${i + 1} (${new Date(e.created_at).toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })}):\n${e.raw_text}`
    )
    .join("\n\n");

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20_000);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 220,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const j = (await res.json()) as {
      content?: { type: string; text?: string }[];
    };
    const text = j.content?.find((b) => b.type === "text")?.text;
    return typeof text === "string" ? text.trim() : null;
  } catch (err) {
    console.error("[journal summary] generation failed:", err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function loadEntry(
  id: string,
  uid: string
): Promise<JournalEntry | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("journal_entries")
    .select(JOURNAL_SELECT)
    .eq("user_id", uid)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return data as JournalEntry;
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const uid = process.env.USER_ID;
  if (!uid) {
    return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  }
  const { id } = await ctx.params;
  const entry = await loadEntry(id, uid);
  if (!entry) return NextResponse.json({ error: "not found" }, { status: 404 });

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("journal_daily_summaries")
    .select("summary, entry_ids, generated_at, entry_date")
    .eq("user_id", uid)
    .eq("entry_date", entry.entry_date)
    .maybeSingle();
  if (error) {
    console.error("[journal summary GET]", error);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
  return NextResponse.json({ summary: data ?? null, entry_date: entry.entry_date });
}

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const uid = process.env.USER_ID;
  if (!uid) {
    return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  }
  const { id } = await ctx.params;
  const entry = await loadEntry(id, uid);
  if (!entry) return NextResponse.json({ error: "not found" }, { status: 404 });

  try {
    const supabase = createServerClient();
    const { data: entries, error: fetchErr } = await supabase
      .from("journal_entries")
      .select(JOURNAL_SELECT)
      .eq("user_id", uid)
      .eq("entry_date", entry.entry_date)
      .order("created_at", { ascending: true });
    if (fetchErr) throw fetchErr;

    const dayEntries = (entries ?? []) as JournalEntry[];
    const summaryText = await generateSummary(dayEntries);
    if (!summaryText) {
      return NextResponse.json(
        { error: "summary generation failed" },
        { status: 502 }
      );
    }

    const entryIds = dayEntries.map((e) => e.id);

    const { error: upsertErr } = await supabase
      .from("journal_daily_summaries")
      .upsert(
        {
          user_id: uid,
          entry_date: entry.entry_date,
          summary: summaryText,
          entry_ids: entryIds,
          generated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,entry_date" }
      );
    if (upsertErr) throw upsertErr;

    return NextResponse.json({
      summary: {
        summary: summaryText,
        entry_ids: entryIds,
        entry_date: entry.entry_date,
        generated_at: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error("[journal summary POST]", err);
    return NextResponse.json({ error: "summary failed" }, { status: 500 });
  }
}
