import { FEATURE_HEADER } from "@/lib/ai/meterRules";

/** `feature` is the tag the meter files the cost under (lib/system/aiMeter.ts). */
export async function generateEmbedding(text: string, feature = "capture.embed"): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY missing");

  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      [FEATURE_HEADER]: feature,
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Embedding failed: ${res.status} ${errText}`);
  }

  const json = (await res.json()) as { data: { embedding: number[] }[] };
  return json.data[0].embedding;
}
