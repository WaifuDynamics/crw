-- Complete workout history per account, so a user's workouts follow them to every device.
--
-- workouts gains the rest of a workout (end time, splits, calories, heart rate, steps,
-- Health Connect link) plus sync columns: updated_at moves on every change and deleted_at
-- marks a workout removed on one device, so the others remove it too.
-- workout_routes keeps the GPS route next to the workout (one row each, loaded on demand).
-- health_days keeps the daily totals read from Apple Health or Health Connect.
--
-- No dollar signs and no semicolons inside comments: the migration runner splits
-- statements on every semicolon and treats a dollar sign as the start of a quoted body.
ALTER TABLE workouts ADD COLUMN ended_at timestamptz;
ALTER TABLE workouts ADD COLUMN calories int CHECK (calories BETWEEN 0 AND 20000);
ALTER TABLE workouts ADD COLUMN heart_rate int CHECK (heart_rate BETWEEN 20 AND 250);
ALTER TABLE workouts ADD COLUMN steps int CHECK (steps BETWEEN 0 AND 500000);
ALTER TABLE workouts ADD COLUMN splits int[] NOT NULL DEFAULT '{}';
ALTER TABLE workouts ADD COLUMN exercise_type int;
ALTER TABLE workouts ADD COLUMN health_connect_id text CHECK (char_length(health_connect_id) <= 128);
ALTER TABLE workouts ADD COLUMN point_count int NOT NULL DEFAULT 0;
ALTER TABLE workouts ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE workouts ADD COLUMN deleted_at timestamptz;
CREATE INDEX workouts_sync ON workouts (user_id, updated_at);

CREATE TABLE workout_routes (
  workout_id uuid PRIMARY KEY REFERENCES workouts ON DELETE CASCADE,
  points jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE health_days (
  user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  day date NOT NULL,
  steps int CHECK (steps BETWEEN 0 AND 500000),
  calories int CHECK (calories BETWEEN 0 AND 50000),
  heart_rate int CHECK (heart_rate BETWEEN 20 AND 250),
  source text NOT NULL CHECK (char_length(source) BETWEEN 1 AND 40),
  synced_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day)
);
