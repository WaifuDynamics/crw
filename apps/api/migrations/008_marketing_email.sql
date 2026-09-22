-- Opt-in marketing email (the daily CRW+ digest).
--
-- Consent is off by default and recorded with a timestamp. marketing_sends has one row per
-- person per day, which is what guarantees at most one marketing email a day even when
-- several API instances run the job.
--
-- No dollar signs and no semicolons inside comments: the migration runner splits
-- statements on every semicolon and treats a dollar sign as the start of a quoted body.
ALTER TABLE user_accounts ADD COLUMN marketing_opt_in boolean NOT NULL DEFAULT false;
ALTER TABLE user_accounts ADD COLUMN marketing_consent_at timestamptz;
ALTER TABLE user_accounts ADD COLUMN marketing_opt_out_at timestamptz;
CREATE TABLE marketing_sends (
  user_id uuid NOT NULL REFERENCES users,
  sent_on date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, sent_on)
);
