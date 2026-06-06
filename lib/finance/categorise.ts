import { createServerClient } from "@/lib/supabase/server";

export const TAXONOMY = [
  "Groceries",
  "Eating Out / Takeaway",
  "Fuel",
  "Transport",
  "Shopping",
  "Subscriptions & Software",
  "Bills & Utilities",
  "Housing",
  "Health & Fitness",
  "Entertainment",
  "Travel / Holidays",
  "Cash",
  "Income",
  "Fees & Charges",
  "Transfer (internal)",
  "Uncategorised",
] as const;

export type Category = (typeof TAXONOMY)[number];

const TAXONOMY_SET = new Set<string>(TAXONOMY);

export function isValidCategory(v: string): v is Category {
  return TAXONOMY_SET.has(v);
}

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

type TxnRow = {
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

async function aiCategorise(
  batch: TxnRow[],
): Promise<Map<string, { category: Category; confidence: number }>> {
  const results = new Map<
    string,
    { category: Category; confidence: number }
  >();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("[categorise/ai] ANTHROPIC_API_KEY not set");
    return results;
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
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
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
  }

  return results;
}

export type CategoriseSummary = {
  ruleMatched: number;
  aiCategorised: number;
  errors: string[];
};

export async function categorise(
  rows: TxnRow[],
  dryRun = false,
): Promise<CategoriseSummary> {
  const supabase = createServerClient();
  const ruleResults: { id: string; category: Category }[] = [];
  const aiCandidates: TxnRow[] = [];

  for (const row of rows) {
    const cat = applyRules(row);
    if (cat) {
      ruleResults.push({ id: row.id, category: cat });
    } else {
      aiCandidates.push(row);
    }
  }

  if (dryRun) {
    return {
      ruleMatched: ruleResults.length,
      aiCategorised: aiCandidates.length,
      errors: [],
    };
  }

  const errors: string[] = [];

  // Write rule-matched rows
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

  // Batch AI categorisation
  let aiCount = 0;
  for (let i = 0; i < aiCandidates.length; i += AI_BATCH_SIZE) {
    const batch = aiCandidates.slice(i, i + AI_BATCH_SIZE);
    const results = await aiCategorise(batch);

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
      }
    }
  }

  return {
    ruleMatched: ruleResults.length,
    aiCategorised: aiCount,
    errors,
  };
}
