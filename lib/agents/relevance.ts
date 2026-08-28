/**
 * Which of Da Boi's six domains a message actually touches.
 *
 * Da Boi used to inject all six agent memory summaries plus four live-data
 * lookups on every single message, regardless of what was asked. This picks
 * the relevant subset so an "am I on track with my lifts?" question stops
 * carrying this month's spend and the venture summary.
 *
 * Deliberately biased toward over-inclusion: a false positive costs a few
 * hundred tokens, a false negative costs Da Boi the cross-domain awareness
 * that is the whole point of it. A message matching nothing gets everything.
 */

export const DA_BOI_DOMAINS = [
  "fitness",
  "finance",
  "tasks",
  "nutrition",
  "founder",
  "engineer",
] as const;

export type DaBoiDomain = (typeof DA_BOI_DOMAINS)[number];

// Note the trailing \w* / s? on nouns: "squat" must also match "squats", or
// the message falls through to the all-domains fallback and the diet achieves
// nothing. Bare "run"/"running" are deliberately absent — far too common in
// unrelated questions ("can my PC run this game?").
const KEYWORDS: Record<DaBoiDomain, RegExp> = {
  fitness:
    /\b(workouts?|training|train|lift\w*|gym|exercises?|squats?|deadlift\w*|bench|press\w*|rows?|cardio|reps?|sets?|programmes?|programs?|mobility|injur\w*|pain|sore|rest day|pb|personal best|strength|physio|5k|10k|marathon)\b/i,
  finance:
    /\b(spend\w*|spent|money|costs?|budget\w*|invest\w*|savings?|bank\w*|accounts?|transactions?|bills?|subscriptions?|income|salary|tax|pension|isa|portfolio|net worth|afford|prices?|paid|payments?)\b|[£$]/i,
  tasks:
    /\b(tasks?|todos?|to-do|projects?|deadlines?|due|overdue|priorit\w*|admin|captures?|inbox|decisions?|remind\w*|schedul\w*|backlog|this week|this month|today|tomorrow)\b/i,
  nutrition:
    /\b(eat\w*|ate|foods?|meals?|recipes?|cook\w*|calories?|macros?|proteins?|carbs?|fats?|diet|nutrition|hungry|breakfast|lunch|dinner|snacks?|shopping list|gut|bristol|supplements?)\b/i,
  founder:
    /\b(ventures?|business\w*|startups?|start-up|sporebit|myphelium|surprise packs|dropship\w*|revenue|customers?|markets?|pricing|mvp|launch\w*|growth|brand\w*|competitors?|ideas?)\b/i,
  engineer:
    /\b(pc|computer|hardware|cpu|gpu|ram|ssd|drives?|monitors?|display\w*|upgrades?|builds?|windows|drivers?|fps|render\w*|bottleneck\w*|nvidia|amd|ryzen|rtx|benchmark\w*|games?)\b/i,
};

/**
 * Returns the domains relevant to `message`. Never returns an empty set —
 * an unmatched message falls back to every domain.
 */
export function relevantDomains(message: string): Set<DaBoiDomain> {
  const hits = new Set<DaBoiDomain>();
  for (const domain of DA_BOI_DOMAINS) {
    if (KEYWORDS[domain].test(message)) hits.add(domain);
  }
  if (hits.size === 0) return new Set(DA_BOI_DOMAINS);
  return hits;
}
