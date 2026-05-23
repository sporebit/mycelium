import { NextRequest, NextResponse } from "next/server";
import { callClaudeJSON } from "@/lib/ai/anthropic";

export const runtime = "nodejs";

const SYSTEM_PROMPT = `You estimate calories and macronutrients for foods described in natural language.

Return ONLY a JSON object with this exact shape:
{ "name": string, "kcal": number, "p": number, "c": number, "f": number }

Rules:
- "name": short, clean version of the user's input (3-6 words max, no punctuation).
- "kcal": total calories, integer.
- "p" / "c" / "f": protein / carbs / fat in grams, integers.
- Use a realistic average portion size unless the user specified a quantity.
- If the input is vague, take your best guess rather than refusing.
- Numbers must be self-consistent: kcal ≈ (4*p) + (4*c) + (9*f) within ±15%.

Respond with the JSON only. No markdown, no preface, no surrounding text.`;

type Estimate = { name: string; kcal: number; p: number; c: number; f: number };

function validate(obj: unknown): Estimate | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  if (typeof o.name !== "string") return null;
  for (const k of ["kcal", "p", "c", "f"] as const) {
    if (typeof o[k] !== "number" || !Number.isFinite(o[k] as number)) return null;
  }
  return {
    name: o.name.trim(),
    kcal: Math.max(0, Math.round(o.kcal as number)),
    p: Math.max(0, Math.round(o.p as number)),
    c: Math.max(0, Math.round(o.c as number)),
    f: Math.max(0, Math.round(o.f as number)),
  };
}

export async function POST(req: NextRequest) {
  let body: { text?: unknown };
  try {
    body = (await req.json()) as { text?: unknown };
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "text required" }, { status: 400 });
  }

  const result = await callClaudeJSON<Estimate>({
    systemPrompt: SYSTEM_PROMPT,
    userMessage: text,
    validate,
    maxTokens: 256,
    timeoutMs: 10_000,
  });

  if (!result) {
    return NextResponse.json(
      { error: "estimate failed — try a clearer description" },
      { status: 502 }
    );
  }
  return NextResponse.json(result);
}
