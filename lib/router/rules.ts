import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase/server";

export type RoutingRuleScope = "fitness" | "capture";

export type RoutingRule = {
  id: string;
  user_id: string;
  scope: RoutingRuleScope;
  rule_key: string;
  display_name: string;
  description: string;
  examples: string[] | null;
  enabled: boolean;
  priority: number;
  created_at: string;
  updated_at: string;
};

export const ROUTING_RULE_SELECT =
  "id, user_id, scope, rule_key, display_name, description, examples, enabled, priority, created_at, updated_at";

// ---------------------------------------------------------------------------
// In-process cache. The fitness voice parser fires on every voice
// capture and the classifier fires on every text/voice capture; we
// don't want to pay a round-trip to Supabase per call. 60s TTL keeps
// the cache hot enough for chains of captures while letting edits
// propagate within a minute. Cache key includes scope so we can pull
// just the slice we need.
// ---------------------------------------------------------------------------

type CacheEntry = { rules: RoutingRule[]; ts: number };
const TTL_MS = 60_000;
const cache = new Map<string, CacheEntry>();

function cacheKey(userId: string, scope: RoutingRuleScope): string {
  return `${userId}::${scope}`;
}

export function invalidateRoutingRulesCache(userId?: string): void {
  if (!userId) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(`${userId}::`)) cache.delete(key);
  }
}

async function fetchEnabledRules(
  supabase: SupabaseClient,
  userId: string,
  scope: RoutingRuleScope,
): Promise<RoutingRule[]> {
  const { data, error } = await supabase
    .from("routing_rules")
    .select(ROUTING_RULE_SELECT)
    .eq("user_id", userId)
    .eq("scope", scope)
    .eq("enabled", true)
    .order("priority", { ascending: false })
    .order("rule_key", { ascending: true });
  if (error) {
    console.error("[routing-rules] fetch failed:", error);
    return [];
  }
  return (data ?? []) as RoutingRule[];
}

async function getCachedRules(
  userId: string,
  scope: RoutingRuleScope,
): Promise<RoutingRule[]> {
  const key = cacheKey(userId, scope);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.rules;
  try {
    const supabase = createServerClient();
    const rules = await fetchEnabledRules(supabase, userId, scope);
    cache.set(key, { rules, ts: Date.now() });
    return rules;
  } catch (err) {
    console.error("[routing-rules] cache miss fetch failed:", err);
    // Return the stale entry rather than nothing so a transient DB
    // hiccup doesn't strip the user's customisations from the prompt.
    return hit?.rules ?? [];
  }
}

function formatRulesBlock(
  scopeLabel: string,
  rules: RoutingRule[],
): string {
  if (rules.length === 0) return "";
  const lines: string[] = [
    `${scopeLabel} ROUTING RULES (user-defined, override defaults if conflict):`,
  ];
  for (const r of rules) {
    let line = `- ${r.display_name}: ${r.description}`;
    if (Array.isArray(r.examples) && r.examples.length > 0) {
      line += ` e.g. ${r.examples.join(", ")}`;
    }
    lines.push(line);
  }
  return lines.join("\n");
}

/** Renders the fitness rule slice as a system-prompt injection block.
 *  Returns the empty string when the user has no enabled fitness rules
 *  so the calling prompt is free to fall back to its hardcoded defaults
 *  without sprouting a stray heading. */
export async function buildFitnessRulesBlock(userId: string): Promise<string> {
  const rules = await getCachedRules(userId, "fitness");
  return formatRulesBlock("FITNESS", rules);
}

/** Same for the capture classifier scope. */
export async function buildCaptureRulesBlock(userId: string): Promise<string> {
  const rules = await getCachedRules(userId, "capture");
  return formatRulesBlock("CAPTURE", rules);
}
