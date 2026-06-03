import type { PayPalRawRow } from "./paypal-csv";

// ── Config ──

const LIVE_BASE = "https://api-m.paypal.com";
const SANDBOX_BASE = "https://api-m.sandbox.paypal.com";

function baseUrl(): string {
  return (process.env.PAYPAL_ENV ?? "live") === "sandbox" ? SANDBOX_BASE : LIVE_BASE;
}

// ── OAuth2 token with in-memory cache ──

let cachedToken: { token: string; expiresAt: number } | null = null;

export async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET are required");
  }

  const res = await fetch(`${baseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayPal OAuth failed (${res.status}): ${text}`);
  }

  const json = await res.json();
  cachedToken = {
    token: json.access_token,
    expiresAt: Date.now() + (json.expires_in - 60) * 1000,
  };
  return cachedToken.token;
}

// ── Transaction Search API ──

const MAX_WINDOW_DAYS = 31;
const PAGE_SIZE = 500;

type ApiTransaction = {
  transaction_info: {
    transaction_id: string;
    transaction_event_code: string;
    transaction_initiation_date: string;
    transaction_amount: { currency_code: string; value: string };
    fee_amount?: { currency_code: string; value: string };
    ending_balance?: { currency_code: string; value: string };
    transaction_note?: string;
    transaction_subject?: string;
    paypal_reference_id?: string;
    paypal_reference_id_type?: string;
  };
  payer_info?: {
    payer_name?: { alternate_full_name?: string };
    email_address?: string;
  };
  cart_info?: {
    item_details?: Array<{ item_name?: string }>;
  };
};

type TransactionSearchResponse = {
  transaction_details: ApiTransaction[];
  total_pages: number;
  page: number;
};

async function fetchPage(
  token: string,
  startDate: string,
  endDate: string,
  page: number,
): Promise<TransactionSearchResponse> {
  const url = new URL(`${baseUrl()}/v1/reporting/transactions`);
  url.searchParams.set("start_date", startDate);
  url.searchParams.set("end_date", endDate);
  url.searchParams.set("fields", "all");
  url.searchParams.set("page_size", String(PAGE_SIZE));
  url.searchParams.set("page", String(page));

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayPal transactions API (${res.status}): ${text}`);
  }

  return res.json();
}

export async function fetchTransactions(
  startDate: Date,
  endDate: Date,
): Promise<ApiTransaction[]> {
  const token = await getAccessToken();
  const all: ApiTransaction[] = [];

  let windowStart = new Date(startDate);
  while (windowStart < endDate) {
    const windowEnd = new Date(
      Math.min(
        windowStart.getTime() + MAX_WINDOW_DAYS * 24 * 60 * 60 * 1000,
        endDate.getTime(),
      ),
    );

    const startIso = windowStart.toISOString();
    const endIso = windowEnd.toISOString();

    let page = 1;
    let totalPages = 1;

    while (page <= totalPages) {
      const result = await fetchPage(token, startIso, endIso, page);
      all.push(...result.transaction_details);
      totalPages = result.total_pages;
      page++;
    }

    windowStart = windowEnd;
  }

  return all;
}

// ── Normalize API transactions to PayPalRawRow[] ──

const EVENT_CODE_MAP: Record<string, string> = {
  T0700: "General Card Deposit",
  T0701: "General Card Deposit",
  T0300: "Bank Deposit to PP Account",
  T0301: "Bank Deposit to PP Account",
};

function eventCodeDescription(code: string): string {
  if (EVENT_CODE_MAP[code]) return EVENT_CODE_MAP[code];
  const prefix = code.slice(0, 3) + "00";
  return EVENT_CODE_MAP[prefix] ?? code;
}

function extractMerchantName(txn: ApiTransaction): string {
  return (
    txn.payer_info?.payer_name?.alternate_full_name ??
    txn.cart_info?.item_details?.[0]?.item_name ??
    ""
  );
}

function extractRefTxnId(txn: ApiTransaction): string {
  const info = txn.transaction_info;
  if (info.paypal_reference_id && info.paypal_reference_id_type === "TXN") {
    return info.paypal_reference_id;
  }
  return "";
}

export function normalizeApiTransactions(txns: ApiTransaction[]): PayPalRawRow[] {
  return txns
    .filter((txn) => {
      const code = txn.transaction_info.transaction_event_code;
      // T02xx = currency conversion, T08xx = financing — skip
      return !code.startsWith("T02") && !code.startsWith("T08");
    })
    .map((txn) => {
      const info = txn.transaction_info;
      const amount = parseFloat(info.transaction_amount.value);
      const fee = info.fee_amount ? parseFloat(info.fee_amount.value) : 0;
      const code = info.transaction_event_code;
      const isPayment = code.startsWith("T00") || code.startsWith("T01");

      const dateStr = info.transaction_initiation_date;
      const d = new Date(dateStr);
      const txnDate = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;

      return {
        date: txnDate,
        description: isPayment
          ? (info.transaction_subject ?? info.transaction_note ?? "Payment")
          : eventCodeDescription(code),
        currency: info.transaction_amount.currency_code,
        gross: Math.round(amount * 100) / 100,
        fee: Math.round(fee * 100) / 100,
        net: Math.round((amount + fee) * 100) / 100,
        transaction_id: info.transaction_id,
        name: extractMerchantName(txn),
        ref_txn_id: extractRefTxnId(txn),
      };
    });
}
