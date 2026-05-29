import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import {
  classifyCapture,
  type Classification,
} from "@/lib/router/classifyCapture";
import {
  ROUTING_RULE_SELECT,
  type RoutingRule,
  type RoutingRuleScope,
} from "@/lib/router/rules";

export const runtime = "nodejs";

type Body = {
  text?: string;
  scope?: RoutingRuleScope;
};

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

/** Lightweight "did this rule fire" probe: a rule matches if any of its
 *  examples appears as a substring of the text (case-insensitive), or
 *  if its description shares a non-trivial keyword. This is a
 *  diagnostic-grade heuristic — the LLM is still the final arbiter of
 *  classification — but it surfaces which user-defined rules are
 *  plausibly in play. */
function ruleMatches(rule: RoutingRule, text: string): boolean {
  const lower = text.toLowerCase();
  if (Array.isArray(rule.examples)) {
    for (const ex of rule.examples) {
      const e = ex.trim().toLowerCase();
      if (e.length >= 2 && lower.includes(e)) return true;
    }
  }
  // Tokenise the description and check for non-trivial overlap. Drop
  // stopwords + tokens under 4 chars so we don't fire on "a"/"the".
  const STOP = new Set([
    "the",
    "and",
    "for",
    "with",
    "that",
    "this",
    "into",
    "from",
    "user",
    "they",
    "their",
    "when",
    "what",
    "kind",
    "list",
    "session",
    "default",
    "rule",
    "rules",
  ]);
  const descTokens = rule.description
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 4 && !STOP.has(t));
  for (const t of descTokens) {
    if (lower.includes(t)) return true;
  }
  return false;
}

export async function POST(req: NextRequest) {
  const uid = userId();
  if (!uid) {
    return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  }
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const text = body.text?.trim();
  if (!text) {
    return NextResponse.json({ error: "text required" }, { status: 400 });
  }
  const scope: RoutingRuleScope =
    body.scope === "fitness" ? "fitness" : "capture";

  try {
    let classification: Classification | null = null;
    let llmSource: string | null = null;
    if (scope === "capture") {
      const res = await classifyCapture(text, uid);
      classification = res.classification;
      llmSource = res.llm_source;
    }
    // Fitness-scope test currently doesn't run the full voice parser
    // (that needs today-session context). We still surface matched
    // fitness rules below — the user can sanity-check vocab without
    // a live workout context.

    const supabase = createServerClient();
    const { data: ruleRows } = await supabase
      .from("routing_rules")
      .select(ROUTING_RULE_SELECT)
      .eq("user_id", uid)
      .eq("scope", scope)
      .eq("enabled", true)
      .order("priority", { ascending: false });
    const rules = (ruleRows ?? []) as RoutingRule[];
    const matched = rules
      .filter((r) => ruleMatches(r, text))
      .map((r) => ({
        id: r.id,
        rule_key: r.rule_key,
        display_name: r.display_name,
        priority: r.priority,
      }));

    return NextResponse.json({
      text,
      scope,
      classification,
      llm_source: llmSource,
      matched_rules: matched,
      total_enabled_rules: rules.length,
    });
  } catch (err) {
    console.error("[/api/routing-rules/test POST]", err);
    return NextResponse.json({ error: "test failed" }, { status: 500 });
  }
}
