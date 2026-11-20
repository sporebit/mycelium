/**
 * A nudge from one person to another about an item (master run §7; research
 * rule 30: "Kirsty sees wins first. Her presets lean to offers. Phil has a
 * one-tap Not today needing no explanation, and she is told automatically
 * when the thing is done").
 *
 * The wordings are fixed and lean to offers: a nudge is company, not a
 * chase. There is no free text: the feature must not become a way to say
 * "you still haven't". Pure; lib/nudges/nudgeServer.ts sends them.
 */

export type NudgePreset = { key: string; label: string; say: (from: string, title: string) => string };

const short = (title: string, max = 60) => {
  const t = title.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).replace(/[\s,;:.-]+$/, "")}…`;
};

export const NUDGE_PRESETS: readonly NudgePreset[] = [
  { key: "company", label: "Want company for this?", say: (from, title) => `${from}: want company for "${short(title)}"?` },
  { key: "help", label: "Can I help with this?", say: (from, title) => `${from}: can I help with "${short(title)}"?` },
  { key: "together", label: "Shall we do this together?", say: (from, title) => `${from}: shall we do "${short(title)}" together?` },
  { key: "thinking", label: "Thinking of you on this one", say: (from, title) => `${from} is thinking of you on "${short(title)}".` },
];

export function presetFor(key: unknown): NudgePreset | null {
  return NUDGE_PRESETS.find((p) => p.key === key) ?? null;
}

/** Twelve words or fewer for the wall (research rule 29). */
export function nudgeSpoken(from: string, presetKey: string): string {
  const said: Record<string, string> = { company: "would like to keep you company", help: "is offering to help", together: "would like to do one together", thinking: "is thinking of you" };
  return `${from} ${said[presetKey] ?? "sent a note"}.`;
}

/** What the sender is told when the thing is finished. */
export function nudgeDone(doer: string, title: string): { title: string; body: string } {
  return { title: `${doer} finished it`, body: short(title, 90) };
}

/** A person's name as the other person should see it: their own choice, else something that is not an email address. */
export function nameToShow(displayName: string | null | undefined, fallback = "Someone"): string {
  const n = (displayName ?? "").trim();
  if (!n || n.includes("@")) return fallback;
  return n.slice(0, 40);
}
