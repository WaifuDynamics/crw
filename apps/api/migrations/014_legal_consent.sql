-- Acceptance of the CRW+ legal documents (Terms of Service, Privacy Policy, Community
-- Guidelines), one row per account and document version, kept as the record of consent.
-- user_accounts.legal_version is the latest accepted version, which the app checks.
--
-- No dollar signs and no semicolons inside comments: the migration runner splits
-- statements on every semicolon and treats a dollar sign as the start of a quoted body.
CREATE TABLE legal_acceptances (
  user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  version text NOT NULL CHECK (char_length(version) BETWEEN 1 AND 20),
  accepted_at timestamptz NOT NULL DEFAULT now(),
  age_confirmed boolean NOT NULL,
  platform text CHECK (char_length(platform) <= 20),
  PRIMARY KEY (user_id, version)
);
ALTER TABLE user_accounts ADD COLUMN legal_version text;
ALTER TABLE user_accounts ADD COLUMN legal_accepted_at timestamptz;
