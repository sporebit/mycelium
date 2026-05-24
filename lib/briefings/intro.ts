import type { BriefingData } from "./data";

const SYSTEM_PROMPT = `You are writing the opening line of Phil's daily briefing. One sentence. Energetic but not cheesy. Reference one concrete thing from today — the weather, a calendar event, a habit streak, a notable financial movement, or a blocker — whichever feels most worth flagging. Don't say "Good morning". Don't use exclamation marks. UK English. Cap at 25 words.`;

function buildContext(data: BriefingData): string {
  const lines: string[] = [];
  lines.push(`Date: ${data.dateKey}`);
  if (data.weather) {
    lines.push(
      `Weather: ${data.weather.conditions}, hi ${data.weather.hi}°C, lo ${data.weather.lo}°C`
    );
  }
  lines.push(`Habit streak: ${data.streak} days`);
  lines.push(`Habits yesterday: ${data.habits.done}/${data.habits.total}`);
  if (data.calendar.length > 0) {
    const firstFew = data.calendar
      .slice(0, 3)
      .map((e) => e.title)
      .join(", ");
    lines.push(`Calendar (${data.calendar.length}): ${firstFew}`);
  } else {
    lines.push("Calendar: empty");
  }
  if (data.topTasks.length > 0) {
    lines.push(
      `Top tasks: ${data.topTasks.map((t) => t.title).join("; ")}`
    );
  }
  if (data.blockers.length > 0) {
    lines.push(
      `Blockers: ${data.blockers
        .slice(0, 3)
        .map((b) => `${b.title} (${b.stuckDays}d)`)
        .join("; ")}`
    );
  }
  if (data.finance) {
    const { delta, pct, current } = data.finance;
    const deltaStr =
      delta !== null
        ? ` (overnight ${delta >= 0 ? "+" : ""}£${Math.round(delta).toLocaleString()}${
            pct !== null ? `, ${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%` : ""
          })`
        : "";
    lines.push(
      `Net worth: £${Math.round(current.snapshot.net_worth).toLocaleString()}${deltaStr}`
    );
  }
  return lines.join("\n");
}

export async function generateIntro(
  data: BriefingData
): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.ANTHROPIC_MODEL;
  if (!apiKey || !model) return null;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);

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
        max_tokens: 80,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildContext(data) }],
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const j = (await res.json()) as {
      content?: { type: string; text?: string }[];
    };
    const text = j.content?.find((b) => b.type === "text")?.text;
    if (typeof text !== "string") return null;
    return text.trim().replace(/^["']|["']$/g, "");
  } catch (err) {
    console.error("[briefing] intro generation failed:", err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
