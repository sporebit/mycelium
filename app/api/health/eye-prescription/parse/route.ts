import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM_PROMPT = `Extract the optical prescription from this image. This may be a printed prescription form, optician letter, or handwritten prescription. Return ONLY valid JSON, no markdown:
{
  "prescribed_at": "YYYY-MM-DD or null if not found",
  "optician": "string or null",
  "is_contact_lens": false,
  "right_eye": {
    "sphere": null,
    "cylinder": null,
    "axis": null,
    "add_power": null,
    "pupillary_distance": null,
    "base_curve": null,
    "diameter": null,
    "brand": null
  },
  "left_eye": {
    "sphere": null,
    "cylinder": null,
    "axis": null,
    "add_power": null,
    "pupillary_distance": null,
    "base_curve": null,
    "diameter": null,
    "brand": null
  },
  "notes": null
}

Sphere values are typically between -20.00 and +20.00.
Cylinder values are typically between -6.00 and +6.00.
Axis is an integer between 0 and 180.
Minus signs are important — do not drop them.
If the prescription is for glasses, is_contact_lens = false.
If it mentions lenses, base curve, or diameter, is_contact_lens = true.`;

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
        model: "claude-sonnet-4-5-20250514",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mediaType, data: base64 },
              },
              { type: "text", text: SYSTEM_PROMPT },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[eye-prescription/parse] API error", res.status, err);
      return NextResponse.json({ error: "Vision API failed" }, { status: 502 });
    }

    const json = (await res.json()) as {
      content?: { type: string; text?: string }[];
    };
    const text = json.content?.find((b) => b.type === "text")?.text ?? "";

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "Could not read prescription from image" }, { status: 422 });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ ok: true, prescription: parsed });
  } catch (err) {
    console.error("[eye-prescription/parse POST]", err);
    return NextResponse.json({ error: "parse failed" }, { status: 500 });
  }
}
