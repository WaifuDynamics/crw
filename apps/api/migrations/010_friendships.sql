-- Friends: mutual connections made through friend requests.
--
-- One row per pair of people. requester_id sent the request, addressee_id answers it.
-- status is pending until accepted. A declined or removed friendship deletes the row, so
-- the pair can start again later. The unique index on the ordered pair stops two requests
-- in opposite directions from existing at the same time.
--
-- No dollar signs and no semicolons inside comments: the migration runner splits
-- statements on every semicolon and treats a dollar sign as the start of a quoted body.
CREATE TABLE friendships (
  requester_id uuid NOT NULL REFERENCES users,
  addressee_id uuid NOT NULL REFERENCES users,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  PRIMARY KEY (requester_id, addressee_id),
  CHECK (requester_id <> addressee_id)
);
CREATE UNIQUE INDEX friendships_pair ON friendships (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id));
CREATE INDEX friendships_addressee ON friendships (addressee_id, status);
