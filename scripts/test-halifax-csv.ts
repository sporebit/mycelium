/**
 * Tests for all CSV bank parsers.
 * Run: npx tsx scripts/test-halifax-csv.ts
 */

import {
  parseHalifaxCsv,
  dedupHash,
  halifaxParser,
} from "../lib/finance/halifax-csv";
import { revolutParser } from "../lib/finance/revolut-csv";
import { amexParser } from "../lib/finance/amex-csv";
import { stripBom } from "../lib/finance/csv-parser";

const HALIFAX_FIXTURE = `Transaction Date,Transaction Type,Sort Code,Account Number,Transaction Description,Debit Amount,Credit Amount,Balance
01/06/2026,FEE,'11-02-39,12706368,ACCOUNT FEE,19.00,,92.33
22/05/2026,FPI,'11-02-39,12706368,HODGKINSON JR,,50.00,221.33
21/05/2026,FPO,'11-02-39,12706368,PHILIP WHELAN,300.00,,171.33
02/06/2026,DD,'11-02-39,12706368,B/CARD PLAT VISA,120.00,,-27.67
01/06/2026,DEB,'11-02-39,15661362,Google YouTubePrem,19.99,,446.59
02/06/2026,TFR,'11-02-39,15661362,P WHELAN,30.00,,302.13`;

const REVOLUT_FIXTURE = `Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance
Card Payment,Current,2025-01-15 10:30:45,2025-01-15 11:00:00,Tesco Stores,-25.50,0.00,GBP,COMPLETED,1234.50
Topup,Current,2025-01-14 09:00:00,2025-01-14 09:00:01,Top-Up by *1234,500.00,0.00,GBP,COMPLETED,1260.00
Transfer,Current,2025-01-13 14:00:00,2025-01-13 14:00:02,To John Smith,-100.00,0.00,GBP,COMPLETED,760.00
Card Payment,Current,2024-12-31 23:50:00,2025-01-01 00:05:00,New Year Purchase,-50.00,0.00,GBP,COMPLETED,860.00
Card Payment,Current,2025-01-16 08:00:00,,Pending Store,-10.00,0.00,GBP,PENDING,1224.50
ATM,Current,2025-01-10 12:00:00,2025-01-10 12:00:00,ATM Withdrawal,-200.00,1.50,GBP,COMPLETED,960.00
Exchange,Current,2025-01-12 15:00:00,2025-01-12 15:00:01,Exchanged to EUR,-50.00,0.00,EUR,COMPLETED,910.00`;

const AMEX_FIXTURE = `Date,Description,Amount
30/05/2026,APPLE.COM/BILL          HOLLYHILL,1.99
28/05/2026,WM MORRISONS STORES     DONCASTER,31.37
01/01/2026,PAYMENT RECEIVED - THANK YOU,-101.23
30/05/2026,APPLE.COM/BILL          HOLLYHILL,1.99
15/03/2026,UBER   *EATS             HELP.UBER,12.50`;

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

// ── Halifax ──

