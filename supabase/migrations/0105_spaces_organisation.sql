-- Migration: space_id + created_by on the organisation section. P12 Part 2.
-- See 0104 for what app.adopt_table does. Parents before children.
--
-- events has no user_id column at all, so its created_by comes from the
-- space owner (the helper's fallback), as the handoff recorded.
--
-- Depends on: 0103.
-- Rollback: restore from the pre-cutover dump.

-- tasks
select app.adopt_table('tasks');
select app.adopt_table('task_comments');
select app.adopt_table('task_activity');
select app.adopt_table('projects');

-- people
select app.adopt_table('people');
select app.adopt_table('people_mentions');
select app.adopt_table('people_aliases', 'people', 'person_id');
select app.adopt_table('entities');

-- captures
select app.adopt_table('raw_captures');
select app.adopt_table('pending_entities');
select app.adopt_table('routing_rules');
select app.adopt_table('entity_review_rules');
select app.adopt_table('context_options');

-- purchases
select app.adopt_table('purchases');
select app.adopt_table('receipts');
select app.adopt_table('receipt_images', 'receipts', 'receipt_id');
select app.adopt_table('receipt_lines', 'receipts', 'receipt_id');
select app.adopt_table('receipt_participants', 'receipts', 'receipt_id');
select app.adopt_table('receipt_line_shares', 'receipt_lines', 'receipt_line_id');
select app.adopt_table('receipt_settlements');

-- events
select app.adopt_table('events');
