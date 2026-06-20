import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const PARSE_PROMPT = `Extract a recipe from this image and return ONLY valid JSON, no markdown:
{
  "title": "string",
  "source_name": "string | null",
  "source_url": "string | null",
  "prep_time_minutes": "number | null",
  "cook_time_minutes": "number | null",
  "servings": "number | null",
  "ingredients": [
    { "amount": "string", "unit": "string | null", "name": "string", "notes": "string | null" }
  ],
  "method": [
    { "step": "number", "instruction": "string" }
  ],
  "tags": ["string"],
  "cuisine": "string | null",
  "notes": "string | null"
}

Format ingredients consistently: amount as a string (e.g. '2', '1/2', '1 tbsp'), unit separately, name as clean ingredient name.
Format method as numbered steps, each as a complete instruction.
If this is a Gousto recipe card, extract the Gousto branding as source_name: 'Gousto'.
If a value is not visible, return null.`;

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY missing" }, { status: 500 });
    }

    const formData = await req.formData();
    const file = formData.get("image") as File | null;
    if (!file) {
      return NextResponse.json({ error: "image file required" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString("base64");
    const mediaType = file.type || "image/jpeg";

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2048,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mediaType, data: base64 },
              },
              { type: "text", text: PARSE_PROMPT },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[recipes/parse] API error", res.status, err);
      return NextResponse.json({ error: "Vision API failed" }, { status: 502 });
    }

    const json = (await res.json()) as {
      content?: { type: string; text?: string }[];
    };
    const text = json.content?.find((b) => b.type === "text")?.text ?? "";

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "Could not parse recipe from image" }, { status: 422 });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ ok: true, recipe: parsed });
  } catch (err) {
    console.error("[recipes/parse POST]", err);
    return NextResponse.json({ error: "parse failed" }, { status: 500 });
  }
}
