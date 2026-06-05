export type CaptureKind =
  | "task"
  | "note"
  | "decision"
  | "journal"
  | "capture"
  | "workout"
  | "purchase"
  | "pain_log"
  | "reminder";
export type CaptureUrgency = "today" | "this_week" | "this_month" | "someday";
export type CaptureMood =
  | "energised"
  | "calm"
  | "anxious"
  | "frustrated"
  | "reflective"
  | "grateful"
  | "tired"
  | "neutral";

export type ClassificationMention = {
  raw: string;
  name_hint: string;
};

export type PainRegion = string;
export type PainFeel =
  | "great"
  | "good"
  | "ok"
  | "mild"
  | "moderate"
  | "painful"
  | "stopped";

/** Standalone pain capture details. Only meaningful when
 *  kind === "pain_log". */
export type PainDetails = {
  pain_regions: PainRegion[];
  severity: number | null;
  feel_rating: PainFeel | null;
};

export type PurchaseWantOrNeed = "want" | "need" | "unclear";

export type PurchaseListType = "shopping" | "wishlist";

/** Purchase-specific fields the classifier extracts in the same pass as
 *  kind/title/urgency. Only meaningful when kind === 'purchase'; for
 *  every other kind this stays null so downstream code can branch on
 *  the kind alone. */
export type PurchaseDetails = {
  amount: number | null;
  currency: string;
  want_or_need: PurchaseWantOrNeed;
  /** 'shopping' = active to-buy list (default). 'wishlist' = aspirational
   *  list with no immediate intent to purchase. The classifier upgrades
   *  to 'wishlist' on explicit signals like "add to wishlist" or "want
   *  someday". */
  list_type: PurchaseListType;
};

export type ReminderDetails = {
  reminder_message: string;
  time: string | null;
  date: string | null;
  relative_minutes: number | null;
  recurrence: string | null;
};

export type ContextEnergy = "low" | "medium" | "high";

export type Classification = {
  kind: CaptureKind;
  urgency: CaptureUrgency;
  key: boolean;
  entity_name: string | null;
  tags: string[];
  summary: string;
  title: string;
  mood: CaptureMood | null; // only meaningful for journal entries
  mentions: ClassificationMention[];
  purchase: PurchaseDetails | null; // only meaningful for purchases
  pain: PainDetails | null; // only meaningful for pain_log
  reminder: ReminderDetails | null; // only meaningful for reminder
  /** Context fields — applies to every kind. The classifier sets them
   *  when they're clear from the text, otherwise leaves them null so
   *  the post-create suggester can fill in from history. */
  context_where: string | null;
  context_device: string | null;
  context_energy: ContextEnergy | null;
  context_tag: string | null;
};

export type ClassifyResult = {
  classification: Classification;
  llm_source: "anthropic" | "openai" | "regex";
};

const KINDS: readonly CaptureKind[] = [
  "task",
  "note",
  "decision",
  "journal",
  "capture",
  "workout",
  "purchase",
  "pain_log",
  "reminder",
];

const PAIN_FEEL_RATINGS: readonly PainFeel[] = [
  "great",
  "good",
  "ok",
  "mild",
  "moderate",
  "painful",
  "stopped",
];

const PURCHASE_WANT_OR_NEED: readonly PurchaseWantOrNeed[] = [
  "want",
  "need",
  "unclear",
];

const PURCHASE_LIST_TYPES: readonly PurchaseListType[] = [
  "shopping",
  "wishlist",
];
const URGENCIES: readonly CaptureUrgency[] = [
  "today",
  "this_week",
  "this_month",
  "someday",
];
const CONTEXT_ENERGIES: readonly ContextEnergy[] = ["low", "medium", "high"];
const MOODS: readonly CaptureMood[] = [
  "energised",
  "calm",
  "anxious",
  "frustrated",
  "reflective",
  "grateful",
  "tired",
  "neutral",
];

/** Base prompt. The user's enabled capture routing rules are
 *  prepended at call time via buildCaptureRulesBlock — they override
 *  the static defaults below when they conflict. Exported for use by
 *  the rules tester endpoint (POST /api/routing-rules/test) which
 *  needs to render the prompt the LLM actually sees. */
