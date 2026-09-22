-- Push notifications sent straight through Firebase Cloud Messaging, with categories.
--
-- device_tokens.provider says how a token is reached: fcm for Android devices that
-- registered their Firebase token, expo for Expo push tokens (iOS and older app builds).
-- notifications.category picks the Android channel and the look of the notification,
-- and push_friend_activity lets people mute "a friend finished a workout" pushes.
--
-- No dollar signs and no semicolons inside comments: the migration runner splits
-- statements on every semicolon and treats a dollar sign as the start of a quoted body.
ALTER TABLE device_tokens ADD COLUMN provider text NOT NULL DEFAULT 'expo' CHECK (provider IN ('expo', 'fcm'));
ALTER TABLE device_tokens ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE notifications ADD COLUMN category text NOT NULL DEFAULT 'general' CHECK (category IN ('general', 'social', 'friends', 'events', 'compete', 'marketing'));
ALTER TABLE user_accounts ADD COLUMN push_friend_activity boolean NOT NULL DEFAULT true;
CREATE TABLE friend_activity_pushes (
  sender_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  sent_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX friend_activity_pushes_recent ON friend_activity_pushes (sender_id, recipient_id, sent_at);
