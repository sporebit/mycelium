/**
 * Day log extraction — the pure half (spec §4.3, §4.4, §8). Working state
 * lives on daylog_days.extraction and is patched per turn: Haiku returns a
 * delta, `mergePatch` folds it in by scene `ref`. Nothing here touches the
 * database or a model, so every rule in it is unit-tested.
 */

export const FACT_KINDS = ["food", "drink", "spend", "event", "milestone", "person_fact", "place_fact", "media", "health", "other"] as const;
export type FactKind = (typeof FACT_KINDS)[number];

export type ExScene = { ref: string; title: string; place_text: string | null; time_hint: string | null; people: string[] };
export type ExFact = { scene_ref: string | null; kind: FactKind; subject: string | null; text: string; data: Record<string, unknown> | null; confidence: "stated" | "inferred" };
export type ExQuote = { text: string; speaker: string | null };

export type Extraction = {
  scenes: ExScene[];
  facts: ExFact[];
  unknown_names: string[];
  name_answers: Record<string, string>;
  open_thread: string | null;
  quotes: ExQuote[];
  /** scene ref → daylog_scenes.id, written at close so a re-extract can match rows */
  scene_ids?: Record<string, string>;
};

export type ExtractionPatch = Partial<{
  scenes: Array<Partial<ExScene> & { ref?: string }>;
  facts: Array<Partial<ExFact>>;
  unknown_names: string[];
  name_answers: Record<string, string>;
  open_thread: string | null;
  quotes: Array<Partial<ExQuote>>;
}>;

export function emptyExtraction(): Extraction {
  return { scenes: [], facts: [], unknown_names: [], name_answers: {}, open_thread: null, quotes: [] };
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9£]+/g, " ").trim();
/** The narrator is never a person to link. */
const SELF = new Set(["i", "me", "myself", "phil", "we", "us"]);

function cleanNames(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const n of v) {
    const s = str(n);
    if (!s || SELF.has(s.toLowerCase())) continue;
    if (!out.some((o) => o.toLowerCase() === s.toLowerCase())) out.push(s);
  }
  return out;
}

/** Whatever is stored on the row → a well-formed Extraction. */
export function normaliseExtraction(raw: unknown): Extraction {
  const ex = emptyExtraction();
  if (!raw || typeof raw !== "object") return ex;
  const merged = mergePatch(ex, raw as ExtractionPatch);
  const ids = (raw as { scene_ids?: unknown }).scene_ids;
  if (ids && typeof ids === "object") merged.scene_ids = ids as Record<string, string>;
  return merged;
}

function slug(s: string): string {
  return norm(s).replace(/\s+/g, "-").slice(0, 40) || "scene";
}

/**
 * Fold a patch into the working state. Scenes upsert by `ref` (people are a
 * union, other fields overwrite only when the patch carries a value); facts
 * and quotes dedupe on their normalised text; a name leaves `unknown_names`
 * the moment it has an answer.
 */
