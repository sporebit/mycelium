-- Migration: space_id + created_by on the health section. P12 Part 2.
-- See 0104 for what app.adopt_table does. Parents before children.
--
-- nutrition_targets is in health.nutrition — confirmed by Phil,
-- 10 September 2026 (it post-dated the P12 prompt's registry).
-- blood_test_markers is shared reference and is not adopted.
--
-- Depends on: 0103.
-- Rollback: restore from the pre-cutover dump.

-- nutrition
select app.adopt_table('foods');
select app.adopt_table('meal_groups');
select app.adopt_table('nutrition_logs');
select app.adopt_table('recipes');
select app.adopt_table('meal_plan', 'recipes', 'recipe_id');
select app.adopt_table('shopping_lists');
select app.adopt_table('nutrition_targets');

-- supplements
select app.adopt_table('supplements');
select app.adopt_table('supplement_logs');

-- clinical
select app.adopt_table('blood_test_sessions');
select app.adopt_table('blood_test_results', 'blood_test_sessions', 'session_id');
select app.adopt_table('gut_health_logs');
select app.adopt_table('eye_prescriptions');
