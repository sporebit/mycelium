import { NextRequest, NextResponse } from "next/server";
import { callClaudeJSON } from "@/lib/ai/anthropic";

export const runtime = "nodejs";

const SYSTEM_PROMPT = `You re-balance macronutrients to fit a specified calorie target for a named food.

Return ONLY a JSON object with this exact shape:
{ "p": number, "c": number, "f": number }

Rules:
- "p" / "c" / "f": grams of protein / carbs / fat, integers.
- Numbers must be realistic for the named food at the given kcal target.
- Must be self-consistent: target_kcal ≈ (4*p) + (4*c) + (9*f) within ±10%.

Respond with the JSON only. No markdown, no preface, no surrounding text.`;

type Macros = { p: number; c: number; f: number };

function validate(obj: unknown): Macros | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  for (const k of ["p", "c", "f"] as const) {
    if (typeof o[k] !== "number" || !Number.isFinite(o[k] as number)) return null;
  }
  return {
    p: Math.max(0, Math.round(o.p as number)),
    c: Math.max(0, Math.round(o.c as number)),
    f: Math.max(0, Math.round(o.f as number)),
  };
}

export async function POST(req: NextRequest) {
  let body: { name?: unknown; kcal?: unknown };
  try {
    body = (await req.json()) as { name?: unknown; kcal?: unknown };
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const kcal = typeof body.kcal === "number" ? Math.round(body.kcal) : NaN;
  if (!name || !Number.isFinite(kcal) || kcal < 0) {
    return NextResponse.json({ error: "name + kcal required" }, { status: 400 });
  }

  const result = await callClaudeJSON<Macros>({
    systemPrompt: SYSTEM_PROMPT,
    userMessage: `Food: ${name}\nTarget kcal: ${kcal}`,
    validate,
    maxTokens: 128,
    timeoutMs: 10_000,
  });

  if (!result) {
    return NextResponse.json({ error: "redistribute failed" }, { status: 502 });
  }
  return NextResponse.json(result);
}