async function testHalifax() {
  console.log("=== Halifax Parser ===\n");

  console.log("1. Parse fixture CSV");
  const result = await parseHalifaxCsv(HALIFAX_FIXTURE);
  assert(result.errors.length === 0, `No parse errors (got ${result.errors.length})`);
  assert(result.rows.length === 6, `6 rows parsed (got ${result.rows.length})`);

  console.log("\n2. Date parsing (UK format)");
  const feeRow = result.rows[0];
  assert(feeRow.txn_date === "2026-06-01", `01/06/2026 → 2026-06-01 (got ${feeRow.txn_date})`);
  const mayRow = result.rows[1];
  assert(mayRow.txn_date === "2026-05-22", `22/05/2026 → 2026-05-22 (got ${mayRow.txn_date})`);

  console.log("\n3. Sort code apostrophe");
  assert(feeRow.sort_code === "11-02-39", `'11-02-39 → 11-02-39 (got ${feeRow.sort_code})`);

  console.log("\n4. Signed amounts");
  assert(feeRow.amount === -19.0, `FEE 19.00 debit → -19.00 (got ${feeRow.amount})`);
  assert(feeRow.debit === 19.0, `FEE debit = 19.00 (got ${feeRow.debit})`);
  assert(feeRow.credit === null, `FEE credit = null (got ${feeRow.credit})`);
  const fpiRow = result.rows[1];
  assert(fpiRow.amount === 50.0, `FPI 50.00 credit → +50.00 (got ${fpiRow.amount})`);
  assert(fpiRow.debit === null, `FPI debit = null (got ${fpiRow.debit})`);
  assert(fpiRow.credit === 50.0, `FPI credit = 50.00 (got ${fpiRow.credit})`);

  console.log("\n5. Negative balance");
  const ddRow = result.rows[3];
  assert(ddRow.balance === -27.67, `DD balance = -27.67 (got ${ddRow.balance})`);
  assert(ddRow.amount === -120.0, `DD amount = -120.00 (got ${ddRow.amount})`);

  console.log("\n6. Multiple accounts in one file");
  const accountNums = new Set(result.rows.map((r) => r.account_number));
  assert(accountNums.size === 2, `2 unique accounts (got ${accountNums.size})`);
  assert(accountNums.has("12706368"), "Has account 12706368");
  assert(accountNums.has("15661362"), "Has account 15661362");

  console.log("\n7. Dedup hash determinism");
  const hash1 = await dedupHash("12706368", "2026-06-01", "ACCOUNT FEE", "19.00", "", "92.33");
  const hash2 = await dedupHash("12706368", "2026-06-01", "ACCOUNT FEE", "19.00", "", "92.33");
  assert(hash1 === hash2, "Same inputs → same hash");
  assert(hash1.length === 64, `Hash is 64-char hex (got ${hash1.length})`);
  const hash3 = await dedupHash("12706368", "2026-06-01", "ACCOUNT FEE", "19.00", "", "100.00");
  assert(hash1 !== hash3, "Different balance → different hash");

  console.log("\n8. Dedup: re-parse produces identical hashes");
  const result2 = await parseHalifaxCsv(HALIFAX_FIXTURE);
  const hashes1 = result.rows.map((r) => r.dedup_hash);
  const hashes2 = result2.rows.map((r) => r.dedup_hash);
  assert(hashes1.every((h, i) => h === hashes2[i]), "All hashes match between two parses");

  console.log("\n9. Bad header rejected");
  const badResult = await parseHalifaxCsv("Foo,Bar,Baz\n1,2,3");
  assert(badResult.rows.length === 0, "No rows from bad header");
  assert(badResult.errors.length === 1, "One error from bad header");
  assert(
    badResult.errors[0].reason.includes("not a Halifax CSV"),
    `Error says not Halifax (got: ${badResult.errors[0].reason})`,
  );

  console.log("\n10. Empty file");
  const emptyResult = await parseHalifaxCsv("");
  assert(emptyResult.rows.length === 0, "No rows from empty");
  assert(emptyResult.errors.length === 1, "One error from empty");

  console.log("\n11. CsvBankParser adapter");
  const adapted = await halifaxParser.parse(HALIFAX_FIXTURE);
  assert(adapted.txns.length === 6, `Adapter: 6 txns (got ${adapted.txns.length})`);
  assert(adapted.accounts.size === 2, `Adapter: 2 accounts (got ${adapted.accounts.size})`);
  assert(adapted.txns[0].dedup_hash === hashes1[0], "Adapter hash matches legacy");
  assert(adapted.txns[0].currency === "GBP", "Adapter: currency = GBP");
  assert(adapted.txns[0].fee === null, "Adapter: fee = null");
  const acct = adapted.accounts.get("12706368");
  assert(acct?.bank === "Halifax", "Adapter: bank = Halifax");
  assert(acct?.account_type === "current", "Adapter: account_type = current");
}

// ── Revolut ──

