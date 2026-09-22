-- Sign in with Apple, next to Google. The Apple user identifier is stable per account
-- and per developer team, and the address can be a private relay one, which is fine:
-- it is the address Apple forwards mail through.
--
-- No dollar signs and no semicolons inside comments: the migration runner splits
-- statements on every semicolon and treats a dollar sign as the start of a quoted body.
ALTER TABLE user_accounts ADD COLUMN apple_sub text UNIQUE;
