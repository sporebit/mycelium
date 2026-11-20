/** The family page's shapes and its one write helper. */
import type { LogRow, LogSummary } from "@/lib/family/babylog";
import type { ListTotals, MonthMoney } from "@/lib/family/money";
import type { Overview } from "@/lib/family/server";

export type { LogRow, LogSummary, ListTotals, MonthMoney, Overview };
export type FamilyView = { family: Overview | null; candidates?: Array<{ id: string; label: string }> };

export type Entry = {
  id: string;
  kind: "note" | "scan" | "appointment" | "milestone" | "photo" | "letter";
  title: string;
  body: string | null;
  happened_on: string;
  starts_at: string | null;
  place: string | null;
  media_mime: string | null;
  prompt: string | null;
  transcribed: boolean;
  has_media: boolean;
  week: number | null;
  created_by: string | null;
  created_at: string;
};
export type NameRow = { id: string; name: string; note: string | null; votes: Array<{ voter_id: string; vote: number }>; mine: number | null; score: number; everyone: boolean };
export type ListItem = { id: string; list_id: string; title: string; price_pence: number | null; qty: number; bought: boolean; link: string | null; note: string | null };
export type PrepList = { id: string; slug: string; title: string; items: ListItem[]; totals: ListTotals };
export type HouseholdItem = { id: string; kind: "document" | "warranty" | "bin" | "other"; title: string; note: string | null; expires_on: string | null; has_file: boolean; next_on: string | null; schedule: { weekday: number; every_weeks: number; anchor_on: string } | null };
export type CostRow = { id: string; title: string; amount_pence: number; paid_by: string | null; paid_on: string; category: string; recurs: string; note: string | null; /** The monthly bill this row was added from by the tick, when it was. */ recurs_from: string | null };

export const INPUT =
  "min-h-[40px] px-3 rounded-v2-md bg-surface-0 border border-hairline text-text-hi text-sm placeholder:text-text-lo focus:outline-none focus:border-glow transition-colors";
/** A cell edited in place: looks like text until it is focused. */
export const CELL = "w-full min-h-[36px] bg-transparent px-2 text-sm text-text-hi rounded-v2-sm border border-transparent hover:border-hairline focus:border-glow focus:bg-surface-0 focus:outline-none placeholder:text-text-lo";

/** A write to the family API. Throws the server's own sentence, which is written to be read. */
export async function send<T = unknown>(method: "POST" | "PATCH" | "DELETE", path: string, body?: Record<string, unknown> | FormData): Promise<T> {
  const init: RequestInit = { method };
  if (body instanceof FormData) init.body = body;
  else if (body) {
    init.headers = { "content-type": "application/json" };
    init.body = JSON.stringify(body);
  }
  const res = await fetch(path, init);
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? "That did not save. Try again.");
  return json as T;
}

export const dayLabel = (iso: string) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
export const dayLabelYear = (iso: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
export const timeLabel = (iso: string) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" }).format(new Date(iso));
export const whenLabel = (iso: string) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" }).format(new Date(iso));
