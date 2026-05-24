// Single-letter codes for table names embedded in Telegram callback_data.
// Telegram caps callback_data at 64 bytes; full table names (e.g.
// "journal_entries" = 15 chars) plus a UUID + action + urgency tip over
// that limit. These codes keep callback_data well under 50 bytes.
//
// Keys here are the actual `routedTo` values emitted by writeCapture:
// "tasks", "raw_captures", "journal_entries". Notes / decisions / captures
// all share the "raw_captures" route, so they share the 'r' code.
export const ROUTE_CODE = {
  tasks: "t",
  raw_captures: "r",
  journal_entries: "j",
} as const;

export type RoutedTo = keyof typeof ROUTE_CODE;

export const ROUTE_FROM_CODE: Record<string, RoutedTo> = {
  t: "tasks",
  r: "raw_captures",
  j: "journal_entries",
};

export function encodeRoute(routedTo: string): string {
  return (ROUTE_CODE as Record<string, string>)[routedTo] ?? routedTo;
}

export function decodeRoute(code: string): RoutedTo | null {
  return ROUTE_FROM_CODE[code] ?? null;
}
