import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const USD_TO_GBP = 0.79;

type CacheEntry = { data: unknown; ts: number };
let cache: CacheEntry | null = null;
const CACHE_TTL = 5 * 60 * 1000;

function costPerMTok(tokens: number, ratePerMTok: number): number {
  return (tokens / 1_000_000) * ratePerMTok;
}

async function fetchAnthropicUsage(): Promise<{
  available: boolean;
  models?: { model: string; input_tokens: number; output_tokens: number; cost_usd: number }[];
  daily?: { date: string; input_tokens: number; output_tokens: number }[];
  total_input?: number;
  total_output?: number;
  total_cost_usd?: number;
  error?: string;
}> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { available: false, error: "No API key configured" };

  try {
    const res = await fetch("https://api.anthropic.com/v1/usage", {
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
    });

    if (!res.ok) {
      return {
        available: false,
        error:
          res.status === 403
            ? "Usage data requires billing API access"
            : `API returned ${res.status}`,
      };
    }

    const data = await res.json();
    return { available: true, ...data };
  } catch {
    return { available: false, error: "Usage data requires billing API access" };
  }
}

async function fetchOpenAIUsage(): Promise<{
  available: boolean;
  models?: { model: string; input_tokens: number; output_tokens: number; cost_usd: number }[];
  total_cost_usd?: number;
  error?: string;
}> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { available: false, error: "No API key configured" };

  try {
    const today = new Date().toISOString().slice(0, 10);

    const res = await fetch(
      `https://api.openai.com/v1/usage?date=${today}`,
      {
        headers: { Authorization: `Bearer ${key}` },
      },
    );

    if (!res.ok) {
      return {
        available: false,
        error:
          res.status === 403
            ? "Usage data requires admin API key"
            : `API returned ${res.status}`,
      };
    }

    const data = await res.json();
    return { available: true, ...data };
  } catch {
    return { available: false, error: "Usage data requires admin API key" };
  }
}

async function fetchInternalUsage() {
  const supabase = createServerClient();
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  const [visionRes, agentsRes, categRes, bloodRes, watchRes] =
    await Promise.all([
      supabase
        .from("foods")
        .select("id", { count: "exact", head: true })
        .neq("source", "manual")
        .gte("created_at", monthStart),

      supabase
        .from("agent_messages")
        .select("agent_id", { count: "exact" })
        .eq("role", "assistant")
        .gte("created_at", monthStart),

      supabase
        .from("transactions")
        .select("id", { count: "exact", head: true })
        .eq("category_source", "ai")
        .gte("created_at", monthStart),

      supabase
        .from("blood_test_sessions")
        .select("id", { count: "exact", head: true })
        .gte("created_at", monthStart),

      supabase
        .from("compost_items")
        .select("id", { count: "exact", head: true })
        .eq("kind", "watch_list")
        .gte("created_at", monthStart),
    ]);

  let agentBreakdown: { agent_id: string; count: number }[] = [];
  try {
    const { data } = await supabase
      .from("agent_messages")
      .select("agent_id")
      .eq("role", "assistant")
      .gte("created_at", monthStart);
    if (data) {
      const counts: Record<string, number> = {};
      for (const row of data) {
        counts[row.agent_id] = (counts[row.agent_id] || 0) + 1;
      }
      agentBreakdown = Object.entries(counts).map(([agent_id, count]) => ({
        agent_id,
        count,
      }));
    }
  } catch {
    /* noop */
  }

  const today = now.toISOString().slice(0, 10);
  let rapidApiEstimate = 0;
  try {
    const { count } = await supabase
      .from("compost_items")
      .select("id", { count: "exact", head: true })
      .eq("kind", "watch_list")
      .gte("created_at", today);
    rapidApiEstimate = (count ?? 0) * 2;
  } catch {
    /* noop */
  }

  return {
    vision_scans: visionRes.count ?? 0,
    agent_messages: agentsRes.count ?? 0,
    agent_breakdown: agentBreakdown,
    ai_categorisations: categRes.count ?? 0,
    blood_test_parses: bloodRes.count ?? 0,
    watch_list_items: watchRes.count ?? 0,
    rapidapi_daily_estimate: rapidApiEstimate,
  };
}

export async function GET() {
  try {
    if (cache && Date.now() - cache.ts < CACHE_TTL) {
      return NextResponse.json(cache.data);
    }

    const [anthropic, openai, internal] = await Promise.all([
      fetchAnthropicUsage(),
      fetchOpenAIUsage(),
      fetchInternalUsage(),
    ]);

    const estVisionTokens = internal.vision_scans * 2500;
    const estAgentTokens = internal.agent_messages * 4000;
    const estCategTokens = internal.ai_categorisations * 500;
    const estBloodTokens = internal.blood_test_parses * 5000;

    const totalInternalTokens =
      estVisionTokens + estAgentTokens + estCategTokens + estBloodTokens;
    const estInternalCostUsd = costPerMTok(totalInternalTokens, 3) + costPerMTok(totalInternalTokens * 0.3, 15);

    const anthropicCostUsd = anthropic.total_cost_usd ?? estInternalCostUsd;
    const openaiCostUsd = openai.total_cost_usd ?? 0;
    const totalCostGbp = (anthropicCostUsd + openaiCostUsd) * USD_TO_GBP;

    const result = {
      anthropic,
      openai,
      internal: {
        ...internal,
        estimates: {
          vision: { calls: internal.vision_scans, tokens: estVisionTokens, cost_usd: costPerMTok(estVisionTokens, 3) + costPerMTok(estVisionTokens * 0.3, 15) },
          agents: { calls: internal.agent_messages, tokens: estAgentTokens, cost_usd: costPerMTok(estAgentTokens, 3) + costPerMTok(estAgentTokens * 0.3, 15) },
          categorisation: { calls: internal.ai_categorisations, tokens: estCategTokens, cost_usd: costPerMTok(estCategTokens, 3) + costPerMTok(estCategTokens * 0.3, 15) },
          blood_tests: { calls: internal.blood_test_parses, tokens: estBloodTokens, cost_usd: costPerMTok(estBloodTokens, 3) + costPerMTok(estBloodTokens * 0.3, 15) },
        },
        total_est_tokens: totalInternalTokens,
        total_est_cost_usd: estInternalCostUsd,
      },
      cost_summary: {
        anthropic_gbp: anthropicCostUsd * USD_TO_GBP,
        openai_gbp: openaiCostUsd * USD_TO_GBP,
        streaming_gbp: 0,
        total_gbp: totalCostGbp,
        usd_to_gbp: USD_TO_GBP,
      },
      rapidapi: {
        plan: "Free tier",
        daily_limit: 100,
        estimated_today: internal.rapidapi_daily_estimate,
      },
      fetched_at: new Date().toISOString(),
    };

    cache = { data: result, ts: Date.now() };
    return NextResponse.json(result);
  } catch (err) {
    console.error("[api-usage GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
