/**
 * The system prompt for one agent turn, built the same way for the JSON chat
 * route, the streaming voice route and the tool-confirmation follow-up.
 *
 * Order matters for prompt caching: tools → system → messages is the cached
 * prefix, so everything appended here must be byte-stable across the turns
 * of one conversation. The persona, memory summary and the user's chosen
 * manner all are; the spoken suffix flips only when the user switches
 * between typing and talking, which costs one cache write per switch.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { AGENT_SYSTEM_PROMPTS, buildDaBoiPrompt } from "./prompts";
import { DA_BOI_DOMAINS, relevantDomains, type DaBoiDomain } from "./relevance";
import { toolsForAgent } from "./tools";
import { agentVoice } from "./voice";
import { recentDaysContext } from "@/lib/daylog/afterClose";
import { getDaylogSettings } from "@/lib/daylog/settings";

export const TOOL_CAPABILITY_SUFFIX =
  "\n\nYou have tools available to create tasks and records in Myphelium2 directly. When the user asks you to create something, first describe what you plan to create and ask for confirmation. Only call the tool after they confirm.";

/** Appended when the reply will be read aloud (MYC-148): short, sayable, no markup. */
export const SPOKEN_SUFFIX =
  "\n\nThis reply is read aloud by text-to-speech, so answer the way you would speak: a few short sentences, no lists, headings, markdown, links or emoji, and say numbers, times and dates the way you would say them out loud.";

/** The user's own instruction for how this agent talks (MYC-149), verbatim. */
export function mannerSuffix(style: string | null | undefined): string {
  const s = style?.trim();
  return s ? `\n\nHow you speak — the user's own instruction, kept in every reply: ${s}` : "";
}

async function daBoiPrompt(supabase: SupabaseClient, domains: Set<DaBoiDomain>, live: boolean): Promise<string> {
  const { data: allMemories } = await supabase.from("agent_memory").select("agent_id, summary");
  const memMap = new Map<string, string>();
  for (const m of (allMemories ?? []) as { agent_id: string; summary: string }[]) memMap.set(m.agent_id, m.summary);

  const memories: Partial<Record<DaBoiDomain, string>> = {};
  for (const d of domains) memories[d] = memMap.get(d) || "none";
  if (!live) return buildDaBoiPrompt({ memories, live: {} });

  let recentWorkouts: string | undefined;
  if (domains.has("fitness")) {
    const { data: workouts } = await supabase
      .from("workout_sessions")
      .select("date, name, slot, kind, status")
      .order("date", { ascending: false })
      .limit(5);
    recentWorkouts =
      (workouts ?? []).map((w: Record<string, unknown>) => `${w.date}: ${w.name} (${w.kind}, ${w.status})`).join("; ") || "none";
  }

  let monthlySpend: string | undefined;
  if (domains.has("finance")) try {
    monthlySpend = "unknown";
    const { data: spendData } = await supabase.rpc("txn_agg", {
      p_from: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
      p_to: new Date().toISOString().slice(0, 10),
    });
    if (spendData && typeof spendData === "object" && "total" in (spendData as Record<string, unknown>)) {
      monthlySpend = `£${(spendData as { total: number }).total.toFixed(2)}`;
    }
  } catch { /* RPC may not exist */ }

  let openTaskCount: number | undefined;
  if (domains.has("tasks")) try {
    openTaskCount = 0;
    const { count } = await supabase.from("tickets").select("id", { count: "exact", head: true }).is("completed_at", null);
    openTaskCount = count ?? 0;
  } catch { /* table may differ */ }

  let avgCalories: string | undefined;
  if (domains.has("nutrition")) try {
    avgCalories = "unknown";
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const { data: nutritionData } = await supabase.from("nutrition_logs").select("calories").gte("logged_at", sevenDaysAgo.toISOString());
    if (nutritionData && nutritionData.length > 0) {
      const total = (nutritionData as { calories: number }[]).reduce((s, n) => s + (n.calories || 0), 0);
      avgCalories = `${Math.round(total / nutritionData.length)} kcal`;
    }
  } catch { /* table may differ */ }

  return buildDaBoiPrompt({
    memories,
    live: { recent_workouts: recentWorkouts, monthly_spend: monthlySpend, open_task_count: openTaskCount, avg_calories: avgCalories },
  });
}

export type AgentTurnPrompt = { system: string; tools: ReturnType<typeof toolsForAgent> };

/**
 * `userMessage` is the fresh turn: Da Boi's domains are scoped to it and the
 * day-log diet is added. Without one (a tool confirmation continuing an old
 * conversation) Da Boi keeps every summary and no live data, as before.
 */
export async function buildAgentSystemPrompt(
  supabase: SupabaseClient,
  agentId: string,
  opts: { userMessage?: string; spoken?: boolean } = {},
): Promise<AgentTurnPrompt> {
  let system: string;
  if (agentId === "da_boi") {
    system = opts.userMessage
      ? await daBoiPrompt(supabase, relevantDomains(opts.userMessage), true)
      : await daBoiPrompt(supabase, new Set(DA_BOI_DOMAINS), false);
  } else {
    const { data: memory } = await supabase.from("agent_memory").select("summary").eq("agent_id", agentId).single();
    const promptFn = AGENT_SYSTEM_PROMPTS[agentId];
    system = promptFn ? promptFn(memory?.summary || "No previous memory.") : `You are an AI assistant. ${memory?.summary || ""}`;
  }

  if (opts.userMessage) {
    // Day log context diet (daylog spec §4.4 step 5, flag 6): the last three
    // day summaries for Da Boi and the persona agent only — read here, never
    // written into agent_memory.
    try {
      const persona = (await getDaylogSettings(supabase)).persona_agent_id;
      if (agentId === "da_boi" || agentId === persona) {
        const recent = await recentDaysContext(supabase);
        if (recent) system += `\n\n${recent}`;
      }
    } catch (err) {
      console.error("[agents] day log context failed:", err instanceof Error ? err.message : err);
    }
  }

  try {
    system += mannerSuffix((await agentVoice(supabase, agentId)).speaking_style);
  } catch (err) {
    console.error("[agents] manner lookup failed:", err instanceof Error ? err.message : err);
  }
  if (opts.spoken) system += SPOKEN_SUFFIX;

  const tools = toolsForAgent(agentId);
  if (tools.length > 0) system += TOOL_CAPABILITY_SUFFIX;
  return { system, tools };
}
