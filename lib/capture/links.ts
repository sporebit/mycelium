/**
 * Where a capture went, as a link.
 *
 * `raw_captures.routed_to` holds the name of the table the capture was filed
 * into. The two screens that show "routed to" each had their own map, keyed
 * on names that were never stored ("tasks", "task", "media", "journal"), so
 * a capture that became a ticket showed no way to open it. One map, keyed
 * on the real table names. Isomorphic: no I/O.
 */

export type RoutedLink = { href: string; label: string };

export function routedLink(routedTo: string | null | undefined, routedId: string | null | undefined): RoutedLink | null {
  if (!routedTo || !routedId) return null;
  switch (routedTo) {
    case "tickets":
      return { href: `/work/browse/${routedId}`, label: "Ticket" };
    case "purchases":
      return { href: `/organisation/purchases?focus=${routedId}`, label: "Purchase" };
    case "media_items":
      return { href: `/organisation/media?focus=${routedId}`, label: "Media" };
    case "quotes":
      return { href: `/organisation/quotes?focus=${routedId}`, label: "Quote" };
    case "gifts":
      return { href: `/organisation/gifts?focus=${routedId}`, label: "Gift idea" };
    case "accounts":
      return { href: `/draft/accounts`, label: "Account" };
    case "daylog_days":
      return { href: `/journal`, label: "Day log" };
    case "exercise_pain_logs":
      return { href: `/health/pain`, label: "Pain log" };
    case "people":
      return { href: `/organisation/people/${routedId}`, label: "Person" };
    case "body_metrics":
      return { href: `/fitness/body`, label: "Body" };
    case "family_entries":
      return { href: `/family`, label: "Family timeline" };
    // A note, a decision, an idea or an item still held: the capture is the thing itself.
    case "raw_captures":
    default:
      return null;
  }
}
