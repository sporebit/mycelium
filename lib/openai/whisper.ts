export async function transcribeAudio(
  buffer: ArrayBuffer,
  filename = "audio.ogg",
  contentType = "audio/ogg"
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY missing");

  const form = new FormData();
  form.append("file", new Blob([buffer], { type: contentType }), filename);
  form.append("model", "whisper-1");
  form.append("response_format", "json");
  // Force English. Without this, Whisper occasionally mis-detects short
  // English clips with accent variation as Welsh / other languages.
  form.append("language", "en");
  // Vocabulary hint — biases Whisper toward spelling of frequent terms.
  form.append(
    "prompt",
    "A personal capture, possibly about tasks, ideas, meetings, reflections, or daily observations. Names of people and places may include: Phil, Sporebit, Mycelium, Armthorpe, Doncaster."
  );
  // Deterministic output (default is 0, but we set it explicitly).
  form.append("temperature", "0");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Whisper failed: ${res.status} ${errText}`);
  }

  const json = (await res.json()) as { text: string };
  return json.text;
}