export const CLASSIFIER_SYSTEM_PROMPT = `You classify short personal capture messages into structured JSON.

Rules:
- "kind" is one of: task, note, decision, journal, capture, workout, purchase, pain_log, reminder.
  - task = an action the user needs to DO (not buy), with NO explicit time/date trigger.
  - reminder = the user explicitly wants to be reminded at a specific time or after a delay. Signals: "remind me", "set a reminder", "in 30 minutes", "at 8pm", "every day at", "tomorrow at". If there's a concrete time/date/delay attached to a task-like request, classify as reminder, not task.
  - decision = a choice the user wants to record.
  - note = a fact or piece of info to remember.
  - journal = reflection, feeling, or observation about themselves or their day; longer-form expressive content; the kind of thing they'd want to re-read in a year.
  - workout = a description of exercise the user just did, is doing, or is reporting on. Signals: set/rep patterns ("5x5", "3 sets of 8"), weights in kg/lbs ("80kg", "100lbs"), named exercises (bench press, squat, deadlift, RDL, lunges, etc.), cardio terms ("ran 5km", "10 mins on treadmill"), pain or feel words paired with body parts ("shoulder twinged", "left knee sore", "felt pumped"), session-shaped sentences ("did push day", "morning workout", "just finished legs").
  - purchase = the user wants to BUY, pay for, order, or acquire something — physical goods, services, bills, subscriptions. Classify by intent, not by specific trigger words. Examples: "buy milk", "pay the electric bill", "order a new keyboard", "I need to get a birthday card for mum", "pick up some protein powder", "renew the netflix sub". When in doubt and there's money or goods involved, prefer purchase over task: "book a dentist appointment" is a task (an action to perform), "buy a mouthguard" is a purchase (an item to acquire).
  - pain_log = a standalone report of body pain or discomfort that is NOT part of a workout session report. Signals: "my knee hurts", "shoulder pain", "back is sore", "lower back twinging today", "tweaked my wrist". Distinguishing from workout: there are no sets/reps/exercises being reported. Distinguishing from journal: pain_log is specifically about a body region + sensation, not broad reflection on how the day went.
  - capture = catch-all when none of the above clearly applies.

Heuristics for journal (guidance, not strict):
  - First-person reflection ("I felt", "today was", "I've been thinking").
  - Sensory or experiential detail.
  - Emotional content.
  - Over ~30 words of expressive content tends toward journal unless it's clearly a task list.

Heuristics for workout (guidance):
  - Concrete numbers (weights, reps, sets, distances, durations) about physical training.
  - Body part + sensation, e.g. "left knee twinged on lunges, about a 5".
  - Past-tense reporting of physical activity ("did", "just finished", "hit", "got through").
  - Pure reflection about a workout WITHOUT concrete logging data ("the gym was hard today and I felt drained") is still journal, not workout.

Examples:
  - "Remind me to call Sarah tomorrow" -> reminder (reminder.reminder_message: "call Sarah", reminder.date: "tomorrow", reminder.time: null)
  - "Remind me at 23:12 to turn the boiler off" -> reminder (reminder.reminder_message: "turn the boiler off", reminder.time: "23:12", reminder.date: "today")
  - "In 30 minutes remind me to check the oven" -> reminder (reminder.reminder_message: "check the oven", reminder.relative_minutes: 30)
  - "Every day at 8pm remind me to take my meds" -> reminder (reminder.reminder_message: "take my meds", reminder.time: "20:00", reminder.recurrence: "daily")
  - "Set a reminder for Friday at 3pm to call the dentist" -> reminder (reminder.reminder_message: "call the dentist", reminder.date: "friday", reminder.time: "15:00")
  - "File the taxes by end of month" -> task (no explicit time trigger, just a deadline)
  - "We decided to go with the React 19 upgrade after all" -> decision
  - "Stoic gym this morning was brutal but I noticed I'm finally enjoying the back-squat day. Body's adapting." -> journal
  - "Beautiful walk through Sandall Park, the geese are back" -> journal
  - "Need to remember Dad's birthday is on the 14th" -> note
  - "Did push day. Bench 80kg 5x5, OHP 50kg 3x8, dips bodyweight 3x10. Left shoulder twinged on the last set, about a 5." -> workout
  - "Ran 5km, felt good, around 28 minutes" -> workout
  - "Buy milk on the way home" -> purchase
  - "Need to pay the electric bill, about £85" -> purchase (amount: 85, currency: GBP, want_or_need: need)
  - "Thinking of getting that new Keychron keyboard, like £160" -> purchase (amount: 160, currency: GBP, want_or_need: want)
  - "Pick up a birthday card for mum" -> purchase
  - "Order more protein powder, we're running out" -> purchase (want_or_need: need)
  - "Add the Sony WH-1000XM5 to my wishlist, like £350" -> purchase (list_type: wishlist, amount: 350)
  - "Wishlist: leather jacket, eventually" -> purchase (list_type: wishlist, want_or_need: want)
  - "My left knee is sore today, about a 4" -> pain_log (pain_regions: ["left_knee"], severity: 4, feel_rating: "moderate")
  - "Shoulder pain again, just a niggle" -> pain_log (pain_regions: ["other"], severity: null, feel_rating: "mild")
  - "Lower back twinged when I bent over, like a 6" -> pain_log (pain_regions: ["lower_back"], severity: 6, feel_rating: "moderate")

Other fields:
- "urgency" is one of: today, this_week, this_month, someday. For journal entries this is unused — pick "someday".
- "key" is true if the item is critical or important, otherwise false. False for journal entries unless emphatic.
- "entity_name" is the single person or organisation mentioned, or null. (For purchases this is usually the vendor/brand if explicit, e.g. "Netflix", otherwise null.)
- "tags" is an array of short lowercase tag strings (may be empty).
- "summary" is one short sentence summarising the message. For journal entries keep it under 40 characters — a glanceable one-liner.
- "title" is a 3-7 word title (use even for non-tasks). For purchases the title should be the THING being acquired (e.g. "milk", "Keychron keyboard", "electric bill"), not the sentence verb.
- "mood" is ONLY set for journal entries, otherwise null. One of: energised, calm, anxious, frustrated, reflective, grateful, tired, neutral.
- "mentions" is an array of person mentions detected in the text. Each entry: { "raw": <exact substring>, "name_hint": <normalised name> }.
  Detect: first names ("Luke", "Sarah"), relationship references ("Mum", "Dad", "my brother" → name_hint "Mum"/"Dad"/etc), first + last ("Luke Henderson").
  Skip: company/brand names, place names, bare pronouns, generic roles ("the doctor") unless capitalised or named.
  Output [] if none.
- "context_where" / "context_device" / "context_energy" / "context_tag" — extract these when clear from the text, otherwise null. Don't force-classify.
    context_where: free-form location ("home", "office", "mobile", "gym"). Pick the bare slug, not a phrase.
    context_device: which device the task needs ("pc", "phone", "tablet", "none" for physical-world tasks).
    context_energy: "low" | "medium" | "high" — the energy/focus level the task needs.
    context_tag: a workflow tag — "focused" for deep work; "errand" for picking-things-up; "call" for phone calls; "admin" for paperwork / forms / bills; "creative" for making; "physical" for body / movement.
    Examples:
      "Update direct debit on Netflix" → context_where='home', context_device='pc', context_tag='admin'
      "Call dentist tomorrow" → context_tag='call', context_device='phone'
      "Pick up milk on way home" → context_where='mobile', context_tag='errand'
      "Write project proposal" → context_tag='focused', context_device='pc', context_energy='high'
- "pain" is an object ONLY when kind = "pain_log"; null for every other kind. Shape:
    { "pain_regions": [<snake_case region>...], "severity": <0..10 or null>, "feel_rating": "great" | "good" | "ok" | "mild" | "moderate" | "painful" | "stopped" | null }
    Pain regions vocabulary (snake_case, exactly these or close variants):
      left_shoulder right_shoulder left_scapula right_scapula left_elbow right_elbow left_wrist right_wrist left_forearm right_forearm left_bicep right_bicep left_trap right_trap lower_back upper_back both_knees left_knee right_knee left_ankle right_ankle it_band hamstring hip_flexor core neck other
    feel_rating maps from severity words: twinge/tight → mild; ache/sore → moderate; sharp/stabbing/hurt → painful; "had to stop" → stopped.
- "purchase" is an object ONLY when kind = "purchase"; null for every other kind. Shape:
    { "amount": <number or null>, "currency": <ISO code string, default "GBP">, "want_or_need": "want" | "need" | "unclear", "list_type": "shopping" | "wishlist" }
    - amount: parse digits in £/$/€ context, "£85" → 85, "85 quid" → 85, "around 35" → 35. Null if not stated.
    - currency: infer from symbol (£ → GBP, $ → USD, € → EUR). Default GBP.
    - want_or_need: "need" for "need / must / have to / running out / out of / it's overdue". "want" for "want / would like / thinking about / fancy". "unclear" if ambiguous.
    - list_type: "wishlist" only when the user explicitly signals it — phrases like "add to wishlist", "on my wishlist", "wishlist", "want someday", "for the wishlist", "would love eventually", or aspirational language with no near-term intent. Everything else (including "want", "fancy", "thinking about") stays "shopping" because shopping is the active to-buy list and wishlist is the aspirational set-aside.

- "reminder" is an object ONLY when kind = "reminder"; null for every other kind. Shape:
    { "reminder_message": <string>, "time": <HH:MM 24h or null>, "date": <"today" | "tomorrow" | day-of-week | ISO date | null>, "relative_minutes": <number or null>, "recurrence": <"daily" | "weekly" | "monthly" | null> }
    - reminder_message: the actual thing to be reminded about, stripped of "remind me to" framing.
    - time: 24-hour HH:MM format if a specific time is given. "8pm" → "20:00", "11:30am" → "11:30". Null if only relative.
    - date: "today" (default if only a time is given), "tomorrow", a day name ("friday"), or ISO date. Null if only relative_minutes.
    - relative_minutes: set when the user says "in X minutes/hours". "in 30 minutes" → 30, "in 2 hours" → 120. Null when an absolute time is given.
    - recurrence: "daily", "weekly", or "monthly" if the user says "every day", "every week", etc. Null for one-shot reminders.

Respond ONLY with a single JSON object matching this schema. No markdown, no preface.`;

