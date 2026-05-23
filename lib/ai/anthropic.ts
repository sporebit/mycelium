function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

export async function callClaudeJSON<T>(opts: {
  systemPrompt: string;
  userMessage: string;
  validate: (obj: unknown) => T | null;
  maxTokens?: number;
  timeoutMs?: number;
}): Promise<T | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.ANTHROPIC_MODEL;
  if (!apiKey || !model) return null;

  const controller = new AbortController();
  const timer = opts.timeoutMs
    ? setTimeout(() => controller.abort(), opts.timeoutMs)
    : null;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: opts.maxTokens ?? 512,
        system: opts.systemPrompt,
        messages: [{ role: "user", content: opts.userMessage }],
      }),
      signal: controller.signal,
    });

    if (!res.ok) return null;
    const json = (await res.json()) as {
      content?: { type: string; text?: string }[];
    };
    const text = json.content?.find((b) => b.type === "text")?.text;
    if (!text) return null;
    return opts.validate(extractJson(text));
  } catch (err) {
    console.error("[anthropic] call failed:", err);
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
