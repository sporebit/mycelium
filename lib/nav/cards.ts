import type { DraggableCard } from "@/components/dashboard/DraggableCardGrid";
import { SECTIONS } from "./sections";

/**
 * One line per page, keyed by href, for the boxes on a section's home page.
 * The pages themselves come from SECTIONS, so a page added to the sidebar
 * gets a box without anyone editing the section page; the test insists it
 * also gets a line here.
 */
export const PAGE_BLURBS: Record<string, string> = {
  // Work
  "/work": "Your issues: what is in progress, what is due, what is waiting.",
  "/work/issues": "Every issue, filtered and searched; saved filters and JQL.",
  "/work/projects": "Projects grouped by category, each with its board.",
  "/docs": "Pages and specs that belong to the work.",
  "/work/notifications": "The inbox behind the bell: mentions, assignments, changes.",
  "/work/workflows": "The statuses and the moves between them, per space.",
  "/organisation/tickets/templates": "Ticket templates for things done the same way each time.",
  "/organisation/tickets/review": "The weekly look back over what moved and what stuck.",
  // Organisation
  "/organisation/captures": "Raw voice and text input before it's routed.",
  "/organisation/people": "Rolodex of mentions, captures, and shared context.",
  "/organisation/calendar": "Your days and events, with what is planned around them.",
  "/family": "The family space: one timeline, the baby log, prep lists, letters, household admin.",
  "/organisation/decisions": "Choices you logged so you can find them later.",
  "/organisation/ideas": "Things you might build, make or try — captured before they fade.",
  "/organisation/purchases": "Shopping list, wishlist, and bills tracked together.",
  "/organisation/habits": "Daily practices — streaks and history.",
  "/organisation/media": "Watch, listen, and read lists with status and ratings.",
  "/organisation/quotes": "Things people said — attributed, researched, merch-flagged.",
  "/organisation/gifts": "Gift ideas by person and by occasion, with a reminder before the day.",
  "/organisation/hours": "The four-day-week tracker: hours logged, the balance, the history.",
  "/journal": "The day log: one page per day, written as it happens.",
  "/reminders": "Things to be reminded of, at a time or in a place.",
  "/organisation/captures/review": "Triage queue for ambiguous captures.",
  "/organisation/receipts": "Receipts photographed and filed, with what was bought.",
  "/organisation/assistant": "Ask across everything you have captured and recorded.",
  // Fitness
  "/fitness": "Current session, planned workouts, quick log.",
  "/fitness/workouts": "Workout templates: the sessions you repeat.",
  "/fitness/exercises": "The exercise library, with history per movement.",
  "/fitness/programmes": "Training plan templates and phase definitions.",
  "/fitness/history": "Past sessions and per-exercise progression.",
  "/fitness/body": "Weight, measurements, and body composition over time.",
  "/fitness/coach": "The fitness agent, with your training as its context.",
  "/fitness/calendar": "Month view of every completed and planned session.",
  "/fitness/phases": "Long-arc periodisation: bulks, cuts, maintenance.",
  // Health
  "/health/nutrition": "Daily macros, meal groups, barcode scan, foods library.",
  "/health/supplements": "Active supplement stack with one-tap dose logging.",
  "/health/gut-health": "Bristol Scale daily log with 30-day overview strip.",
  "/health/blood-tests": "Markers, ranges, and trends across sessions.",
  "/health/recipes": "Recipe library with vision scan, meal planner, and shopping lists.",
  "/health/recipes/gousto": "The Gousto cookbook: search, favourites, synced weekly from the PC.",
  "/health/shopping-lists": "Shareable lists with voice capture and Telegram sync.",
  "/health/eye-prescription": "Eye prescriptions and contact lens history.",
  "/health/pain": "Pain logs over time: standalone entries and session notes.",
  // Finance
  "/finance/spending": "Import bank CSVs, view transactions, categorise.",
  "/finance/analysis": "Category breakdowns, monthly trends, daily averages.",
  "/finance/bills": "What leaves on a rhythm: bills, subscriptions, price rises.",
  "/finance/budget": "What each month is meant to cost, against what has gone.",
  "/finance/investments": "Holdings, contributions and value over time.",
  "/finance/accounts": "Every account and its balance; feeds and imports.",
  "/finance/snapshot": "Net worth, accounts, recent movement.",
  "/finance/advisor": "The finance agent, with your transactions as its context.",
  // Studio
  "/studio": "Music, media, hardware, and creative tools.",
  "/studio/spotify": "Listening stats, top tracks, play history.",
  "/studio/finds": "Things found and saved: links, images and references, by source.",
  "/studio/pc": "The PC build: parts, prices, and the state of the machine.",
  // Ventures
  "/ventures": "Every active venture with its next move.",
  "/ventures/tree": "Every venture as a tree: ideas, active, closed.",
  "/ventures/inspiration": "References and sparks for ventures.",
  "/ventures/ads": "Ad experiments and their results.",
  // Drops
  "/drops/calendar": "Upcoming drops on a calendar.",
  "/drops/wishlist": "What you want from the drops.",
  "/drops/raffles": "Raffles entered and their outcomes.",
  "/drops/cook-guides": "Guides for bots and cook groups.",
  "/drops/monitor": "Stock monitors and alerts.",
  // The Boys
  "/the-boys/da_boi": "The main agent: talk, ask, delegate.",
  "/the-boys/ask": "Ask any of the Boys a question.",
  "/the-boys/rules": "The rules the agents follow.",
  "/the-boys/entity-rules": "How captures become people, places and things.",
  "/the-boys/integrations": "Shortcuts, Telegram and the other doors in.",
  // Other
  "/other/settings": "Appearance, voices, models, integrations.",
  "/other/settings/security": "Sign-in, the authenticator, sessions and API tokens.",
  "/other/settings/people": "Who is in the space and what they may see.",
  "/other/settings/teams": "Teams and their spaces.",
  "/other/export": "Everything you own, as a download.",
  "/other/api-usage": "What the AI calls cost, by feature.",
};