function validate(obj: unknown): Classification | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;

  const kind = o.kind;
  if (typeof kind !== "string" || !KINDS.includes(kind as CaptureKind))
    return null;

  const urgency = o.urgency;
  if (
    typeof urgency !== "string" ||
    !URGENCIES.includes(urgency as CaptureUrgency)
  ) {
    return null;
  }

  if (typeof o.key !== "boolean") return null;

  const entity_name = o.entity_name;
  if (entity_name !== null && typeof entity_name !== "string") return null;

  const tags = o.tags;
  if (!Array.isArray(tags) || tags.some((t) => typeof t !== "string"))
    return null;

  if (typeof o.summary !== "string" || typeof o.title !== "string")
    return null;

  // mood is optional; accept null, undefined, or a known string.
  let mood: CaptureMood | null = null;
  if (o.mood !== undefined && o.mood !== null) {
    if (typeof o.mood !== "string") return null;
    if (!MOODS.includes(o.mood as CaptureMood)) return null;
    mood = o.mood as CaptureMood;
  }

  // mentions are optional — older prompts won't return them. Coerce to [].
  const mentions: ClassificationMention[] = [];
  if (Array.isArray(o.mentions)) {
    for (const m of o.mentions as unknown[]) {
      if (!m || typeof m !== "object") continue;
      const mo = m as Record<string, unknown>;
      const raw = typeof mo.raw === "string" ? mo.raw.trim() : "";
      const hint =
        typeof mo.name_hint === "string" ? mo.name_hint.trim() : raw;
      if (!raw || !hint) continue;
      mentions.push({ raw, name_hint: hint });
    }
  }

  // purchase is only meaningful when kind === 'purchase'. We accept null /
  // undefined for other kinds and coerce to null. For purchases we try to
  // read the object even if some fields are missing — defaults fill the
  // rest.
  let purchase: PurchaseDetails | null = null;
  if (kind === "purchase") {
    const p = (o.purchase as Record<string, unknown> | null | undefined) ?? {};
    const amountRaw = (p as Record<string, unknown>).amount;
    const amount =
      typeof amountRaw === "number" && Number.isFinite(amountRaw)
        ? amountRaw
        : null;
    const currencyRaw = (p as Record<string, unknown>).currency;
    const currency =
      typeof currencyRaw === "string" && currencyRaw.trim()
        ? currencyRaw.trim().toUpperCase()
        : "GBP";
    const wonRaw = (p as Record<string, unknown>).want_or_need;
    const want_or_need: PurchaseWantOrNeed = PURCHASE_WANT_OR_NEED.includes(
      wonRaw as PurchaseWantOrNeed,
    )
      ? (wonRaw as PurchaseWantOrNeed)
      : "unclear";
    const ltRaw = (p as Record<string, unknown>).list_type;
    const list_type: PurchaseListType = PURCHASE_LIST_TYPES.includes(
      ltRaw as PurchaseListType,
    )
      ? (ltRaw as PurchaseListType)
      : "shopping";
    purchase = { amount, currency, want_or_need, list_type };
  }

  // pain is only meaningful for kind === 'pain_log'. Same permissive
  // parsing as purchase — accept partials and fill defaults.
  let pain: PainDetails | null = null;
  if (kind === "pain_log") {
    const p = (o.pain as Record<string, unknown> | null | undefined) ?? {};
    const regionsRaw = (p as Record<string, unknown>).pain_regions;
    const pain_regions = Array.isArray(regionsRaw)
      ? (regionsRaw as unknown[])
          .map((r) => (typeof r === "string" ? r.trim() : ""))
          .filter((r): r is string => !!r)
      : [];
    const sevRaw = (p as Record<string, unknown>).severity;
    let severity: number | null = null;
    if (typeof sevRaw === "number" && Number.isFinite(sevRaw)) {
      severity = Math.max(0, Math.min(10, Math.round(sevRaw)));
    }
    const feelRaw = (p as Record<string, unknown>).feel_rating;
    const feel_rating: PainFeel | null = PAIN_FEEL_RATINGS.includes(
      feelRaw as PainFeel,
    )
      ? (feelRaw as PainFeel)
      : null;
    pain = { pain_regions, severity, feel_rating };
  }

  // reminder is only meaningful for kind === 'reminder'.
  let reminder: ReminderDetails | null = null;
  if (kind === "reminder") {
    const r = (o.reminder as Record<string, unknown> | null | undefined) ?? {};
    const rm = typeof r.reminder_message === "string" ? r.reminder_message.trim() : "";
    const time = typeof r.time === "string" && r.time.trim() ? r.time.trim() : null;
    const date = typeof r.date === "string" && r.date.trim() ? r.date.trim() : null;
    const relRaw = r.relative_minutes;
    const relative_minutes =
      typeof relRaw === "number" && Number.isFinite(relRaw) && relRaw > 0
        ? Math.round(relRaw)
        : null;
    const recRaw = r.recurrence;
    const recurrence =
      typeof recRaw === "string" && ["daily", "weekly", "monthly"].includes(recRaw)
        ? recRaw
        : null;
    reminder = { reminder_message: rm, time, date, relative_minutes, recurrence };
  }

  // Context fields are optional on every kind. Permissively read each one;
  // anything unusable (wrong type, non-whitelisted energy) falls back to null.
  const context_where =
    typeof o.context_where === "string" && o.context_where.trim()
      ? o.context_where.trim()
      : null;
  const context_device =
    typeof o.context_device === "string" && o.context_device.trim()
      ? o.context_device.trim()
      : null;
  const context_energy: ContextEnergy | null = CONTEXT_ENERGIES.includes(
    o.context_energy as ContextEnergy,
  )
    ? (o.context_energy as ContextEnergy)
    : null;
  const context_tag =
    typeof o.context_tag === "string" && o.context_tag.trim()
      ? o.context_tag.trim()
      : null;

  return {
    kind: kind as CaptureKind,
    urgency: urgency as CaptureUrgency,
    key: o.key,
    entity_name: entity_name as string | null,
    tags: tags as string[],
    summary: o.summary,
    title: o.title,
    mood,
    mentions,
    purchase,
    pain,
    reminder,
    context_where,
    context_device,
    context_energy,
    context_tag,
  };
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function classifyAnthropic(
  text: string,
  systemPrompt: string,
): Promise<Classification | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.ANTHROPIC_MODEL;
  if (!apiKey || !model) return null;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 512,
      system: systemPrompt,
      messages: [{ role: "user", content: text }],
    }),
  });

  if (!res.ok) return null;
  const json = (await res.json()) as {
    content?: { type: string; text?: string }[];
  };
  const block = json.content?.find((c) => c.type === "text");
  const raw = block?.text;
  if (!raw) return null;

  return validate(extractJson(raw));
}

