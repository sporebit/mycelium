import { createServerClient } from "@/lib/supabase/server";
import { dedupHash } from "./csv-parser";

type Supabase = ReturnType<typeof createServerClient>;

export type MatchRunResult = {
  auto_matched: number;
  ambiguous: number;
  pending: number;
  standalone_corrected: number;
};

export type MatchStatusCounts = {
  matched: number;
  ambiguous: number;
  pending: number;
  standalone: number;
};

export type MatchCandidate = {
  id: string;
  description: string;
  amount: number;
  txn_date: string;
  account_label: string | null;
  account_type: string;
};

export type AmbiguousPayment = {
  id: string;
  transaction_id: string;
  merchant_name: string | null;
  amount: number;
  paypal_date: string;
  currency: string;
  funding_type: string | null;
  candidates: MatchCandidate[];
};

// ── Internal types ──

type DbPayment = {
  id: string;
  transaction_id: string;
  paypal_date: string;
  merchant_name: string | null;
  amount: number;
  currency: string;
  funding_type: string | null;
  funded: boolean;
};

type DbCandidate = {
  id: string;
  amount: number;
  txn_date: string;
  description: string;
  bank_accounts: { account_type: string; label: string | null } | null;
};

// ── Helpers ──

const DAY_MS = 24 * 60 * 60 * 1000;

function absAmt(n: number): number {
  return Math.round(Math.abs(n) * 100) / 100;
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a + "T00:00:00Z").getTime();
  const db = new Date(b + "T00:00:00Z").getTime();
  return Math.abs(da - db) / DAY_MS;
}

function findCandidates(
  payDate: string,
  payAmount: number,
  pool: DbCandidate[],
  excluded: Set<string>,
): DbCandidate[] {
  const target = absAmt(payAmount);
  return pool.filter((c) => {
    if (excluded.has(c.id)) return false;
    if (absAmt(Number(c.amount)) !== target) return false;
    return daysBetween(payDate, c.txn_date) <= 3;
  });
}

function sortByAccountPreference(
  cands: DbCandidate[],
  fundingType: string | null,
): DbCandidate[] {
  const preferred = fundingType === "card" ? "credit_card" : "current";
  return [...cands].sort((a, b) => {
    const aT = a.bank_accounts?.account_type ?? "";
    const bT = b.bank_accounts?.account_type ?? "";
    return (aT === preferred ? 0 : 1) - (bT === preferred ? 0 : 1);
  });
}

async function fetchPool(supabase: Supabase, uid: string): Promise<DbCandidate[]> {
  const { data: claimed } = await supabase
    .from("paypal_payments")
    .select("matched_transaction_id")
    .eq("user_id", uid)
    .eq("match_status", "matched")
    .not("matched_transaction_id", "is", null);

  const claimedIds = new Set(
    (claimed ?? []).map((r: Record<string, unknown>) => r.matched_transaction_id as string),
  );

  const { data } = await supabase
    .from("transactions")
    .select("id, amount, txn_date, description, bank_accounts(account_type, label)")
    .eq("user_id", uid)
    .ilike("description", "%PAYPAL%")
    .is("enriched_merchant", null);

  // Supabase returns bank_accounts as array without generated types; normalise to single object
  const rows = (data ?? []).map((r: Record<string, unknown>) => {
    const ba = r.bank_accounts;
    return {
      id: r.id as string,
      amount: Number(r.amount),
      txn_date: r.txn_date as string,
      description: r.description as string,
      bank_accounts: (Array.isArray(ba) ? ba[0] ?? null : ba) as DbCandidate["bank_accounts"],
    };
  });
  return rows.filter((t) => !claimedIds.has(t.id));
}

// ── Main matcher ──