export function mergePatch(ex: Extraction, patch: ExtractionPatch | null | undefined): Extraction {
  const next: Extraction = {
    scenes: ex.scenes.map((s) => ({ ...s, people: [...s.people] })),
    facts: ex.facts.map((f) => ({ ...f })),
    unknown_names: [...ex.unknown_names],
    name_answers: { ...ex.name_answers },
    open_thread: ex.open_thread,
    quotes: ex.quotes.map((q) => ({ ...q })),
    ...(ex.scene_ids ? { scene_ids: { ...ex.scene_ids } } : {}),
  };
  if (!patch || typeof patch !== "object") return next;

  for (const p of Array.isArray(patch.scenes) ? patch.scenes : []) {
    if (!p || typeof p !== "object") continue;
    const title = str(p.title);
    const ref = str(p.ref) ?? (title ? slug(title) : null);
    if (!ref) continue;
    const existing = next.scenes.find((s) => s.ref === ref);
    if (existing) {
      if (title) existing.title = title;
      if (str(p.place_text)) existing.place_text = str(p.place_text);
      if (str(p.time_hint)) existing.time_hint = str(p.time_hint);
      for (const n of cleanNames(p.people)) if (!existing.people.some((o) => o.toLowerCase() === n.toLowerCase())) existing.people.push(n);
    } else {
      next.scenes.push({ ref, title: title ?? ref, place_text: str(p.place_text), time_hint: str(p.time_hint), people: cleanNames(p.people) });
    }
  }

  for (const f of Array.isArray(patch.facts) ? patch.facts : []) {
    if (!f || typeof f !== "object") continue;
    const text = str(f.text);
    if (!text) continue;
    const kind: FactKind = (FACT_KINDS as readonly string[]).includes(String(f.kind)) ? (f.kind as FactKind) : "other";
    const subjectRaw = str(f.subject);
    const subject = subjectRaw && !SELF.has(subjectRaw.toLowerCase()) ? subjectRaw : null;
    const key = norm(text);
    if (next.facts.some((o) => norm(o.text) === key && (o.subject ?? "").toLowerCase() === (subject ?? "").toLowerCase())) continue;
    const sceneRef = str(f.scene_ref);
    next.facts.push({
      scene_ref: sceneRef && next.scenes.some((s) => s.ref === sceneRef) ? sceneRef : null,
      kind,
      subject,
      text,
      data: f.data && typeof f.data === "object" ? (f.data as Record<string, unknown>) : null,
      confidence: f.confidence === "inferred" ? "inferred" : "stated",
    });
  }

  if (patch.name_answers && typeof patch.name_answers === "object") {
    for (const [name, answer] of Object.entries(patch.name_answers)) {
      const n = str(name);
      const a = str(answer);
      if (n && a) next.name_answers[n] = a;
    }
  }
  for (const n of cleanNames(patch.unknown_names)) if (!next.unknown_names.some((o) => o.toLowerCase() === n.toLowerCase())) next.unknown_names.push(n);
  const answered = new Set(Object.keys(next.name_answers).map((n) => n.toLowerCase()));
  next.unknown_names = next.unknown_names.filter((n) => !answered.has(n.toLowerCase()));

  if ("open_thread" in patch && str(patch.open_thread)) next.open_thread = str(patch.open_thread);

  for (const q of Array.isArray(patch.quotes) ? patch.quotes : []) {
    const text = str(q?.text);
    if (!text || next.quotes.some((o) => norm(o.text) === norm(text))) continue;
    const speaker = str(q?.speaker);
    next.quotes.push({ text, speaker: speaker && !SELF.has(speaker.toLowerCase()) ? speaker : null });
  }
  return next;
}

/** Drop names the people table already knows: those are not "who's X?" material. */
export function withoutKnown(ex: Extraction, known: Iterable<string>): Extraction {
  const k = new Set(Array.from(known, (n) => n.toLowerCase()));
  return { ...ex, unknown_names: ex.unknown_names.filter((n) => !k.has(n.toLowerCase())) };
}

/** Every distinct name across scenes, fact subjects and quote speakers. */
export function namesIn(ex: Extraction): string[] {
  const out: string[] = [];
  const add = (n: string | null) => {
    if (n && !SELF.has(n.toLowerCase()) && !out.some((o) => o.toLowerCase() === n.toLowerCase())) out.push(n);
  };
  for (const s of ex.scenes) s.people.forEach(add);
  for (const f of ex.facts) add(f.subject);
  for (const q of ex.quotes) add(q.speaker);
  return out;
}

