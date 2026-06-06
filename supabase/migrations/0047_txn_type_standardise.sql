-- Standardise transactions.txn_type from mixed bank codes to canonical labels.

-- Halifax / multi-bank codes
UPDATE transactions SET txn_type = 'Transfer'          WHERE txn_type IN ('TFR');
UPDATE transactions SET txn_type = 'Card Payment'      WHERE txn_type IN ('DEB', 'Express Checkout Payment');
UPDATE transactions SET txn_type = 'Direct Debit'      WHERE txn_type = 'DD';
UPDATE transactions SET txn_type = 'Standing Order'    WHERE txn_type = 'SO';
UPDATE transactions SET txn_type = 'Faster Payment Out' WHERE txn_type = 'FPO';
UPDATE transactions SET txn_type = 'Faster Payment In' WHERE txn_type = 'FPI';
UPDATE transactions SET txn_type = 'Bank Giro Credit'  WHERE txn_type = 'BGC';
UPDATE transactions SET txn_type = 'Bill Payment'      WHERE txn_type = 'BP';
UPDATE transactions SET txn_type = 'Deposit'           WHERE txn_type = 'DEP';
UPDATE transactions SET txn_type = 'Fee'               WHERE txn_type = 'FEE';
UPDATE transactions SET txn_type = 'Top-up'            WHERE txn_type = 'Topup';
UPDATE transactions SET txn_type = 'Cash Withdrawal'   WHERE txn_type = 'ATM';
UPDATE transactions SET txn_type = 'Currency Exchange'  WHERE txn_type = 'Exchange';
UPDATE transactions SET txn_type = 'Card Refund'       WHERE txn_type = 'CARD_CREDIT';
-- 'Transfer', 'Card Payment', 'Charge', 'Card Refund', 'Fee' already canonical

-- Amex empty-string inference (all 393 empties are Amex-only)
UPDATE transactions SET txn_type = 'Card Payment'
  WHERE txn_type = '' AND debit IS NOT NULL;
UPDATE transactions SET txn_type = 'Card Refund'
  WHERE txn_type = '' AND credit IS NOT NULL;
