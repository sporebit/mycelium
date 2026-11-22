/** The family page's tabs. Not in the client component: the server page reads this list too. */
export const FAMILY_TABS = ["timeline", "calendar", "baby", "names", "lists", "letters", "home", "budget"] as const;
export type FamilyTab = (typeof FAMILY_TABS)[number];
export const isFamilyTab = (v: unknown): v is FamilyTab => typeof v === "string" && (FAMILY_TABS as readonly string[]).includes(v);
