-- Results of camera-counted matches (push-ups / squats, 1v1 and 2v2).
--
-- One row per player per match, so a 2v2 match is four rows sharing external_id.
-- external_id is the counter server's match id. The pair (user_id, external_id) is
-- unique, which makes reporting a result idempotent.
--
-- No dollar signs and no semicolons inside comments: the migration runner splits
-- statements on every semicolon and treats a dollar sign as the start of a quoted body.
CREATE TABLE rep_matches (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users,
  external_id text NOT NULL CHECK (char_length(external_id) BETWEEN 1 AND 64),
  mode text NOT NULL CHECK (mode IN ('1v1', '2v2')),
  exercise text NOT NULL CHECK (exercise IN ('pushup', 'squat')),
  won boolean NOT NULL,
  reason text NOT NULL CHECK (reason IN ('target', 'walkover')),
  -- this player's own reps, in 2v2 the team score is the sum of both players
  reps int NOT NULL CHECK (reps BETWEEN 0 AND 10000),
  team_score int NOT NULL CHECK (team_score BETWEEN 0 AND 10000),
  opponent_score int NOT NULL CHECK (opponent_score BETWEEN 0 AND 10000),
  opponents text[] NOT NULL DEFAULT '{}',
  played_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, external_id)
);
CREATE INDEX rep_matches_by_user ON rep_matches (user_id) INCLUDE (won, reps, mode, exercise);
