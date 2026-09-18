/**
 * Quotes — background research (spec §5, decisions 16–19). One Sonnet call
 * with the web search tool per approved, non-skipped quote, returning the
 * §3.1 payload. "unknown" and "original" are good answers; the model must
 * not invent a source. Usage lands in api_usage under `quotes.research`.
 * Statuses: pending → running → found | none | failed; skipped from the
 * extraction; wrong is Phil's override. `failed` retries once via the
 * sweeper, then stays failed with the error in research.error.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { MODEL_CHAT } from "@/lib/config/models";
import { costPence, recordUsage } from "@/lib/ai/usage";

export const RESEARCH_TAG = "quotes.research";

export type ResearchPayload = {
  verdict: "known" | "unknown" | "original";
  confidence: "high" | "medium" | "low";
  original_author: string | null;
  source_work: string | null;
  year: number | null;
  context: string | null;
  wording_note: string | null;
  sources: Array<{ title: string; url: string }>;
  model: string;
  searched_at: string;
  error?: string;
  attempts?: number;
};

type Result = { ok: true; status: "found" | "none"; research: ResearchPayload } | { ok: false; error: string; status: number };

function parsePayload(text: string): Omit<ResearchPayload, "model" | "searched_at"> | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const o = JSON.parse(m[0]) as Record<string, unknown>;
    const verdict = o.verdict === "known" || o.verdict === "original" ? o.verdict : "unknown";
    const confidence = o.confidence === "high" || o.confidence === "medium" ? o.confidence : "low";
    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
    const sources = Array.isArray(o.sources)
      ? (o.sources as unknown[])
          .map((s) => (s && typeof s === "object" ? (s as Record<string, unknown>) : null))
          .filter((s): s is Record<string, unknown> => !!s && typeof s.url === "string")
          .map((s) => ({ title: str(s.title) ?? String(s.url), url: String(s.url) }))
          .slice(0, 5)
      : [];
    return {
      verdict,
      confidence,
      original_author: str(o.original_author),
      source_work: str(o.source_work),
      year: typeof o.year === "number" && Number.isFinite(o.year) ? o.year : null,
      context: str(o.context),
      wording_note: str(o.wording_note),
      sources,
    };
  } catch {
    return null;
  }
}

/** Run research for one quote; writes status/research on the row. */
export async function researchQuote(db: SupabaseClient, id: string, opts: { force?: boolean } = {}): Promise<Result> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, error: "ANTHROPIC_API_KEY missing", status: 500 };
  const { data } = await db.from("quotes").select("id, text, context, source, research_status, research, is_own").eq("id", id).maybeSingle();
  const q = data as { id: string; text: string; context: string | null; source: string | null; research_status: string; research: Record<string, unknown> | null; is_own: boolean } | null;
  if (!q) return { ok: false, error: "not found", status: 404 };
  if (!opts.force && !["pending", "failed"].includes(q.research_status)) {
    return { ok: false, error: `research is ${q.research_status}`, status: 409 };
  }
  const attempts = Number(q.research?.attempts ?? 0) + 1;
  await db.from("quotes").update({ research_status: "running", updated_at: new Date().toISOString() }).eq("id", id);

  const system = [
    "You research the provenance of short quotations. British English.",
    "Given a quote someone said in conversation, decide whether it is a known saying / famous line (verdict \"known\"), something you cannot trace (\"unknown\"), or most likely the speaker's own words (\"original\").",
    "Use web search (at most 3 searches). \"unknown\" and \"original\" are good answers. Never invent an author, work, year or URL. Only cite URLs you actually saw.",
    "If it is widely attributed with no primary source, say so in original_author (e.g. \"unknown — widely attributed\") and set confidence to \"low\" or \"medium\".",
    "Respond with ONLY a JSON object: { \"verdict\": \"known\"|\"unknown\"|\"original\", \"confidence\": \"high\"|\"medium\"|\"low\", \"original_author\": string|null, \"source_work\": string|null, \"year\": number|null, \"context\": string|null, \"wording_note\": string|null, \"sources\": [{\"title\": string, \"url\": string}] }.",
  ].join("\n");
  const user = [`Quote: "${q.text}"`, q.context ? `Context: ${q.context}` : "", q.source ? `The person thinks it comes from: ${q.source}` : ""].filter(Boolean).join("\n");

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 55_000);
  const searched_at = new Date().toISOString();
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      signal: ctrl.signal,
      body: JSON.stringify({
        model: MODEL_CHAT,
        max_tokens: 700,
        system,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }],
        messages: [{ role: "user", content: user }],
      }),
    });
    const j = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number; server_tool_use?: { web_search_requests?: number } };
      error?: { message?: string };
    };
    if (!res.ok) throw new Error(j.error?.message ?? `anthropic ${res.status}`);
    const text = (j.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n").trim();
    const parsed = parsePayload(text);
    if (!parsed) throw new Error("unparseable response");
    const input = j.usage?.input_tokens ?? 0;
    const output = j.usage?.output_tokens ?? 0;
    const searches = j.usage?.server_tool_use?.web_search_requests ?? 0;
    await recordUsage(db, { tag: RESEARCH_TAG, model: MODEL_CHAT, input_tokens: input, output_tokens: output, cost_pence: costPence(MODEL_CHAT, input, output, searches * 0.01), meta: { quote: id, searches } });
    const research: ResearchPayload = { ...parsed, model: MODEL_CHAT, searched_at, attempts };
    const status = parsed.verdict === "known" ? "found" : "none";
    await db
      .from("quotes")
      .update({
        research_status: status,
        research,
        research_ran_at: searched_at,
        attributed_to: parsed.verdict === "known" ? parsed.original_author : null,
        updated_at: searched_at,
      })
      .eq("id", id);
    return { ok: true, status, research };
  } catch (err) {
    const error = err instanceof Error ? err.message : "failed";
    await db
      .from("quotes")
      .update({ research_status: "failed", research: { ...(q.research ?? {}), error, attempts, searched_at }, research_ran_at: searched_at, updated_at: searched_at })
      .eq("id", id);
    return { ok: false, error, status: 502 };
  } finally {
    clearTimeout(timer);
  }
}

/** Sweeper: pending rows older than 10 minutes, plus failed rows with one attempt. */
export async function sweepResearch(db: SupabaseClient, opts: { limit?: number } = {}): Promise<{ candidates: number; ran: string[]; failed: string[] }> {
  const cutoff = new Date(Date.now() - 10 * 60_000).toISOString();
  const { data } = await db
    .from("quotes")
    .select("id, research_status, research, created_at")
    .in("research_status", ["pending", "failed"])
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(opts.limit ?? 10);
  const rows = (data ?? []) as Array<{ id: string; research_status: string; research: Record<string, unknown> | null }>;
  const ran: string[] = [];
  const failed: string[] = [];
  for (const r of rows) {
    if (r.research_status === "failed" && Number(r.research?.attempts ?? 0) >= 2) continue;
    const res = await researchQuote(db, r.id);
    (res.ok ? ran : failed).push(r.id);
  }
  return { candidates: rows.length, ran, failed };
}
