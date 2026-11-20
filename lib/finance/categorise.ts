/**
 * Categorising a payment (master run §10: "silent; only low-confidence ones
 * become swipe cards in the evening close"). Three steps, cheapest first:
 *
 *   1. rules      transfers to the person's own accounts, cash, fees
 *   2. memory     a merchant whose past payments all have one category
 *                 gives the next payment the same one (merchantMemory.ts)
 *   3. the model  everything left, in batches, with a confidence; below
 *                 UNSURE_BELOW the payment is a card in the evening close
 *
 * Runs as the caller against the finance tables, which are theirs alone.
 * The model call goes through the one meter like every other paid call.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createUserClient } from "@/lib/supabase/user";
import { MODEL_FAST } from "@/lib/config/models";
import { buildMemory, type Known, recall, UNSURE_BELOW } from "./merchantMemory";
import { TAXONOMY, type Category, isValidCategory } from "./taxonomy";
import { FEATURE_HEADER } from "@/lib/ai/meterRules";

export { TAXONOMY, type Category, isValidCategory };

const SELF_NAME_PATTERNS = [
  "philip whelan",
  "phil whelan",
  "p whelan",
  "mr p whelan",
  "mr philip whelan",
];

const INTERNAL_DESCRIPTION_PATTERNS = ["revpoints spare change"];

function normaliseText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export type TxnRow = {
  id: string;
  txn_type: string;
  description: string;
  enriched_merchant: string | null;
  amount: number;
};

function applyRules(t: TxnRow): Category | null {
  if (t.txn_type === "Top-up") return "Transfer (internal)";
  if (t.txn_type === "Cash Withdrawal") return "Cash";
  if (t.txn_type === "Fee" || t.txn_type === "Charge") return "Fees & Charges";

  const norm = normaliseText(t.enriched_merchant ?? t.description);
  for (const pat of SELF_NAME_PATTERNS) {
    if (norm.includes(pat)) return "Transfer (internal)";
  }
  for (const pat of INTERNAL_DESCRIPTION_PATTERNS) {
    if (norm.includes(pat)) return "Transfer (internal)";
  }

  return null;
}

const AI_BATCH_SIZE = 40;

/**
 * One batch to the model. Null when the batch could not be asked at all (no
 * key, the cap spent, a bad reply): those payments are left uncategorised
 * for the next run rather than written down as guesses.
 */
async function aiCategorise(
  batch: TxnRow[],
): Promise<Map<string, { category: Category; confidence: number }> | null> {
  const results = new Map<
    string,
    { category: Category; confidence: number }
  >();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("[categorise/ai] ANTHROPIC_API_KEY not set");
    return null;
  }

  const items = batch.map((t) => ({
    id: t.id,
    description: t.enriched_merchant ?? t.description,
    type: t.txn_type,
    amount: t.amount,
  }));

  const systemPrompt =
    "You are a UK personal finance transaction categoriser. Classify each " +
    "transaction into exactly one category from this list: " +
    TAXONOMY.join(" | ") +
    ". Rules: transfers to/from the user's own accounts are already excluded. " +
    "Income = money received from other people or employers. Uncategorised = " +
    'genuinely ambiguous. Reply ONLY with a valid JSON array of objects: ' +
    '[{"id":"uuid","category":"Category Name","confidence":0.95}]. ' +
    "No explanation, no markdown, no wrapper.";

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        [FEATURE_HEADER]: "finance.categorise",
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL_FAST,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: "user", content: JSON.stringify(items) }],
      }),
    });

    if (!res.ok) {
      throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
    }

    const msg = (await res.json()) as {
      content: Array<{ type: string; text?: string }>;
    };

    let text = msg.content[0].type === "text" ? (msg.content[0].text ?? "") : "";
    text = text.replace(/^```json\s*/i, "").replace(/\s*```\s*$/, "");

    const parsed = JSON.parse(text) as Array<{
      id: string;
      category: string;
      confidence: number;
    }>;

    for (const item of parsed) {
      if (isValidCategory(item.category)) {
        results.set(item.id, {
          category: item.category,
          confidence: Math.min(Math.max(item.confidence, 0), 1),
        });
      }
    }
  } catch (err) {
    console.error(
      "[categorise/ai] batch failed, ids:",
      batch.map((t) => t.id),
      err,
    );
    return null;
  }

  return results;
}

