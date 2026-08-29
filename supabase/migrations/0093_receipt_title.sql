-- Migration: receipt title — a human name for a receipt, independent of the
-- retailer the parser read off the paper.
--
-- `retailer` is parsed and may be overwritten by any reparse. `title` is typed
-- by hand and never touched by the parser, so it is the stable label: the list
-- shows it in preference to the retailer when it is set.
--
-- Depends on: 0092_receipts.sql
-- Rollback:
--   ALTER TABLE receipts DROP COLUMN title;

alter table receipts add column if not exists title text;
