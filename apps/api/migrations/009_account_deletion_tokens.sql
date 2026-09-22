-- Deleting an account is confirmed from a link in an email, using the same token table
-- as email verification and password resets.
--
-- No dollar signs and no semicolons inside comments: the migration runner splits
-- statements on every semicolon and treats a dollar sign as the start of a quoted body.
ALTER TABLE auth_tokens DROP CONSTRAINT IF EXISTS auth_tokens_kind_check;
ALTER TABLE auth_tokens ADD CONSTRAINT auth_tokens_kind_check CHECK (kind IN ('verify', 'reset', 'delete_account'));
