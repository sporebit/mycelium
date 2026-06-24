-- Column already stores inches in practice; rename for clarity
ALTER TABLE body_metrics RENAME COLUMN waist_cm TO waist_in;

-- Fix Luke import rows that were incorrectly converted from inches to cm
UPDATE body_metrics SET waist_in = 32 WHERE waist_in = 81.28;
UPDATE body_metrics SET waist_in = 33 WHERE waist_in = 83.82;
UPDATE body_metrics SET waist_in = 34 WHERE waist_in = 86.36;