function keyFor(base: string, href: string): string {
  const rel = href.startsWith(base + "/") ? href.slice(base.length + 1) : href.replace(/^\//, "");
  return rel.replace(/[/-]/g, "_");
}

/**
 * The boxes for a section's home page: one per sub-page in SECTIONS, in the
 * sidebar's order. A `custom` card with the same href replaces the derived one
 * (keeping its key, so a saved card order still applies, and its live detail);
 * custom cards for pages outside the sidebar are appended. `omit` skips pages
 * the home shows some other way (a live card in the grid's suffix). The
 * section's own base route is the page being looked at, so it is left out
 * unless `includeBase` is set.
 */
export function sectionCards(
  sectionKey: string,
  opts: { custom?: DraggableCard[]; omit?: string[]; includeBase?: boolean } = {},
): DraggableCard[] {
  const section = SECTIONS.find((s) => s.key === sectionKey);
  if (!section) throw new Error(`unknown section ${sectionKey}`);
  const custom = opts.custom ?? [];
  const omit = new Set(opts.omit ?? []);
  const used = new Set<string>();
  const cards: DraggableCard[] = [];
  for (const sp of section.subPages) {
    if (omit.has(sp.href)) continue;
    if (sp.href === section.baseRoute && !opts.includeBase) continue;
    const own = custom.find((c) => c.href === sp.href);
    if (own) {
      used.add(own.href);
      cards.push(own);
      continue;
    }
    cards.push({
      key: keyFor(section.baseRoute, sp.href),
      label: sp.label,
      href: sp.href,
      description: PAGE_BLURBS[sp.href] ?? "",
    });
  }
  for (const c of custom) if (!used.has(c.href)) cards.push(c);
  return cards;
}