async function classifyOpenAI(
  text: string,
  systemPrompt: string,
): Promise<Classification | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_CLASSIFIER_MODEL;
  if (!apiKey || !model) return null;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text },
      ],
    }),
  });

  if (!res.ok) return null;
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const raw = json.choices?.[0]?.message?.content;
  if (!raw) return null;

  return validate(extractJson(raw));
}

function extractPurchaseFromText(text: string): PurchaseDetails {
  const lower = text.toLowerCase();
  // Amount: try "£12", "$12", "€12", "12 quid", "12 pounds", "12 bucks",
  // or a bare number after "around / about / roughly / like".
  let amount: number | null = null;
  let currency = "GBP";
  const symbolMatch = text.match(/([£$€])\s*(\d+(?:\.\d+)?)/);
  if (symbolMatch) {
    amount = Number(symbolMatch[2]);
    const sym = symbolMatch[1];
    currency = sym === "$" ? "USD" : sym === "€" ? "EUR" : "GBP";
  } else {
    const wordMatch = lower.match(
      /\b(\d+(?:\.\d+)?)\s*(quid|pounds|bucks|gbp|usd|eur)\b/,
    );
    if (wordMatch) {
      amount = Number(wordMatch[1]);
      const u = wordMatch[2];
      currency =
        u === "bucks" || u === "usd" ? "USD" : u === "eur" ? "EUR" : "GBP";
    } else {
      const roughMatch = lower.match(
        /\b(?:around|about|roughly|like|approx(?:imately)?)\s+(\d+(?:\.\d+)?)\b/,
      );
      if (roughMatch) amount = Number(roughMatch[1]);
    }
  }

  let want_or_need: PurchaseWantOrNeed = "unclear";
  if (
    /\b(need|must|have to|running out|out of|overdue|essentials?)\b/.test(lower)
  ) {
    want_or_need = "need";
  } else if (
    /\b(want|would like|fancy|thinking about|thinking of|considering)\b/.test(
      lower,
    )
  ) {
    want_or_need = "want";
  }
  // Wishlist needs an explicit signal — never inferred from "want" alone.
  const list_type: PurchaseListType =
    /\b(wish ?list|on my wish|want someday|would love eventually|for the wish ?list|aspirational)\b/.test(
      lower,
    )
      ? "wishlist"
      : "shopping";
  return { amount, currency, want_or_need, list_type };
}

