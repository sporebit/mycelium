/**
 * Day log Part C — a person's days (spec §5 `/api/people/[id]/days`, §6 Days
 * tab, decision 19). The shaping is pure so it can be tested without a
 * database: the route fetches approved rows, this turns them into the four
 * things the tab shows. Only reviewed rows ever get here (decision 17).
 */

export type PersonSceneIn = { id: string; day: string; position: number; title: string; place_id: string | null; place_text: string | null; place_name: string | null; narrative: string | null };
export type PersonFactIn = { id: string; day: string; scene_id: string | null; kind: string; subject_person_id: string | null; text: string; data: Record<string, unknown> | null };

export type TimelineEntry = { scene_id: string; day: string; title: string; place: string | null; place_id: string | null; line: string | null };
export type PersonFact = { id: string; day: string; kind: string; text: string };
export type PlaceTogether = { key: string; place: string; place_id: string | null; days: number; last_day: string; shared: PersonFact[] };
export type PersonDays = { timeline: TimelineEntry[]; facts: PersonFact[]; places: PlaceTogether[]; milestones: PersonFact[] };

const SHARED_KINDS = new Set(["food", "drink", "spend"]);
const firstLine = (s: string | null): string | null => (s ? s.split("\n")[0].trim() || null : null);
const byDayDesc = <T extends { day: string }>(a: T, b: T) => b.day.localeCompare(a.day);

/**
 * `scenes` are the scenes the person was in; `facts` are every approved fact
 * that is either about them (subject) or sits in one of those scenes.
 */
export function buildPersonDays(personId: string, scenes: PersonSceneIn[], facts: PersonFactIn[]): PersonDays {
  const sceneById = new Map(scenes.map((s) => [s.id, s]));
  const slim = (f: PersonFactIn): PersonFact => ({ id: f.id, day: f.day, kind: f.kind, text: f.text });

  const timeline: TimelineEntry[] = [...scenes]
    .sort((a, b) => b.day.localeCompare(a.day) || a.position - b.position)
    .map((s) => ({ scene_id: s.id, day: s.day, title: s.title, place: s.place_name ?? s.place_text, place_id: s.place_id, line: firstLine(s.narrative) }));

  // facts + preferences: what is on their record, milestones listed separately
  const about = facts.filter((f) => f.subject_person_id === personId);
  const personFacts = about.filter((f) => f.kind !== "milestone").sort(byDayDesc).map(slim);

  // milestones: theirs, or ones that happened in a scene they were part of
  const milestones = facts
    .filter((f) => f.kind === "milestone" && (f.subject_person_id === personId || (f.scene_id !== null && sceneById.has(f.scene_id))))
    .sort(byDayDesc)
    .map(slim);

  // places + food together: grouped by place; a linked place and its spoken name are one group
  const groups = new Map<string, { place: string; place_id: string | null; days: Set<string>; shared: PersonFactIn[] }>();
  for (const s of scenes) {
    const label = s.place_name ?? s.place_text;
    if (!label) continue;
    const key = s.place_id ?? `text:${label.trim().toLowerCase()}`;
    const g = groups.get(key) ?? { place: label, place_id: s.place_id, days: new Set<string>(), shared: [] };
    g.days.add(s.day);
    groups.set(key, g);
  }
  for (const f of facts) {
    if (!f.scene_id || !SHARED_KINDS.has(f.kind)) continue;
    const s = sceneById.get(f.scene_id);
    const label = s ? (s.place_name ?? s.place_text) : null;
    if (!s || !label) continue;
    groups.get(s.place_id ?? `text:${label.trim().toLowerCase()}`)?.shared.push(f);
  }
  const places: PlaceTogether[] = Array.from(groups, ([key, g]) => {
    const days = Array.from(g.days).sort();
    return { key, place: g.place, place_id: g.place_id, days: days.length, last_day: days[days.length - 1], shared: g.shared.sort(byDayDesc).map(slim) };
  }).sort((a, b) => b.days - a.days || b.last_day.localeCompare(a.last_day));

  return { timeline, facts: personFacts, places, milestones };
}
