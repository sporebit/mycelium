import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const PARSE_MODEL =
  process.env.ANTHROPIC_VISION_MODEL ??
  process.env.ANTHROPIC_MODEL ??
  "claude-sonnet-4-5";

const KNOWN_MARKERS = [
  "hba1c", "crp_hs", "creatinine", "egfr", "cholesterol", "triglycerides",
  "hdl_cholesterol", "ldl_cholesterol", "non_hdl_cholesterol", "tc_hdl_ratio",
  "tg_hdl_ratio", "tsh", "ft4", "active_b12", "total_b12", "vitamin_d",
  "total_protein", "albumin", "globulin", "alt", "alp", "gamma_gt",
  "bilirubin", "shbg", "testosterone", "free_androgen_index", "free_testosterone",
];

const SYSTEM_PROMPT = `You are extracting blood test results from a PDF. Return ONLY valid JSON, no markdown, no explanation.

Extract:
{
  "sampled_at": "YYYY-MM-DD",
  "provider": "string (lab or provider name)",
  "results": [
    {
      "marker_key": "snake_case key matching one of the known markers",
      "display_name": "exact name from PDF",
      "value_raw": "exact string from PDF e.g. '<0.15', '>90.0', '88.0'",
      "value_numeric": float (strip < > and parse; null if unparseable),
      "value_prefix": "< or > if present, else null",
      "ref_min": float or null,
      "ref_max": float or null,
      "ref_direction": "between" | "above" | "below",
      "unit": "string"
    }
  ]
}

Known marker keys: ${KNOWN_MARKERS.join(", ")}.

For unknown markers not in this list, use a lowercase_snake_case key derived from the display name.
ref_direction is "above" when the reference range is "> X" (higher is better, e.g. eGFR), "below" when "< X", "between" otherwise.
sampled_at is the "Sample Collected" date.`;

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

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured" },
      { status: 500 },
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "expected multipart/form-data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: "file field required" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString("base64");

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: PARSE_MODEL,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "document",
                source: {
                  type: "base64",
                  media_type: "application/pdf",
                  data: base64,
                },
              },
              {
                type: "text",
                text: "Extract all blood test results from this PDF and return the JSON per the schema.",
              },
            ],
          },
        ],
      }),
    });

    if (!r.ok) {
      const errText = await r.text().catch(() => "");
      console.error("[/api/health/blood-tests/parse] non-200", {
        status: r.status,
        body: errText.slice(0, 500),
      });
      return NextResponse.json(
        { error: "PDF parse call failed", status: r.status },
        { status: 502 },
      );
    }

    const j = (await r.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const block = j.content?.find((c) => c.type === "text");
    const raw = block?.text ?? "";
    const parsed = extractJsonBlock(raw);

    if (!parsed || typeof parsed !== "object") {
      return NextResponse.json(
        { error: "could not parse extracted JSON", raw },
        { status: 502 },
      );
    }

    return NextResponse.json({ parsed });
  } catch (err) {
    console.error("[/api/health/blood-tests/parse] threw", err);
    return NextResponse.json({ error: "parse failed" }, { status: 500 });
  }
}
