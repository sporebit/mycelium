/**
 * Tickets — context suggestions for Clarify (spec §8.1, §8.4).
 *
 * Capture writes Claude's guesses into `tickets.suggested`; tickets that
 * predate that (or came from the classic UI) get a cheap heuristic here so
 * the Clarify card always has something to accept or adjust. Isomorphic:
 * no I/O, safe on the client.
 */
import type { TimeWindow, WhereCtx } from "./categories";

export type Suggestion = {
  where_ctx?: WhereCtx;
  tools?: string[];
  time_window?: TimeWindow;
  points?: number;
  kind?: "task" | "reminder";
  project_id?: string | null;
  scheduled_on?: string | null;
  deadline_on?: string | null;
  /** Which rules fired — shown as the "why" on the card. */
  reasons: string[];
};

type Rule = {
  re: RegExp;
  apply: (s: Suggestion) => void;
  why: string;
};

const RULES: Rule[] = [
  {
    re: /\b(call|ring|phone|chase|speak to|ask)\b/i,
    apply: (s) => {
      s.tools = ["phone"];
      s.time_window = "office_hours";
      s.points = s.points ?? 1;
    },
    why: "a call → phone, office hours",
  },
  {
    re: /\b(book|appointment|mot|dentist|doctor|gp|renew|insurance|cancel subscription|dvla)\b/i,
    apply: (s) => {
      s.tools = s.tools ?? ["phone"];
      s.time_window = s.time_window ?? "office_hours";
      s.points = s.points ?? 2;
    },
    why: "an appointment or admin → office hours",
  },
  {
    re: /\b(buy|order|purchase|return|refund|amazon|ebay)\b/i,
    apply: (s) => {
      s.tools = ["phone", "pc"];
      s.points = s.points ?? 1;
    },
    why: "a purchase → phone or PC",
  },
  {
    re: /\b(pc|computer|desktop|laptop|monitor|install|configure|deploy|migrate|build|code|refactor|fix bug|api|db|migration|next\.js|supabase|vercel)\b/i,
    apply: (s) => {
      s.where_ctx = "home";
      s.tools = ["pc"];
      s.points = s.points ?? 3;
    },
    why: "computer work → home, PC",
  },
  {
    re: /\b(garden|mow|hedge|fence|shed|bedding|hoover|vacuum|laundry|washing|clean|tidy|bins?|declutter|paint|drill|fix the|repair)\b/i,
    apply: (s) => {
      s.where_ctx = "home";
      s.tools = ["none"];
      s.points = s.points ?? 2;
    },
    why: "housework → home, no tools",
  },
  {
    re: /\b(drive|drop off|pick up|collect|take .* to|post office|tip|recycling centre|shop for|shopping)\b/i,
    apply: (s) => {
      s.where_ctx = "out";
      s.tools = ["car"];
      s.points = s.points ?? 2;
    },
    why: "an errand → out, car",
  },
  {
    re: /\b(gym|run|workout|session|training)\b/i,
    apply: (s) => {
      s.points = s.points ?? 3;
    },
    why: "training → a few points",
  },
  {
    re: /\b(remind me|reminder|at \d{1,2}(:\d{2})?\s?(am|pm)?)\b/i,
    apply: (s) => {
      s.kind = "reminder";
    },
    why: "has a time → reminder",
  },
  {
    re: /\b(evening|tonight|after work)\b/i,
    apply: (s) => {
      s.time_window = "evenings";
    },
    why: "evening wording",
  },
  {
    re: /\b(weekend|saturday|sunday)\b/i,
    apply: (s) => {
      s.time_window = "weekend";
    },
    why: "weekend wording",
  },
];

const KEY_RE = /\b([A-Z][A-Z0-9]{1,4})-\d+\b/;

export function suggestContexts(
  title: string,
  description?: string | null,
  projectsByPrefixOrName?: Array<{ id: string; name: string; prefix?: string | null }>,
): Suggestion {
  const text = `${title} ${description ?? ""}`;
  const s: Suggestion = { reasons: [] };
  for (const r of RULES) {
    if (r.re.test(text)) {
      r.apply(s);
      s.reasons.push(r.why);
    }
  }
  if (projectsByPrefixOrName?.length) {
    const key = KEY_RE.exec(text)?.[1];
    const hit =
      projectsByPrefixOrName.find((p) => key && p.prefix && p.prefix === key) ??
      projectsByPrefixOrName.find(
        (p) => p.name.length >= 3 && new RegExp(`\\b${escapeRe(p.name)}\\b`, "i").test(text),
      );
    if (hit) {
      s.project_id = hit.id;
      s.reasons.push(`mentions ${hit.name}`);
    }
  }
  return s;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Merge a stored capture suggestion (wins) over the heuristic. */
export function mergeSuggestions(
  stored: Record<string, unknown> | null | undefined,
  heuristic: Suggestion,
): Suggestion {
  if (!stored) return heuristic;
  const out: Suggestion = { ...heuristic, reasons: [...heuristic.reasons] };
  const take = <K extends keyof Suggestion>(k: K) => {
    const v = stored[k as string];
    if (v !== undefined && v !== null) {
      (out as Record<string, unknown>)[k as string] = v;
    }
  };
  take("where_ctx");
  take("tools");
  take("time_window");
  take("points");
  take("kind");
  take("project_id");
  take("scheduled_on");
  take("deadline_on");
  if (Object.keys(stored).length > 0) out.reasons.unshift("Claude's guess at capture");
  return out;
}
