/** Convertible record kinds + the table each lives in. */
export type ConvertibleKind =
  | "task"
  | "purchase"
  | "journal"
  | "decision"
  | "note"
  | "capture"
  | "pain_log"
  | "media";

export const CONVERTIBLE_KINDS: readonly ConvertibleKind[] = [
  "task",
  "purchase",
  "journal",
  "decision",
  "note",
  "capture",
  "pain_log",
  "media",
];

export const KIND_LABELS: Record<ConvertibleKind, string> = {
  task: "Task",
  purchase: "Purchase",
  journal: "Journal entry",
  decision: "Decision",
  note: "Note",
  capture: "Capture",
  pain_log: "Pain log",
  media: "Media item",
};

export function kindTable(kind: ConvertibleKind): string {
  switch (kind) {
    case "task":
      return "tasks";
    case "purchase":
      return "purchases";
    case "journal":
      return "journal_entries";
    case "pain_log":
      return "exercise_pain_logs";
    case "media":
      return "media_items";
    case "decision":
    case "note":
    case "capture":
      return "raw_captures";
  }
}

/** Some kinds share a table (decision/note/capture all live in
 *  raw_captures, distinguished by classification.kind). */
export function shareRawCapturesTable(kind: ConvertibleKind): boolean {
  return kind === "decision" || kind === "note" || kind === "capture";
}
