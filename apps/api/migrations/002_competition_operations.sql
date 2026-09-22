ALTER TABLE seasons ADD COLUMN finalized_at timestamptz;
CREATE INDEX outbox_pending ON notification_outbox(status,available_at) WHERE status='pending';
CREATE INDEX refunds_pending ON refunds(status,updated_at) WHERE status IN ('pending','processing');
CREATE INDEX organizer_events ON events(community_id,starts_at DESC);
CREATE INDEX follows_reverse ON follows(following_id,follower_id);
CREATE INDEX public_profile_search ON profiles(display_name) WHERE visibility='public';
