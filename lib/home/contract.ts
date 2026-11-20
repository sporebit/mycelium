/**
 * The Home data contract (claude/ui-direction.md, build notes): one shape
 * that every Home view is fed. A view is a component that draws this and
 * nothing else; it never fetches for itself. Adding a view later means
 * writing a component and registering it (lib/home/registry.ts), not
 * touching the data.
 *
 * Everything optional is null when the app has nothing true to say: a view
 * leaves the figure out rather than drawing sample data.
 */
import type { TodayView } from "@/lib/daily/view";

export type HomeItem = {
  item_id: string;
  ticket_id: string;
  key: string | null;
  title: string;
  /** The title cut for a small figure. */
  short: string;
  /** Where it grows: the project or section name; null when it has none. */
  section: string | null;
  first_step: string;
  minutes: number;
  is_win: boolean;
  /** open: not started. started: its countdown is running or was. done: finished today. */
  state: "open" | "started" | "done";
  /** Stable per item: the same item always grows the same specimen. */
  seed: number;
};

export type HomeWeekDay = {
  /** ISO date. */
  date: string;
  /** "Mon" … "Sun". */
  label: string;
  /** Things finished that day. */
  done: number;
  is_today: boolean;
  is_future: boolean;
};

export type HomeHours = {
  /** Minutes banked this week, and the week's target. */
  banked: number;
  target: number;
  /** Minutes still to do this week; 0 when the target is met. */
  left: number;
  /** One plain line under the ruler. */
  note: string;
};

export type HomeData = {
  /** ISO date, London. */
  day: string;
  /** "Friday 20 November". */
  day_label: string;
  /** "05:31": when this was drawn. */
  drawn_at: string;
  who: { id: string; name: string };
  /** The day itself: the same shape the phone's focus card and the prompts read. */
  today: TodayView;
  /** Today's items in order, finished ones included, so a view can colour them in. */
  items: HomeItem[];
  week: { days: HomeWeekDay[]; count: number };
  /** Everything ever finished, and the month it started ("May 2026"); null before the first. */
  lifetime: { count: number; since: string | null };
  hours: HomeHours | null;
  /** Captures waiting for tonight's review. */
  captures_waiting: number;
  /** Features gone quiet, biggest gap first (lib/dormant). */
  quiet: Array<{ href: string; label: string; how_long: string }>;
  /** Not built yet (family, finds, another person's nudges): null until they are. */
  family: null;
  finds: null;
  nudges: Array<{ from: string; at: string; text: string }>;
};
