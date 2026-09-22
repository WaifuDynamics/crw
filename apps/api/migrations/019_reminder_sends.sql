-- Tracks when each person last got a "come back" reminder, so they get at most one
-- per cooldown window.
CREATE TABLE IF NOT EXISTS reminder_sends (
  user_id uuid PRIMARY KEY REFERENCES users,
  sent_on date NOT NULL
);
