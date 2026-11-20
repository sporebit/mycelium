/**
 * What the wall draws (master run §11). One shape for the family board, one
 * for a person's view, one for the things to say. Nothing here can carry a
 * money figure: there is no finance field, and the unit test
 * (lib/wall/finance.test.ts) keeps finance code out of lib/wall and
 * app/api/wall altogether.
 */
import type { HomeData } from "@/lib/home/contract";

export type WallPerson = {
  id: string;
  name: string;
  /** A PIN is set, so the switcher offers their view. */
  can_unlock: boolean;
  /** Today in numbers only; titles wait for the unlock. Null when they have no plan yet today. */
  today: { planned: number; finished: number; left: number; minutes_left: number } | null;
  /** The week as fill: one entry a day, Monday first; -1 marks a day not yet come. */
  week: number[];
  /** Minutes still to do this week against the hours target; null when hours are not tracked. */
  hours_left: number | null;
};

export type WallEvent = { id: string; title: string; starts_at: string; place: string | null; when: string };

export type WallFamily = {
  /** "Baby in 42 days" / "Week 34" / "Ada is 6 weeks" — whichever is true; null before the family is set up. */
  countdown: string | null;
  upcoming: WallEvent[];
  /** The baby log's last line, if there is one today. */
  baby_line: string | null;
};

export type WallGlance = {
  /** Which wall this is, for the unlock cookie. */
  device: { id: string; label: string };
  day_label: string;
  drawn_at: string;
  people: WallPerson[];
  family: WallFamily | null;
  weather: { hi: number; lo: number; conditions: string; code: number } | null;
  bins: { date: string; label: string; days: number } | null;
};

export type WallPersonView = {
  person: { id: string; name: string };
  /** Until when the unlock holds, epoch ms. */
  until: number;
  home: HomeData | null;
};

export type WallSaying = { id: string; text: string };

export type WallPhoto = { id: string; url: string; title: string | null; taken: string | null };

/** Words no key in anything the wall is given may contain. The unit test checks this file's keys; the e2e spec walks the live JSON. */
export const FINANCE_WORDS = ["finance", "budget", "transaction", "balance", "spend", "bill", "subscription", "amount", "pence", "merchant"] as const;
