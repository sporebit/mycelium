import { describe, it, expect } from "vitest";
import { normalizeApiTransactions } from "./paypal-api";

function makeTxn(overrides: Record<string, unknown> = {}) {
  return {
    transaction_info: {
      transaction_id: "TX001",
      transaction_event_code: "T0006",
      transaction_initiation_date: "2026-05-28T14:30:00+0000",
      transaction_amount: { currency_code: "GBP", value: "-15.99" },
      fee_amount: { currency_code: "GBP", value: "-0.50" },
      transaction_subject: "Widget purchase",
      paypal_reference_id: "",
      paypal_reference_id_type: "",
      ...((overrides.transaction_info as Record<string, unknown>) ?? {}),
    },
    payer_info: {
      payer_name: { alternate_full_name: "Widget Co" },
      ...((overrides.payer_info as Record<string, unknown>) ?? {}),
    },
    cart_info: { item_details: [] },
    ...Object.fromEntries(
      Object.entries(overrides).filter(
        ([k]) => !["transaction_info", "payer_info"].includes(k),
      ),
    ),
  };
}

describe("normalizeApiTransactions", () => {
  it("normalizes a balance-funded payment", () => {
    const txn = makeTxn();
    const rows = normalizeApiTransactions([txn]);

    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.transaction_id).toBe("TX001");
    expect(row.date).toBe("2026-05-28");
    expect(row.gross).toBe(-15.99);
    expect(row.fee).toBe(-0.5);
    expect(row.net).toBe(-16.49);
    expect(row.name).toBe("Widget Co");
    expect(row.description).toBe("Widget purchase");
    expect(row.currency).toBe("GBP");
    expect(row.ref_txn_id).toBe("");
  });

  it("normalizes a card-funded payment with its funding leg", () => {
    const payment = makeTxn({
      transaction_info: {
        transaction_id: "TX100",
        transaction_event_code: "T0006",
        transaction_initiation_date: "2026-05-29T10:00:00+0000",
        transaction_amount: { currency_code: "GBP", value: "-25.00" },
        fee_amount: { currency_code: "GBP", value: "0.00" },
        transaction_subject: "Steam Games",
      },
      payer_info: { payer_name: { alternate_full_name: "www.steampowered.com" } },
    });

    const fundingLeg = makeTxn({
      transaction_info: {
        transaction_id: "TX101",
        transaction_event_code: "T0700",
        transaction_initiation_date: "2026-05-29T10:00:01+0000",
        transaction_amount: { currency_code: "GBP", value: "25.00" },
        fee_amount: { currency_code: "GBP", value: "0.00" },
        transaction_subject: "",
        paypal_reference_id: "TX100",
        paypal_reference_id_type: "TXN",
      },
      payer_info: { payer_name: { alternate_full_name: "" } },
    });

    const rows = normalizeApiTransactions([payment, fundingLeg]);

    expect(rows).toHaveLength(2);

    const payRow = rows.find((r) => r.transaction_id === "TX100")!;
    expect(payRow.gross).toBe(-25);
    expect(payRow.name).toBe("www.steampowered.com");
    expect(payRow.description).toBe("Steam Games");

    const fundRow = rows.find((r) => r.transaction_id === "TX101")!;
    expect(fundRow.description).toBe("General Card Deposit");
    expect(fundRow.ref_txn_id).toBe("TX100");
    expect(fundRow.gross).toBe(25);
  });

  it("normalizes a refund (T01xx event)", () => {
    const refund = makeTxn({
      transaction_info: {
        transaction_id: "TX200",
        transaction_event_code: "T0106",
        transaction_initiation_date: "2026-06-01T08:00:00+0000",
        transaction_amount: { currency_code: "GBP", value: "10.00" },
        fee_amount: { currency_code: "GBP", value: "0.30" },
        transaction_subject: "Refund for order #1234",
        paypal_reference_id: "TX050",
        paypal_reference_id_type: "TXN",
      },
      payer_info: { payer_name: { alternate_full_name: "Some Merchant" } },
    });

    const rows = normalizeApiTransactions([refund]);

    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.transaction_id).toBe("TX200");
    expect(row.gross).toBe(10);
    expect(row.fee).toBe(0.3);
    expect(row.net).toBe(10.3);
    expect(row.description).toBe("Refund for order #1234");
    expect(row.ref_txn_id).toBe("TX050");
  });

  it("filters out currency conversion events (T02xx)", () => {
    const conversion = makeTxn({
      transaction_info: {
        transaction_id: "TX300",
        transaction_event_code: "T0200",
        transaction_initiation_date: "2026-06-01T09:00:00+0000",
        transaction_amount: { currency_code: "USD", value: "-12.00" },
      },
    });

    const rows = normalizeApiTransactions([conversion]);
    expect(rows).toHaveLength(0);
  });

  it("filters out financing events (T08xx)", () => {
    const financing = makeTxn({
      transaction_info: {
        transaction_id: "TX400",
        transaction_event_code: "T0800",
        transaction_initiation_date: "2026-06-01T09:00:00+0000",
        transaction_amount: { currency_code: "GBP", value: "50.00" },
      },
    });

    const rows = normalizeApiTransactions([financing]);
    expect(rows).toHaveLength(0);
  });

  it("maps bank funding leg (T0300) correctly", () => {
    const bankLeg = makeTxn({
      transaction_info: {
        transaction_id: "TX500",
        transaction_event_code: "T0300",
        transaction_initiation_date: "2026-05-30T12:00:00+0000",
        transaction_amount: { currency_code: "GBP", value: "100.00" },
        fee_amount: { currency_code: "GBP", value: "0.00" },
        paypal_reference_id: "TX499",
        paypal_reference_id_type: "TXN",
      },
      payer_info: { payer_name: { alternate_full_name: "" } },
    });

    const rows = normalizeApiTransactions([bankLeg]);
    expect(rows).toHaveLength(1);
    expect(rows[0].description).toBe("Bank Deposit to PP Account");
    expect(rows[0].ref_txn_id).toBe("TX499");
  });
});