async function testRevolut() {
  console.log("\n\n=== Revolut Parser ===\n");

  console.log("1. Header detection");
  assert(
    revolutParser.detect(
      "Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance",
    ),
    "Revolut header detected",
  );
  assert(!revolutParser.detect("Date,Description,Amount"), "AMEX header not detected as Revolut");

  console.log("\n2. Parse fixture");
  const result = await revolutParser.parse(REVOLUT_FIXTURE);
  assert(result.errors.length === 0, `No errors (got ${result.errors.length})`);
  assert(result.txns.length === 6, `6 COMPLETED rows imported (got ${result.txns.length})`);
  assert(result.skipped.length === 1, `1 PENDING skipped (got ${result.skipped.length})`);

  console.log("\n3. State filtering");
  assert(result.skipped[0].reason.includes("PENDING"), "Skipped reason mentions PENDING");

  console.log("\n4. Signed amounts (neg = out, pos = in)");
  const tesco = result.txns[0];
  assert(tesco.amount === -25.5, `Card payment -25.50 (got ${tesco.amount})`);
  assert(tesco.debit === 25.5, `Debit = 25.50 (got ${tesco.debit})`);
  assert(tesco.credit === null, `Credit = null (got ${tesco.credit})`);
  const topup = result.txns[1];
  assert(topup.amount === 500.0, `Topup +500 (got ${topup.amount})`);
  assert(topup.debit === null, `Debit = null (got ${topup.debit})`);
  assert(topup.credit === 500.0, `Credit = 500 (got ${topup.credit})`);

  console.log("\n5. Completed date as txn_date (cross-midnight)");
  const newYear = result.txns[3];
  assert(
    newYear.txn_date === "2025-01-01",
    `Started 2024-12-31, completed 2025-01-01 → txn_date 2025-01-01 (got ${newYear.txn_date})`,
  );
  assert(
    newYear.started_at === "2024-12-31 23:50:00",
    `started_at preserved (got ${newYear.started_at})`,
  );
  assert(
    newYear.completed_at === "2025-01-01 00:05:00",
    `completed_at preserved (got ${newYear.completed_at})`,
  );

  console.log("\n6. Fee handling");
  const atm = result.txns[4];
  assert(atm.fee === 1.5, `ATM fee = 1.50 (got ${atm.fee})`);
  assert(atm.amount === -200.0, `ATM amount = -200 (got ${atm.amount})`);

  console.log("\n7. Currency");
  const exchange = result.txns[5];
  assert(exchange.currency === "EUR", `Exchange currency = EUR (got ${exchange.currency})`);
  assert(tesco.currency === "GBP", `Tesco currency = GBP (got ${tesco.currency})`);

  console.log("\n8. Account descriptor");
  assert(result.accounts.size === 1, `1 account (got ${result.accounts.size})`);
  const racct = result.accounts.get("REVOLUT-GBP-CURRENT");
  assert(racct?.bank === "Revolut", `Bank = Revolut (got ${racct?.bank})`);
  assert(racct?.account_type === "current", `Type = current (got ${racct?.account_type})`);

  console.log("\n9. Dedup: re-parse identical");
  const result2 = await revolutParser.parse(REVOLUT_FIXTURE);
  const hashes1 = result.txns.map((t) => t.dedup_hash);
  const hashes2 = result2.txns.map((t) => t.dedup_hash);
  assert(hashes1.every((h, i) => h === hashes2[i]), "All hashes match between two parses");
}

// ── AMEX ──