/** The facts-so-far block the interviewer sees (spec §4.3, decision 22). Compact on purpose. */
export function factsSoFar(ex: Extraction): string {
  if (!ex.scenes.length && !ex.facts.length) return "nothing recorded yet";
  const lines: string[] = [];
  for (const s of ex.scenes) {
    const bits = [s.place_text ? `at ${s.place_text}` : null, s.time_hint, s.people.length ? `with ${s.people.join(", ")}` : null].filter(Boolean).join("; ");
    lines.push(`- scene "${s.title}"${bits ? ` (${bits})` : ""}`);
    for (const f of ex.facts.filter((x) => x.scene_ref === s.ref)) lines.push(`    ${f.kind}${f.subject ? ` [${f.subject}]` : ""}: ${f.text}`);
  }
  for (const f of ex.facts.filter((x) => !x.scene_ref)) lines.push(`- ${f.kind}${f.subject ? ` [${f.subject}]` : ""}: ${f.text}`);
  for (const [n, a] of Object.entries(ex.name_answers)) lines.push(`- ${n} is: ${a}`);
  return lines.join("\n");
}

/**
 * Quick mode (spec §2.1): `who / where / one line`. Slashes or new lines
 * separate the fields; with fewer than three the whole reply is the line.
 */
export function parseQuickTemplate(text: string): { who: string[]; where: string | null; line: string } {
  const parts = text.split(/\s*(?:\/|\n|\|)\s*/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 3) return { who: [], where: null, line: text.trim() };
  const [whoRaw, where, ...rest] = parts;
  const alone = /^(no ?one|nobody|alone|just me|me|solo|-|n\/a)$/i.test(whoRaw);
  const who = alone ? [] : cleanNames(whoRaw.split(/\s*(?:,|&|\band\b|\+)\s*/i));
  return { who, where: /^(-|n\/a|nowhere)$/i.test(where) ? null : where, line: rest.join(" / ") };
}

/** The single-scene extraction a Quick reply stands for before any model call. */
export function quickExtraction(text: string): Extraction {
  const q = parseQuickTemplate(text);
  const title = q.where ?? (q.line.length > 48 ? `${q.line.slice(0, 45)}…` : q.line);
  return mergePatch(emptyExtraction(), { scenes: [{ ref: "day", title, place_text: q.where, people: q.who }] });
}

// ---------------------------------------------------------------------------
// pending items (spec §4.4 step 3) — pure: the caller supplies who is known
// ---------------------------------------------------------------------------

export type PendingItem =
  | { type: "daylog_person_link"; key: string; name: string; person_id: string; scene_refs: string[] }
  | { type: "daylog_new_person"; key: string; name: string; note: string | null; scene_refs: string[] }
  | { type: "daylog_fact"; key: string; name: string; fact: ExFact }
  | { type: "daylog_place"; key: string; name: string; scene_ref: string };

/**
 * One item per thing to review. `known` maps a lower-cased name to a person
 * id; `linkedPlaces` lists the scene refs whose place already matched Places.
 * `key` is stable across re-extractions so nothing is queued twice.
 */
export function pendingItems(ex: Extraction, known: Map<string, string>, linkedPlaces: Set<string> = new Set()): PendingItem[] {
  const items: PendingItem[] = [];
  const seenPeople = new Map<string, { name: string; refs: string[] }>();
  for (const s of ex.scenes) {
    for (const n of s.people) {
      const k = n.toLowerCase();
      const cur = seenPeople.get(k) ?? { name: n, refs: [] };
      cur.refs.push(s.ref);
      seenPeople.set(k, cur);
    }
  }
  // a fact's subject is a person too, even when they were in no scene
  for (const f of ex.facts) if (f.subject && !seenPeople.has(f.subject.toLowerCase())) seenPeople.set(f.subject.toLowerCase(), { name: f.subject, refs: [] });

  for (const [k, p] of seenPeople) {
    const personId = known.get(k);
    if (personId) {
      if (p.refs.length) items.push({ type: "daylog_person_link", key: `person:${k}`, name: p.name, person_id: personId, scene_refs: p.refs });
    } else {
      const answer = Object.entries(ex.name_answers).find(([n]) => n.toLowerCase() === k)?.[1] ?? null;
      items.push({ type: "daylog_new_person", key: `person:${k}`, name: p.name, note: answer, scene_refs: p.refs });
    }
  }
  for (const s of ex.scenes) {
    if (s.place_text && !linkedPlaces.has(s.ref)) items.push({ type: "daylog_place", key: `place:${norm(s.place_text)}`, name: s.place_text, scene_ref: s.ref });
  }
  const placeKeys = new Set<string>();
  const deduped = items.filter((i) => i.type !== "daylog_place" || (!placeKeys.has(i.key) && placeKeys.add(i.key)));
  for (const f of ex.facts) deduped.push({ type: "daylog_fact", key: `fact:${norm(f.text)}`, name: f.text, fact: f });
  return deduped;
}