function extractPainFromText(text: string): PainDetails {
  const lower = text.toLowerCase();
  const regions: string[] = [];
  const regionMap: Array<[RegExp, string]> = [
    [/\bleft knee\b/, "left_knee"],
    [/\bright knee\b/, "right_knee"],
    [/\bboth knees\b/, "both_knees"],
    [/\bknees?\b/, "left_knee"],
    [/\bleft shoulder\b/, "left_shoulder"],
    [/\bright shoulder\b/, "right_shoulder"],
    [/\bshoulder\b/, "other"],
    [/\blower back\b/, "lower_back"],
    [/\bupper back\b/, "upper_back"],
    [/\bback\b/, "lower_back"],
    [/\bleft elbow\b/, "left_elbow"],
    [/\bright elbow\b/, "right_elbow"],
    [/\bleft wrist\b/, "left_wrist"],
    [/\bright wrist\b/, "right_wrist"],
    [/\bneck\b/, "neck"],
    [/\bhip\b/, "hip_flexor"],
    [/\bhamstring\b/, "hamstring"],
    [/\bit band\b/, "it_band"],
    [/\bleft ankle\b/, "left_ankle"],
    [/\bright ankle\b/, "right_ankle"],
    [/\bankle\b/, "other"],
  ];
  for (const [re, region] of regionMap) {
    if (re.test(lower) && !regions.includes(region)) {
      regions.push(region);
      break;
    }
  }
  let severity: number | null = null;
  const sevMatch = lower.match(/\b(?:about|like|around)?\s*(?:a\s+)?(\d{1,2})(?:\/10)?\b/);
  if (sevMatch) {
    const n = Number(sevMatch[1]);
    if (n >= 0 && n <= 10) severity = n;
  }
  let feel_rating: PainFeel | null = null;
  if (/\b(stopped|had to stop)\b/.test(lower)) feel_rating = "stopped";
  else if (/\b(sharp|stab|stabbing|searing|hurt)\b/.test(lower)) feel_rating = "painful";
  else if (/\b(ache|aching|sore|hurts)\b/.test(lower)) feel_rating = "moderate";
  else if (/\b(twinge|twinged|tight|stiff|niggle)\b/.test(lower)) feel_rating = "mild";
  return { pain_regions: regions, severity, feel_rating };
}

