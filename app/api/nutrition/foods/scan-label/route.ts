import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

const VISION_MODEL =
  process.env.ANTHROPIC_VISION_MODEL ?? "claude-sonnet-4-20250514";

type Extracted = {
  product_name: string;
  brand: string | null;
  serving_size_g: number | null;
  servings_per_pack: number | null;
  kcal_per_100g: number | null;
  protein_per_100g: number | null;
  carbs_per_100g: number | null;
  fat_per_100g: number | null;
  fibre_per_100g: number | null;
  sugar_per_100g: number | null;
  saturated_fat_per_100g: number | null;
  salt_per_100g: number | null;
  ingredients: string | null;
  confidence: "high" | "medium" | "low";
};

const SYSTEM_PROMPT = `You read photos of food nutrition labels (UK / EU
"per 100g" format preferred but US "per serving" tables are common).

Extract the nutritional information and return a single JSON object.

Schema (every key must be present; use null when unreadable):
{
  "product_name": string,
  "brand": string | null,
  "serving_size_g": number | null,
  "servings_per_pack": number | null,
  "kcal_per_100g": number,
  "protein_per_100g": number,
  "carbs_per_100g": number,
  "fat_per_100g": number,
  "fibre_per_100g": number | null,
  "sugar_per_100g": number | null,
  "saturated_fat_per_100g": number | null,
  "salt_per_100g": number | null,
  "ingredients": string | null,
  "confidence": "high" | "medium" | "low"
}

Rules:
- If the label shows "per serving" only, convert to per-100g using the
  serving size in grams (and note this drove confidence down a notch).
- US labels show sodium in mg — convert to salt in g (salt = sodium × 2.5 / 1000).
- If a number isn't visible, set it to null.
- Set "confidence": "high" if every key value is clearly readable;
  "medium" if you had to convert or some values were partially obscured;
  "low" if the label was blurred / cropped / you mostly guessed.
- "product_name" and "brand": as printed. If they aren't on the label,
  use null for brand and a best-guess label for product_name.

Respond ONLY with the JSON. No prose, no markdown.`;

function safeNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : null;
}

function extractJsonBlock(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

function coerce(obj: unknown): Extracted | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  const conf = o.confidence;
  return {
    product_name:
      typeof o.product_name === "string" && o.product_name.trim()
        ? o.product_name.trim()
        : "Unknown product",
    brand: typeof o.brand === "string" && o.brand.trim() ? o.brand.trim() : null,
    serving_size_g: safeNum(o.serving_size_g),
    servings_per_pack: safeNum(o.servings_per_pack),
    kcal_per_100g: safeNum(o.kcal_per_100g),
    protein_per_100g: safeNum(o.protein_per_100g),
    carbs_per_100g: safeNum(o.carbs_per_100g),
    fat_per_100g: safeNum(o.fat_per_100g),
    fibre_per_100g: safeNum(o.fibre_per_100g),
    sugar_per_100g: safeNum(o.sugar_per_100g),
    saturated_fat_per_100g: safeNum(o.saturated_fat_per_100g),
    salt_per_100g: safeNum(o.salt_per_100g),
    ingredients:
      typeof o.ingredients === "string" && o.ingredients.trim()
        ? o.ingredients.trim()
        : null,
    confidence:
      conf === "high" || conf === "medium" || conf === "low"
        ? (conf as Extracted["confidence"])
        : "low",
  };
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured" },
      { status: 500 },
    );
  }
  let body: { image_base64?: string; media_type?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  let image = body.image_base64?.trim();
  if (!image) {
    return NextResponse.json({ error: "image_base64 required" }, { status: 400 });
  }
  // Allow callers to pass a full data URL — strip the prefix before
  // sending to Anthropic.
  if (image.startsWith("data:")) {
    const comma = image.indexOf(",");
    if (comma >= 0) image = image.slice(comma + 1);
  }
  const mediaType = body.media_type ?? "image/jpeg";

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: VISION_MODEL,
        max_tokens: 800,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType,
                  data: image,
                },
              },
              {
                type: "text",
                text: "Read this nutrition label and return the JSON per the schema.",
              },
            ],
          },
        ],
      }),
    });
    if (!r.ok) {
      const errText = await r.text().catch(() => "");
      console.error("[/api/nutrition/foods/scan-label] non-200", {
        status: r.status,
        body: errText.slice(0, 500),
      });
      return NextResponse.json(
        { error: "vision call failed", status: r.status },
        { status: 502 },
      );
    }
    const j = (await r.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const block = j.content?.find((c) => c.type === "text");
    const raw = block?.text ?? "";
    const parsed = coerce(extractJsonBlock(raw));
    if (!parsed) {
      return NextResponse.json(
        { error: "could not parse extracted JSON", raw },
        { status: 502 },
      );
    }
    return NextResponse.json({ extracted: parsed });
  } catch (err) {
    console.error("[/api/nutrition/foods/scan-label] threw", err);
    return NextResponse.json({ error: "scan failed" }, { status: 500 });
  }
}