/** Every categorised payment the person has, for the merchant memory. Paged: the API returns a thousand rows at a time. */
async function loadKnown(db: SupabaseClient): Promise<Known[]> {
  const out: Known[] = [];
  for (let start = 0; start < 10_000; start += 1000) {
    const { data, error } = await db
      .from("transactions")
      .select("description, enriched_merchant, category, category_source, ai_confidence, category_locked")
      .not("category", "is", null)
      .order("txn_date", { ascending: false })
      .order("id")
      .range(start, start + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as Known[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export type CategoriseSummary = {
  ruleMatched: number;
  /** Placed from the merchant memory: no model, no cost. */
  remembered: number;
  aiCategorised: number;
  /** Of those the model placed, how many it was not sure about: they become cards in the evening close. */
  unsure: number;
  errors: string[];
};

const EMPTY: CategoriseSummary = { ruleMatched: 0, remembered: 0, aiCategorised: 0, unsure: 0, errors: [] };

export async function categorise(
  rows: TxnRow[],
  dryRun = false,
  client?: SupabaseClient,
): Promise<CategoriseSummary> {
  const supabase = client ?? (await createUserClient());
  const ruleResults: { id: string; category: Category }[] = [];
  const candidates: TxnRow[] = [];

  for (const row of rows) {
    const cat = applyRules(row);
    if (cat) {
      ruleResults.push({ id: row.id, category: cat });
    } else {
      candidates.push(row);
    }
  }

  // What is already known about these merchants places most of the rest.
  const memory = buildMemory(await loadKnown(supabase));
  const remembered = recall(memory, candidates);
  const rememberedIds = new Set(remembered.map((r) => r.id));
  const aiCandidates = candidates.filter((t) => !rememberedIds.has(t.id));

  if (dryRun) {
    return {
      ...EMPTY,
      ruleMatched: ruleResults.length,
      remembered: remembered.length,
      aiCategorised: aiCandidates.length,
    };
  }

  const errors: string[] = [];

  for (const r of ruleResults) {
    const { error } = await supabase
      .from("transactions")
      .update({
        category: r.category,
        category_source: "rule",
        ai_confidence: null,
        category_locked: false,
      })
      .eq("id", r.id);
    if (error) errors.push(`rule update ${r.id}: ${error.message}`);
  }

  let rememberedCount = 0;
  for (const r of remembered) {
    const { error } = await supabase
      .from("transactions")
      .update({
        category: r.category,
        category_source: "memory",
        ai_confidence: null,
        category_locked: false,
      })
      .eq("id", r.id);
    if (error) errors.push(`memory update ${r.id}: ${error.message}`);
    else rememberedCount++;
  }

  // Batch AI categorisation
  let aiCount = 0;
  let unsure = 0;
  for (let i = 0; i < aiCandidates.length; i += AI_BATCH_SIZE) {
    const batch = aiCandidates.slice(i, i + AI_BATCH_SIZE);
    const results = await aiCategorise(batch);
    if (!results) {
      // Left as they are: the next import or the next press of the button tries again.
      errors.push(`${batch.length} payments could not be sent to the model and were left for next time`);
      continue;
    }

    for (const t of batch) {
      const result = results.get(t.id);
      const category = result?.category ?? "Uncategorised";
      const confidence = result?.confidence ?? 0.1;

      const { error } = await supabase
        .from("transactions")
        .update({
          category,
          category_source: "ai",
          ai_confidence: Math.round(confidence * 100) / 100,
          category_locked: false,
        })
        .eq("id", t.id);

      if (error) {
        errors.push(`ai update ${t.id}: ${error.message}`);
      } else {
        aiCount++;
        if (confidence < UNSURE_BELOW) unsure++;
      }
    }
  }

  return {
    ruleMatched: ruleResults.length,
    remembered: rememberedCount,
    aiCategorised: aiCount,
    unsure,
    errors,
  };
}

/**
 * The payments not yet categorised, placed without asking: run after an
 * import and once a morning. `limit` keeps a run inside a function's time;
 * what is left waits for the next morning, so a big import is placed over a
 * few days rather than lost.
 */
export async function categoriseNew(db: SupabaseClient, limit = 400): Promise<CategoriseSummary> {
  const { data, error } = await db
    .from("transactions")
    .select("id, txn_type, description, enriched_merchant, amount")
    .is("category", null)
    .eq("category_locked", false)
    .order("txn_date", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return { ...EMPTY };
  return categorise(data as TxnRow[], false, db);
}
