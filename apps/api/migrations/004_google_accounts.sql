-- Google sign-in and the per-user account record.
--
-- No dollar signs anywhere in this file: the migration runner splits statements on
-- semicolons and treats a lone dollar sign as the start of a quoted body. Regexes
-- therefore end with \Z (end of text in PostgreSQL regexes).
--
-- Accounts created through Google have no password, so the hash becomes optional.
-- Password login still works for everyone who has one: a missing hash never matches.
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- One row per user with the personal details the app shows and edits.
-- Kept separate from `profiles` (public social profile) on purpose: this is private
-- account data, and training data will be added as further columns or tables later.
CREATE TABLE user_accounts (
  user_id uuid PRIMARY KEY REFERENCES users,
  google_sub text UNIQUE,
  avatar_url text,
  first_name text NOT NULL DEFAULT '' CHECK (char_length(first_name) <= 80),
  last_name text NOT NULL DEFAULT '' CHECK (char_length(last_name) <= 80),
  email text NOT NULL,
  -- ISO 3166-1 alpha-2. Not a foreign key: `countries` only lists markets CRW+
  -- operates in, while a person can live anywhere.
  country_code char(2) CHECK (country_code ~ '^[A-Z]{2}\Z'),
  -- BCP 47 tag such as en, pl or pt-BR.
  language text NOT NULL DEFAULT 'en' CHECK (language ~ '^[a-z]{2,3}(-[A-Z]{2})?\Z'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Existing email/password users get a row too, so every account looks the same.
INSERT INTO user_accounts (user_id, avatar_url, first_name, email)
SELECT u.id, p.avatar_url, left(coalesce(p.display_name, ''), 80), u.email
FROM users u LEFT JOIN profiles p ON p.user_id = u.id
ON CONFLICT (user_id) DO NOTHING;
