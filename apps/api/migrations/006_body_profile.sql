-- Body details asked for after sign-up, used to estimate calories and effort.
--
-- Every field is optional because people may skip any step. The ranges only reject
-- clearly impossible values. Units are metric.
--
-- No dollar signs and no semicolons inside comments: the migration runner splits
-- statements on every semicolon and treats a dollar sign as the start of a quoted body.
ALTER TABLE user_accounts ADD COLUMN age smallint CHECK (age BETWEEN 13 AND 120);
ALTER TABLE user_accounts ADD COLUMN weight_kg numeric(4,1) CHECK (weight_kg BETWEEN 25 AND 350);
ALTER TABLE user_accounts ADD COLUMN height_cm smallint CHECK (height_cm BETWEEN 90 AND 250);
-- Set once the person has been through the sign-up questions, whether they answered or skipped.
ALTER TABLE user_accounts ADD COLUMN onboarding_completed_at timestamptz;