export async function runPayPalMatcher(
  supabase: Supabase,
  uid: string,
): Promise<MatchRunResult> {
  const result: MatchRunResult = {
    auto_matched: 0,
    ambiguous: 0,
    pending: 0,
    standalone_corrected: 0,
  };

  // Reset ambiguous → pending (and clear their enrichment) for re-evaluation
  const { data: prevAmbiguous } = await supabase
    .from("paypal_payments")
    .select("matched_transaction_id")
    .eq("user_id", uid)
    .eq("match_status", "ambiguous")
    .not("matched_transaction_id", "is", null);

  if (prevAmbiguous && prevAmbiguous.length > 0) {
    const ids = prevAmbiguous.map((r) => r.matched_transaction_id as string);
    await supabase
      .from("transactions")
      .update({ enriched_merchant: null, enrichment_source: null })
      .in("id", ids);
  }

  await supabase
    .from("paypal_payments")
    .update({ match_status: "pending", matched_transaction_id: null })
    .eq("user_id", uid)
    .eq("match_status", "ambiguous");

  // ── Phase 1: funded payment matching ──

  const { data: pending } = await supabase
    .from("paypal_payments")
    .select("id, transaction_id, paypal_date, merchant_name, amount, currency, funding_type, funded")
    .eq("user_id", uid)
    .eq("match_status", "pending")
    .order("paypal_date", { ascending: true });

  if (pending && pending.length > 0) {
    const pool = await fetchPool(supabase, uid);
    const claimed = new Set<string>();

    // Pre-compute candidate sets for contention detection
    type Tentative = { payment: DbPayment; candidates: DbCandidate[] };
    const tentatives: Tentative[] = [];

    for (const p of pending as DbPayment[]) {
      if (p.currency !== "GBP") {
        tentatives.push({ payment: p, candidates: [] });
      } else {
        tentatives.push({
          payment: p,
          candidates: findCandidates(p.paypal_date, Number(p.amount), pool, new Set()),
        });
      }
    }

    // Detect contention: same candidate is sole match for 2+ payments
    const soleCandOwners = new Map<string, string[]>();
    for (const t of tentatives) {
      if (t.candidates.length === 1) {
        const cid = t.candidates[0].id;
        const owners = soleCandOwners.get(cid) ?? [];
        owners.push(t.payment.id);
        soleCandOwners.set(cid, owners);
      }
    }
    const contentionIds = new Set<string>();
    for (const [, owners] of soleCandOwners) {
      if (owners.length > 1) {
        for (const pid of owners) contentionIds.add(pid);
      }
    }

    // Process in order
    for (const t of tentatives) {
      const { payment } = t;

      if (payment.currency !== "GBP") {
        await supabase
          .from("paypal_payments")
          .update({ match_status: "ambiguous" })
          .eq("id", payment.id);
        result.ambiguous++;
        continue;
      }

      if (contentionIds.has(payment.id)) {
        await supabase
          .from("paypal_payments")
          .update({ match_status: "ambiguous" })
          .eq("id", payment.id);
        result.ambiguous++;
        continue;
      }

      const available = t.candidates.filter((c) => !claimed.has(c.id));

      if (available.length === 0) {
        result.pending++;
        continue;
      }

      if (available.length === 1) {
        const cand = available[0];
        claimed.add(cand.id);

        await supabase
          .from("transactions")
          .update({ enriched_merchant: payment.merchant_name, enrichment_source: "paypal" })
          .eq("id", cand.id);

        await supabase
          .from("paypal_payments")
          .update({ match_status: "matched", matched_transaction_id: cand.id })
          .eq("id", payment.id);

        result.auto_matched++;
      } else {
        await supabase
          .from("paypal_payments")
          .update({ match_status: "ambiguous" })
          .eq("id", payment.id);
        result.ambiguous++;
      }
    }
  }

  // ── Phase 2: standalone safety net ──

  const { data: standalones } = await supabase
    .from("paypal_payments")
    .select("id, transaction_id, paypal_date, merchant_name, amount, currency")
    .eq("user_id", uid)
    .eq("match_status", "standalone")
    .order("paypal_date", { ascending: true });

  if (standalones && standalones.length > 0) {
    const pool = await fetchPool(supabase, uid);
    const claimed = new Set<string>();

    for (const p of standalones) {
      if (p.currency !== "GBP") continue;

      const cands = findCandidates(p.paypal_date, Number(p.amount), pool, claimed);

      if (cands.length === 1) {
        const cand = cands[0];
        claimed.add(cand.id);

        const hash = await dedupHash("PayPal", "PAYPAL", p.transaction_id);
        await supabase
          .from("transactions")
          .delete()
          .eq("user_id", uid)
          .eq("dedup_hash", hash);

        await supabase
          .from("transactions")
          .update({ enriched_merchant: p.merchant_name, enrichment_source: "paypal" })
          .eq("id", cand.id);

        await supabase
          .from("paypal_payments")
          .update({ match_status: "matched", matched_transaction_id: cand.id })
          .eq("id", p.id);

        result.standalone_corrected++;
      } else if (cands.length > 1) {
        await supabase
          .from("paypal_payments")
          .update({ match_status: "ambiguous" })
          .eq("id", p.id);
        result.ambiguous++;
      }
    }
  }

  return result;
}