async function testAmex() {
  console.log("\n\n=== AMEX Parser ===\n");

  console.log("1. Header detection");
  assert(amexParser.detect("Date,Description,Amount"), "AMEX header detected");
  assert(
    !amexParser.detect("Transaction Date,Transaction Type,Sort Code"),
    "Halifax header not detected as AMEX",
  );

  console.log("\n2. Parse fixture");
  const result = await amexParser.parse(AMEX_FIXTURE);
  assert(result.errors.length === 0, `No errors (got ${result.errors.length})`);
  assert(result.txns.length === 5, `5 rows parsed (got ${result.txns.length})`);

  console.log("\n3. Sign inversion");
  const apple = result.txns[0];
  assert(apple.amount === -1.99, `AMEX charge 1.99 → stored -1.99 (got ${apple.amount})`);
  assert(apple.debit === 1.99, `Debit = 1.99 (got ${apple.debit})`);
  const payment = result.txns[2];
  assert(
    payment.amount === 101.23,
    `AMEX payment -101.23 → stored +101.23 (got ${payment.amount})`,
  );
  assert(payment.credit === 101.23, `Credit = 101.23 (got ${payment.credit})`);

  console.log("\n4. UK date parsing");
  assert(apple.txn_date === "2026-05-30", `30/05/2026 → 2026-05-30 (got ${apple.txn_date})`);
  assert(
    payment.txn_date === "2026-01-01",
    `01/01/2026 → 2026-01-01 (got ${payment.txn_date})`,
  );

  console.log("\n5. Description whitespace collapse");
  assert(
    apple.description === "APPLE.COM/BILL HOLLYHILL",
    `Whitespace collapsed (got "${apple.description}")`,
  );
  const uber = result.txns[4];
  assert(
    uber.description === "UBER *EATS HELP.UBER",
    `Uber whitespace collapsed (got "${uber.description}")`,
  );

  console.log("\n6. No balance (null)");
  assert(apple.balance === null, `Balance = null (got ${apple.balance})`);

  console.log("\n7. Account descriptor");
  assert(result.accounts.size === 1, `1 account (got ${result.accounts.size})`);
  const aacct = result.accounts.get("AMEX");
  assert(aacct?.bank === "Amex", `Bank = Amex (got ${aacct?.bank})`);
  assert(
    aacct?.account_type === "credit_card",
    `Type = credit_card (got ${aacct?.account_type})`,
  );

  console.log("\n8. Occurrence index dedup");
  const apple1 = result.txns[0];
  const apple2 = result.txns[3];
  assert(
    apple1.dedup_hash !== apple2.dedup_hash,
    "Identical rows get different hashes (occurrence_index)",
  );

  console.log("\n9. Dedup: re-parse identical");
  const result2 = await amexParser.parse(AMEX_FIXTURE);
  const hashes1 = result.txns.map((t) => t.dedup_hash);
  const hashes2 = result2.txns.map((t) => t.dedup_hash);
  assert(hashes1.every((h, i) => h === hashes2[i]), "All hashes match between two parses");

  console.log("\n10. Currency");
  assert(apple.currency === "GBP", `Currency = GBP (got ${apple.currency})`);
}

// ── Auto-detect ──

async function testAutoDetect() {
  console.log("\n\n=== Auto-detect ===\n");

  const PARSERS = [halifaxParser, revolutParser, amexParser];
  function detect(header: string) {
    return PARSERS.find((p) => p.detect(header)) ?? null;
  }

  console.log("1. Parser selection");
  assert(
    detect(
      "Transaction Date,Transaction Type,Sort Code,Account Number,Transaction Description,Debit Amount,Credit Amount,Balance",
    )?.id === "halifax",
    "Halifax header → halifax parser",
  );
  assert(
    detect(
      "Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance",
    )?.id === "revolut",
    "Revolut header → revolut parser",
  );
  assert(detect("Date,Description,Amount")?.id === "amex", "AMEX header → amex parser");
  assert(detect("Foo,Bar,Baz") === null, "Unknown header → null");

  console.log("\n2. BOM stripping");
  assert(stripBom("﻿hello") === "hello", "BOM stripped");
  assert(stripBom("hello") === "hello", "No BOM unchanged");
}

// ── Main ──

async function main() {
  console.log("--- CSV Bank Parser Tests ---\n");

  await testHalifax();
  await testRevolut();
  await testAmex();
  await testAutoDetect();

  console.log(`\n\n--- Results: ${passed} passed, ${failed} failed ---`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