function classifyRegex(text: string): Classification {
  const lower = text.toLowerCase();
  const wordCount = text.trim().split(/\s+/).length;
  const hasReminderWords =
    /\b(remind me|set a reminder|reminder for|in \d+ minutes?|in \d+ hours?|at \d{1,2}:\d{2}|at \d{1,2}\s*[ap]m)\b/i.test(lower);
  const hasTaskWords =
    /\b(todo|task|need to|must|deadline|due)\b/.test(lower);
  const firstPerson =
    /\b(i|i'm|i've|i'll|today|felt|feeling|noticed)\b/.test(lower);
  const reflective =
    /\b(beautiful|amazing|lovely|grateful|tired|frustrated|reflect|walk|morning|evening|noticed|the geese|sky|weather|sunset|sunrise|loved|enjoyed|brutal|peaceful)\b/.test(
      lower
    );

  // Pain signals — body region + sensation, no exercise/sets/reps.
  const painSignals =
    /\b(hurts|sore|painful|aching|ache|twinged|tight|stiff|niggle|pain)\b/.test(
      lower,
    ) &&
    /\b(knee|shoulder|back|neck|elbow|wrist|hip|hamstring|ankle|forearm|bicep|trap|it band|scapula)\b/.test(
      lower,
    );

  // Order matters: note / decision win over task when both could apply
  // (so "need to remember Dad's birthday" lands as note, not task).
  const workoutSignals =
    /\b(\d+\s*x\s*\d+|\d+\s*(sets?|reps?)\b|\d+\s*(kg|lbs?|pounds))\b/i.test(text) ||
    /\b(bench|squat|deadlift|press|curl|row|pull[- ]?up|push[- ]?up|lunge|rdl|ohp|bss|emom|dips|cardio|treadmill)\b/i.test(
      lower
    ) ||
    /\b(ran|jogged|hiked|walked)\s+\d+\s*(k|km|mile)/i.test(lower) ||
    /\b(push day|pull day|leg day|workout|gym session|squat day|bench day)\b/i.test(
      lower
    );

  // Purchase signals — acquisition verbs + a few "bill / sub" nouns.
  // Workout signals take precedence (we don't want "ran for milk" to
  // classify as purchase if it's actually about exercise), but purchase
  // beats task because "buy X" is more specific than "remind me".
  const purchaseSignals =
    /\b(buy|bought|purchase|order|pay for|paying for|pick up|grab|get|need to get|gotta get)\b/.test(
      lower,
    ) ||
    /\b(bill|subscription|sub|renew|top up|topup|restock)\b/.test(lower);

  let kind: CaptureKind = "capture";
  if (/\b(decided|decision|chose|choosing)\b/.test(lower)) {
    kind = "decision";
  } else if (/\b(idea|thought|remember)\b/.test(lower)) {
    kind = "note";
  } else if (workoutSignals) {
    kind = "workout";
  } else if (painSignals) {
    kind = "pain_log";
  } else if (purchaseSignals) {
    kind = "purchase";
  } else if (hasReminderWords) {
    kind = "reminder";
  } else if (hasTaskWords) {
    kind = "task";
  } else if (
    (reflective && !hasTaskWords) ||
    (firstPerson && wordCount > 25)
  ) {
    kind = "journal";
  }

  let urgency: CaptureUrgency = "someday";
  if (/\btoday\b|\btonight\b|\bnow\b/.test(lower)) urgency = "today";
  else if (/\bthis week\b|\btomorrow\b/.test(lower)) urgency = "this_week";
  else if (/\bthis month\b/.test(lower)) urgency = "this_month";

  const key = /\b(urgent|important|critical|asap)\b/.test(lower);

  const firstLine = text.split(/\n/)[0]?.trim() ?? text.trim();
  const title = firstLine.split(/\s+/).slice(0, 7).join(" ").slice(0, 80);
  const summary =
    kind === "journal" ? firstLine.slice(0, 40) : firstLine.slice(0, 140);

  const ctx = extractContextFromText(text);

  return {
    kind,
    urgency,
    key,
    entity_name: null,
    tags: [],
    summary,
    title: title || "Capture",
    mood: null,
    mentions: [],
    purchase: kind === "purchase" ? extractPurchaseFromText(text) : null,
    pain: kind === "pain_log" ? extractPainFromText(text) : null,
    reminder: kind === "reminder" ? extractReminderFromText(text) : null,
    context_where: ctx.where,
    context_device: ctx.device,
    context_energy: ctx.energy,
    context_tag: ctx.tag,
  };
}

function extractReminderFromText(text: string): ReminderDetails {
  const lower = text.toLowerCase();

  // Strip "remind me to" / "set a reminder to/for" framing
  let msg = text
    .replace(/^remind me\s+(to\s+)?/i, "")
    .replace(/^set a reminder\s+(to|for)\s+/i, "")
    .replace(/\s+at\s+\d{1,2}(:\d{2})?\s*([ap]m)?/i, "")
    .replace(/\s+in\s+\d+\s*(minutes?|hours?|mins?|hrs?)/i, "")
    .replace(/\s*(tomorrow|today|tonight)\s*/i, "")
    .trim();
  if (!msg) msg = text.trim();

  // Time: "at 23:12", "at 8pm", "at 11:30am"
  let time: string | null = null;
  const timeMatch = lower.match(/at\s+(\d{1,2})(?::(\d{2}))?\s*([ap]m)?/);
  if (timeMatch) {
    let h = parseInt(timeMatch[1]);
    const m = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
    const ampm = timeMatch[3];
    if (ampm === "pm" && h < 12) h += 12;
    if (ampm === "am" && h === 12) h = 0;
    time = `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
  }

  // Relative: "in 30 minutes", "in 2 hours"
  let relative_minutes: number | null = null;
  const relMatch = lower.match(/in\s+(\d+)\s*(minutes?|mins?|hours?|hrs?)/);
  if (relMatch) {
    const n = parseInt(relMatch[1]);
    const unit = relMatch[2];
    relative_minutes = /hours?|hrs?/.test(unit) ? n * 60 : n;
  }

  // Date
  let date: string | null = null;
  if (/\btomorrow\b/.test(lower)) date = "tomorrow";
  else if (/\btonight\b|\btoday\b/.test(lower)) date = "today";
  else if (time && !relative_minutes) date = "today";

  // Recurrence
  let recurrence: string | null = null;
  if (/\bevery\s+day\b|\bdaily\b/.test(lower)) recurrence = "daily";
  else if (/\bevery\s+week\b|\bweekly\b/.test(lower)) recurrence = "weekly";
  else if (/\bevery\s+month\b|\bmonthly\b/.test(lower)) recurrence = "monthly";

  return { reminder_message: msg, time, date, relative_minutes, recurrence };
}

/**
 * Cheap regex-driven context extraction used by the fallback classifier.
 * Each field stays null unless there's a clear signal — leaving the
 * post-create suggester room to fill in from history.
 */
function extractContextFromText(text: string): {
  where: string | null;
  device: string | null;
  energy: ContextEnergy | null;
  tag: string | null;
} {
  const lower = text.toLowerCase();
  let where: string | null = null;
  if (/\bat (?:the )?gym\b|\bworkout\b/.test(lower)) where = "gym";
  else if (/\bat (?:the )?office\b|\bin the office\b/.test(lower)) where = "office";
  else if (/\bat home\b|\bhouse\b/.test(lower)) where = "home";
  else if (/\bon (?:the |my )?way\b|\bout and about\b|\berrand\b/.test(lower)) where = "mobile";

  let device: string | null = null;
  if (/\bcall\b|\bphone\b/.test(lower)) device = "phone";
  else if (/\bemail\b|\bwrite\b|\bspreadsheet\b|\binvoice\b|\bdirect debit\b/.test(lower)) device = "pc";

  let tag: string | null = null;
  if (/\bcall\b|\bdial\b|\bring\b/.test(lower)) tag = "call";
  else if (/\bpick up\b|\bgrab\b|\bbuy\b|\bcollect\b/.test(lower)) tag = "errand";
  else if (/\bbill\b|\bdirect debit\b|\binvoice\b|\btax\b|\badmin\b|\bpaperwork\b/.test(lower)) tag = "admin";
  else if (/\bwrite\b|\bdraft\b|\bproposal\b|\bdesign\b|\bdeep work\b|\bfocus\b/.test(lower)) tag = "focused";
  else if (/\bsketch\b|\bcreative\b|\bidea\b/.test(lower)) tag = "creative";

  let energy: ContextEnergy | null = null;
  if (/\bdeep\b|\bhigh energy\b|\bfresh\b/.test(lower)) energy = "high";
  else if (/\btired\b|\blow energy\b|\bquick\b/.test(lower)) energy = "low";

  return { where, device, energy, tag };
}

/** Build the system prompt the LLM sees: user-defined capture rules
 *  block first (if any), then the static base. Exported so the test
 *  endpoint can render the exact prompt for diagnostics. */
export async function buildClassifierSystemPrompt(
  userId?: string,
): Promise<string> {
  if (!userId) return CLASSIFIER_SYSTEM_PROMPT;
  // Lazy import to avoid a hard dependency cycle with lib/router/rules
  // (rules.ts pulls supabase server, which can pull this file via the
  // writeCapture chain during test imports).
  const { buildCaptureRulesBlock } = await import("./rules");
  const rulesBlock = await buildCaptureRulesBlock(userId);
  return rulesBlock
    ? `${rulesBlock}\n\n${CLASSIFIER_SYSTEM_PROMPT}`
    : CLASSIFIER_SYSTEM_PROMPT;
}

export async function classifyCapture(
  text: string,
  /** Pulls user-defined capture rules into the system prompt.
   *  Optional — without a user id the classifier falls back to the
   *  base prompt, so legacy/test call sites keep working. */
  userId?: string,
): Promise<ClassifyResult> {
  const systemPrompt = await buildClassifierSystemPrompt(userId);

  try {
    const anthropic = await classifyAnthropic(text, systemPrompt);
    if (anthropic) return { classification: anthropic, llm_source: "anthropic" };
  } catch (err) {
    console.error("[classifier] anthropic error:", err);
  }

  try {
    const openai = await classifyOpenAI(text, systemPrompt);
    if (openai) return { classification: openai, llm_source: "openai" };
  } catch (err) {
    console.error("[classifier] openai error:", err);
  }

  return { classification: classifyRegex(text), llm_source: "regex" };
}