// ── Status counts ──

export async function getMatchCounts(
  supabase: Supabase,
  uid: string,
): Promise<MatchStatusCounts> {
  const { data } = await supabase
    .from("paypal_payments")
    .select("match_status")
    .eq("user_id", uid);

  const counts: MatchStatusCounts = { matched: 0, ambiguous: 0, pending: 0, standalone: 0 };
  for (const row of (data ?? []) as { match_status: string }[]) {
    const s = row.match_status as keyof MatchStatusCounts;
    if (s in counts) counts[s]++;
  }
  return counts;
}

// ── Ambiguous payments with candidates ──

export async function getAmbiguousPayments(
  supabase: Supabase,
  uid: string,
): Promise<AmbiguousPayment[]> {
  const { data: payments } = await supabase
    .from("paypal_payments")
    .select("id, transaction_id, paypal_date, merchant_name, amount, currency, funding_type")
    .eq("user_id", uid)
    .eq("match_status", "ambiguous")
    .order("paypal_date", { ascending: true });

  if (!payments || payments.length === 0) return [];

  const pool = await fetchPool(supabase, uid);

  return (payments as Array<{
    id: string;
    transaction_id: string;
    paypal_date: string;
    merchant_name: string | null;
    amount: number;
    currency: string;
    funding_type: string | null;
  }>).map((p) => {
    let cands: DbCandidate[];
    if (p.currency !== "GBP") {
      const payDate = p.paypal_date;
      cands = pool.filter((c) => daysBetween(payDate, c.txn_date) <= 3);
    } else {
      cands = findCandidates(p.paypal_date, Number(p.amount), pool, new Set());
    }

    cands = sortByAccountPreference(cands, p.funding_type);

    return {
      id: p.id,
      transaction_id: p.transaction_id,
      merchant_name: p.merchant_name,
      amount: Number(p.amount),
      paypal_date: p.paypal_date,
      currency: p.currency,
      funding_type: p.funding_type,
      candidates: cands.map((c) => ({
        id: c.id,
        description: c.description,
        amount: Number(c.amount),
        txn_date: c.txn_date,
        account_label: c.bank_accounts?.label ?? null,
        account_type: c.bank_accounts?.account_type ?? "",
      })),
    };
  });
}

// ── Manual resolution ──

export async function resolvePayment(
  supabase: Supabase,
  uid: string,
  paymentId: string,
  transactionId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { data: payment } = await supabase
    .from("paypal_payments")
    .select("id, merchant_name, match_status, funded, transaction_id")
    .eq("id", paymentId)
    .eq("user_id", uid)
    .single();

  if (!payment) return { ok: false, error: "Payment not found" };
  if (payment.match_status !== "ambiguous")
    return { ok: false, error: "Payment is not ambiguous" };

  const { data: txn } = await supabase
    .from("transactions")
    .select("id")
    .eq("id", transactionId)
    .eq("user_id", uid)
    .single();

  if (!txn) return { ok: false, error: "Transaction not found" };

  // If originally standalone (balance-funded turned ambiguous), delete the standalone txn
  if (!payment.funded) {
    const hash = await dedupHash("PayPal", "PAYPAL", payment.transaction_id);
    await supabase
      .from("transactions")
      .delete()
      .eq("user_id", uid)
      .eq("dedup_hash", hash);
  }

  await supabase
    .from("transactions")
    .update({ enriched_merchant: payment.merchant_name, enrichment_source: "paypal" })
    .eq("id", transactionId);

  await supabase
    .from("paypal_payments")
    .update({ match_status: "matched", matched_transaction_id: transactionId })
    .eq("id", paymentId);

  return { ok: true };
}