/** The bullet lines of the close narrative ("• …"), one per scene in order. */
export function sceneLines(summary: string | null | undefined): string[] {
  if (!summary) return [];
  return summary
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^[•\-*]\s+/.test(l))
    .map((l) => l.replace(/^[•\-*]\s+/, "").trim())
    .filter(Boolean);
}

/** Tool definition for the per-turn Haiku delta (strict input_schema, spec §4.3). */
export const EXTRACTION_TOOL = {
  name: "record_patch",
  description: "Record ONLY what is new in the latest exchange as a patch to the day's working extraction. Reuse an existing scene ref to add to that scene. Empty arrays when nothing is new.",
  input_schema: {
    type: "object",
    properties: {
      scenes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            ref: { type: "string", description: "short stable slug, e.g. quayside, beach; reuse the existing ref to update a scene" },
            title: { type: "string", description: "a few words, their wording" },
            place_text: { type: "string", description: "the place as said; omit if none was named" },
            time_hint: { type: "string", description: "lunch, ~14:00, evening — only if said" },
            people: { type: "array", items: { type: "string" }, description: "names of others present; never the narrator" },
          },
          required: ["ref", "title"],
        },
      },
      facts: {
        type: "array",
        items: {
          type: "object",
          properties: {
            scene_ref: { type: "string" },
            kind: { type: "string", enum: [...FACT_KINDS] },
            subject: { type: "string", description: "whose fact it is, by name; omit when it is the narrator's own" },
            text: { type: "string", description: "one line, only what was said" },
            data: { type: "object", description: "optional structure: item, amount_pence, currency, who_paid, venue, rating" },
            confidence: { type: "string", enum: ["stated", "inferred"] },
          },
          required: ["kind", "text"],
        },
      },
      unknown_names: { type: "array", items: { type: "string" }, description: "names mentioned that are not in the known-people list and have not been explained" },
      name_answers: { type: "object", description: "name → who they are, when the narrator explained a name", additionalProperties: { type: "string" } },
      open_thread: { type: "string", description: "at most one unresolved thing worth asking about on a later night; omit otherwise" },
      quotes: {
        type: "array",
        items: { type: "object", properties: { text: { type: "string" }, speaker: { type: "string", description: "omit when the narrator said it" } }, required: ["text"] },
        description: "only words reported as said verbatim by someone",
      },
    },
    required: ["scenes", "facts"],
  },
} as const;

export const EXTRACTION_SYSTEM = [
  "You extract structured facts from a day-log interview, one exchange at a time. You are given the extraction so far, the people already known, and the latest exchange. Return ONLY what the latest exchange adds, via the record_patch tool.",
  "Rules: record only what the narrator said — never world knowledge, never guesses about places or people. A scene is a distinct place-or-activity segment of the day, in the order it happened; reuse an existing scene's ref to add people or detail to it. The narrator (I / me / we) is never listed as a person and is never a fact subject. A fact about another person (a preference, something that happened to them) takes that person's name as subject and kind person_fact unless food, drink or spend fits better. Money goes in a spend fact with data.amount_pence when a figure was given. A first-time event in a relationship or life is a milestone. A name that is not in the known-people list and has not been explained goes in unknown_names; when the narrator explains who someone is, put it in name_answers. Pets are fine as people entries. Use confidence inferred only when you are reading between the lines.",
].join("\n");
