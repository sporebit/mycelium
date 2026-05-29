import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import {
  ROUTING_RULE_SELECT,
  invalidateRoutingRulesCache,
  type RoutingRule,
  type RoutingRuleScope,
} from "@/lib/router/rules";

export const runtime = "nodejs";

const SCOPES: RoutingRuleScope[] = ["fitness", "capture"];

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64) || "rule";
}

export async function GET(req: NextRequest) {
  const uid = userId();
  if (!uid) {
    return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  }
  const url = new URL(req.url);
  const scopeParam = url.searchParams.get("scope");

  try {
    const supabase = createServerClient();
    let q = supabase
      .from("routing_rules")
      .select(ROUTING_RULE_SELECT)
      .eq("user_id", uid)
      .order("scope", { ascending: true })
      .order("priority", { ascending: false })
      .order("rule_key", { ascending: true });
    if (scopeParam && SCOPES.includes(scopeParam as RoutingRuleScope)) {
      q = q.eq("scope", scopeParam);
    }
    const { data, error } = await q;
    if (error) throw error;
    return NextResponse.json({ rules: (data ?? []) as RoutingRule[] });
  } catch (err) {
    console.error("[/api/routing-rules GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

type CreateBody = {
  scope?: RoutingRuleScope;
  rule_key?: string;
  display_name?: string;
  description?: string;
  examples?: string[];
  enabled?: boolean;
  priority?: number;
};

export async function POST(req: NextRequest) {
  const uid = userId();
  if (!uid) {
    return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  }
  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const scope = body.scope;
  if (!scope || !SCOPES.includes(scope)) {
    return NextResponse.json({ error: "scope required" }, { status: 400 });
  }
  const displayName = body.display_name?.trim();
  if (!displayName) {
    return NextResponse.json(
      { error: "display_name required" },
      { status: 400 },
    );
  }
  const description = body.description?.trim();
  if (!description) {
    return NextResponse.json(
      { error: "description required" },
      { status: 400 },
    );
  }
  const ruleKey =
    body.rule_key && body.rule_key.trim()
      ? slugify(body.rule_key)
      : slugify(displayName);
  const examples = Array.isArray(body.examples)
    ? body.examples
        .map((e) => (typeof e === "string" ? e.trim() : ""))
        .filter(Boolean)
    : null;

  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("routing_rules")
      .insert({
        user_id: uid,
        scope,
        rule_key: ruleKey,
        display_name: displayName,
        description,
        examples,
        enabled: body.enabled !== false,
        priority:
          typeof body.priority === "number" && Number.isFinite(body.priority)
            ? Math.round(body.priority)
            : 0,
      })
      .select(ROUTING_RULE_SELECT)
      .single();
    if (error || !data) {
      // Unique-constraint violation on (user_id, scope, rule_key)
      // surfaces as Postgres code 23505. Map to a friendly 409.
      if ((error as { code?: string })?.code === "23505") {
        return NextResponse.json(
          { error: `rule_key '${ruleKey}' already exists for ${scope}` },
          { status: 409 },
        );
      }
      throw error ?? new Error("insert returned no row");
    }
    invalidateRoutingRulesCache(uid);
    return NextResponse.json({ rule: data as RoutingRule });
  } catch (err) {
    console.error("[/api/routing-rules POST]", err);
    return NextResponse.json({ error: "create failed" }, { status: 500 });
  }
}
