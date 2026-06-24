import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

const VOICE_MAP: Record<string, string> = {
  da_boi: "onyx",
  fitness: "echo",
  finance: "fable",
  tasks: "alloy",
  nutrition: "nova",
  founder: "onyx",
  engineer: "echo",
};

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY missing" },
        { status: 500 },
      );
    }

    const { text, agentId } = (await req.json()) as {
      text?: string;
      agentId?: string;
    };
    if (!text) {
      return NextResponse.json({ error: "text required" }, { status: 400 });
    }

    const voice = VOICE_MAP[agentId ?? ""] ?? "alloy";

    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "tts-1",
        voice,
        input: text,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[agents/tts] OpenAI error", res.status, err);
      return NextResponse.json({ error: "TTS failed" }, { status: 502 });
    }

    const audioBuffer = await res.arrayBuffer();
    return new NextResponse(audioBuffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(audioBuffer.byteLength),
      },
    });
  } catch (err) {
    console.error("[agents/tts POST]", err);
    return NextResponse.json({ error: "tts failed" }, { status: 500 });
  }
}
