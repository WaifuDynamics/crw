-- Finished GPS workouts uploaded by the app, for the distance leaderboard.
--
-- The app keeps the full route on the phone. The server only stores what the ranking
-- needs. external_id is the app's run id, unique per user, so a repeated upload counts once.
--
-- No dollar signs and no semicolons inside comments: the migration runner splits
-- statements on every semicolon and treats a dollar sign as the start of a quoted body.
CREATE TABLE workouts (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  external_id text NOT NULL CHECK (char_length(external_id) BETWEEN 1 AND 64),
  activity text NOT NULL CHECK (char_length(activity) BETWEEN 1 AND 40),
  meters int NOT NULL CHECK (meters BETWEEN 0 AND 1000000),
  seconds int NOT NULL CHECK (seconds BETWEEN 0 AND 604800),
  started_at timestamptz NOT NULL,
  source text NOT NULL CHECK (source IN ('gps', 'health')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, external_id)
);
CREATE INDEX workouts_by_start ON workouts (started_at) INCLUDE (user_id, meters);
