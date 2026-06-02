/**
 * Standalone test for the Halifax CSV parser.
 * Run: npx tsx scripts/test-halifax-csv.ts
 */

import { parseHalifaxCsv, dedupHash } from "../lib/finance/halifax-csv";

const FIXTURE = `Transaction Date,Transaction Type,Sort Code,Account Number,Transaction Description,Debit Amount,Credit Amount,Balance
01/06/2026,FEE,'11-02-39,12706368,ACCOUNT FEE,19.00,,92.33
22/05/2026,FPI,'11-02-39,12706368,HODGKINSON JR,,50.00,221.33
21/05/2026,FPO,'11-02-39,12706368,PHILIP WHELAN,300.00,,171.33
02/06/2026,DD,'11-02-39,12706368,B/CARD PLAT VISA,120.00,,-27.67
01/06/2026,DEB,'11-02-39,15661362,Google YouTubePrem,19.99,,446.59
02/06/2026,TFR,'11-02-39,15661362,P WHELAN,30.00,,302.13`;

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

async function main() {
  console.log("--- Halifax CSV Parser Tests ---\n");

  // Test 1: Basic parsing
  console.log("1. Parse fixture CSV");
  const result = await parseHalifaxCsv(FIXTURE);
  assert(result.errors.length === 0, `No parse errors (got ${result.errors.length})`);
  assert(result.rows.length === 6, `6 rows parsed (got ${result.rows.length})`);

  // Test 2: UK date parsing (DD/MM/YYYY → YYYY-MM-DD)
  console.log("\n2. Date parsing (UK format)");
  const feeRow = result.rows[0];
  assert(feeRow.txn_date === "2026-06-01", `01/06/2026 → 2026-06-01 (got ${feeRow.txn_date})`);
  const mayRow = result.rows[1];
  assert(mayRow.txn_date === "2026-05-22", `22/05/2026 → 2026-05-22 (got ${mayRow.txn_date})`);

  // Test 3: Sort code apostrophe stripping
  console.log("\n3. Sort code apostrophe");
  assert(feeRow.sort_code === "11-02-39", `'11-02-39 → 11-02-39 (got ${feeRow.sort_code})`);

  // Test 4: Signed amounts
  console.log("\n4. Signed amounts");
  assert(feeRow.amount === -19.00, `FEE 19.00 debit → -19.00 (got ${feeRow.amount})`);
  assert(feeRow.debit === 19.00, `FEE debit = 19.00 (got ${feeRow.debit})`);
  assert(feeRow.credit === null, `FEE credit = null (got ${feeRow.credit})`);

  const fpiRow = result.rows[1];
  assert(fpiRow.amount === 50.00, `FPI 50.00 credit → +50.00 (got ${fpiRow.amount})`);
  assert(fpiRow.debit === null, `FPI debit = null (got ${fpiRow.debit})`);
  assert(fpiRow.credit === 50.00, `FPI credit = 50.00 (got ${fpiRow.credit})`);

  // Test 5: Negative balance
  console.log("\n5. Negative balance");
  const ddRow = result.rows[3];
  assert(ddRow.balance === -27.67, `DD balance = -27.67 (got ${ddRow.balance})`);
  assert(ddRow.amount === -120.00, `DD amount = -120.00 (got ${ddRow.amount})`);

  // Test 6: Multiple accounts
  console.log("\n6. Multiple accounts in one file");
  const accountNums = new Set(result.rows.map((r) => r.account_number));
  assert(accountNums.size === 2, `2 unique accounts (got ${accountNums.size})`);
  assert(accountNums.has("12706368"), "Has account 12706368");
  assert(accountNums.has("15661362"), "Has account 15661362");

  // Test 7: Dedup hash determinism
  console.log("\n7. Dedup hash determinism");
  const hash1 = await dedupHash("12706368", "2026-06-01", "ACCOUNT FEE", "19.00", "", "92.33");
  const hash2 = await dedupHash("12706368", "2026-06-01", "ACCOUNT FEE", "19.00", "", "92.33");
  assert(hash1 === hash2, "Same inputs → same hash");
  assert(hash1.length === 64, `Hash is 64-char hex (got ${hash1.length})`);

  const hash3 = await dedupHash("12706368", "2026-06-01", "ACCOUNT FEE", "19.00", "", "100.00");
  assert(hash1 !== hash3, "Different balance → different hash");

  // Test 8: Dedup — re-parsing same CSV produces same hashes
  console.log("\n8. Dedup: re-parse produces identical hashes");
  const result2 = await parseHalifaxCsv(FIXTURE);
  const hashes1 = result.rows.map((r) => r.dedup_hash);
  const hashes2 = result2.rows.map((r) => r.dedup_hash);
  assert(
    hashes1.every((h, i) => h === hashes2[i]),
    "All hashes match between two parses",
  );

  // Test 9: Bad header
  console.log("\n9. Bad header rejected");
  const badResult = await parseHalifaxCsv("Foo,Bar,Baz\n1,2,3");
  assert(badResult.rows.length === 0, "No rows from bad header");
  assert(badResult.errors.length === 1, "One error from bad header");
  assert(
    badResult.errors[0].reason.includes("not a Halifax CSV"),
    `Error says not Halifax (got: ${badResult.errors[0].reason})`,
  );

  // Test 10: Empty file
  console.log("\n10. Empty file");
  const emptyResult = await parseHalifaxCsv("");
  assert(emptyResult.rows.length === 0, "No rows from empty");
  assert(emptyResult.errors.length === 1, "One error from empty");

  // Summary
  console.log(`\n--- Results: ${passed} passed, ${failed} failed ---`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
