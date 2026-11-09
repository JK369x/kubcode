-- 0008_publishing_posts: clips, posts, deliveries, receipts, webhook dedupe
-- and the shared rate limiter (docs/design/publishing-core.md §2, §5, §8).
-- Additive only; RLS on; provider refs readable by the Lambda role only.

-- One uploaded file of a clip (video or the designed cover) in our private S3.
CREATE TABLE IF NOT EXISTS kubcode_accounts.media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES kubcode_accounts.workspaces (id) ON DELETE CASCADE,
  clip_ref text NOT NULL CHECK (clip_ref ~ '^[A-Za-z0-9._-]{1,120}$'),
  kind text NOT NULL CHECK (kind IN ('video', 'cover')),
  s3_key text NOT NULL UNIQUE CHECK (s3_key ~ '^clips/[0-9a-f-]{36}/[A-Za-z0-9._-]{1,120}/[0-9a-f]{64}\.[a-z0-9]{2,5}$'),
  sha256 bytea NOT NULL CHECK (octet_length(sha256) = 32),
  bytes bigint NOT NULL CHECK (bytes > 0),
  content_type text NOT NULL CHECK (content_type IN ('video/mp4', 'video/quicktime', 'image/png', 'image/jpeg')),
  width integer NOT NULL CHECK (width BETWEEN 1 AND 10000),
  height integer NOT NULL CHECK (height BETWEEN 1 AND 10000),
  seconds numeric(10, 3) CHECK (seconds IS NULL OR seconds > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT media_assets_one_version UNIQUE (workspace_id, clip_ref, kind, sha256)
);

-- What a creator wants published: one clip, its texts and its cover.
CREATE TABLE IF NOT EXISTS kubcode_accounts.posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES kubcode_accounts.workspaces (id) ON DELETE CASCADE,
  clip_ref text NOT NULL CHECK (clip_ref ~ '^[A-Za-z0-9._-]{1,120}$'),
  video_asset_id uuid NOT NULL REFERENCES kubcode_accounts.media_assets (id),
  cover_asset_id uuid REFERENCES kubcode_accounts.media_assets (id),
  title text NOT NULL CHECK (char_length(title) <= 200),
  description text NOT NULL CHECK (char_length(description) <= 5000),
  tags text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed', 'cancelled')),
  -- SHA-256 of the exact summary the creator confirmed; any edit voids it.
  confirm_digest bytea CHECK (confirm_digest IS NULL OR octet_length(confirm_digest) = 32),
  confirmed_at timestamptz,
  confirmed_by uuid REFERENCES kubcode_accounts.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT posts_confirmed CHECK ((status = 'confirmed') = (confirm_digest IS NOT NULL AND confirmed_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS posts_workspace_idx ON kubcode_accounts.posts (workspace_id, created_at DESC);

-- One post going to one channel at one time. The connection and provider
-- are pinned when it is scheduled, so a route flip never moves it.
CREATE TABLE IF NOT EXISTS kubcode_accounts.deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES kubcode_accounts.posts (id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES kubcode_accounts.channels (id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES kubcode_accounts.channel_connections (id),
  provider text NOT NULL CHECK (provider ~ '^[a-z]{1,20}$'),
  platform text NOT NULL CHECK (platform ~ '^[a-z]{1,20}$'),
  publish_at timestamptz NOT NULL,
  visibility text NOT NULL CHECK (visibility IN ('public', 'private', 'unlisted')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'rejected', 'scheduled', 'publishing', 'published', 'failed', 'cancelled')),
  provider_ref text CHECK (provider_ref IS NULL OR char_length(provider_ref) BETWEEN 1 AND 128),
  idempotency_key uuid NOT NULL UNIQUE,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error_code text CHECK (last_error_code IS NULL OR last_error_code ~ '^[a-z_]{1,40}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT deliveries_ref UNIQUE (provider, provider_ref),
  CONSTRAINT deliveries_one_per_channel UNIQUE (post_id, channel_id)
);
CREATE INDEX IF NOT EXISTS deliveries_channel_time_idx ON kubcode_accounts.deliveries (channel_id, publish_at);
CREATE INDEX IF NOT EXISTS deliveries_open_idx ON kubcode_accounts.deliveries (publish_at)
  WHERE status IN ('scheduled', 'publishing');

-- Proof that a delivery went out, and whether the platform shows our cover.
CREATE TABLE IF NOT EXISTS kubcode_accounts.receipts (
  delivery_id uuid PRIMARY KEY REFERENCES kubcode_accounts.deliveries (id) ON DELETE CASCADE,
  platform_post_id text CHECK (platform_post_id IS NULL OR char_length(platform_post_id) BETWEEN 1 AND 128),
  platform_url text CHECK (platform_url IS NULL OR (platform_url ~ '^https://' AND char_length(platform_url) <= 500)),
  published_at timestamptz,
  cover_check text NOT NULL DEFAULT 'pending' CHECK (cover_check IN ('pending', 'ok', 'mismatch', 'unknown')),
  cover_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Webhook dedupe (design §5.4): the event id with the hash of its signed body.
-- Raw bodies are not kept.
CREATE TABLE IF NOT EXISTS kubcode_accounts.provider_events (
  provider text NOT NULL CHECK (provider ~ '^[a-z]{1,20}$'),
  event_id text NOT NULL CHECK (char_length(event_id) BETWEEN 1 AND 200),
  body_sha256 bytea NOT NULL CHECK (octet_length(body_sha256) = 32),
  event_type text NOT NULL CHECK (event_type ~ '^[a-z0-9_.]{1,100}$'),
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, event_id)
);
CREATE INDEX IF NOT EXISTS provider_events_received_idx ON kubcode_accounts.provider_events (received_at);

-- Fixed-window counters shared by every Lambda instance (design §5.6).
CREATE TABLE IF NOT EXISTS kubcode_accounts.rate_windows (
  key text NOT NULL CHECK (key ~ '^[a-z0-9_:.-]{1,100}$'),
  window_start timestamptz NOT NULL,
  count integer NOT NULL CHECK (count >= 0),
  PRIMARY KEY (key, window_start)
);

ALTER TABLE kubcode_accounts.media_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE kubcode_accounts.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE kubcode_accounts.deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE kubcode_accounts.receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE kubcode_accounts.provider_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE kubcode_accounts.rate_windows ENABLE ROW LEVEL SECURITY;

-- Web app role: read its own workspaces' posts (the schedule page, slice 2),
-- never provider refs, idempotency keys or S3 keys; nothing on the webhook
-- and limiter tables.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kubcode_app') THEN
    RAISE NOTICE 'kubcode_app role not found; runtime grants for 0008 skipped';
    RETURN;
  END IF;
  GRANT SELECT (id, workspace_id, clip_ref, kind, sha256, bytes, content_type, width, height, seconds, created_at)
     ON kubcode_accounts.media_assets TO kubcode_app;
  GRANT SELECT ON kubcode_accounts.posts TO kubcode_app;
  GRANT SELECT (id, post_id, channel_id, connection_id, provider, platform, publish_at, visibility, status,
                attempts, last_error_code, created_at, updated_at)
     ON kubcode_accounts.deliveries TO kubcode_app;
  GRANT SELECT ON kubcode_accounts.receipts TO kubcode_app;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'kubcode_accounts'
                 AND tablename = 'media_assets' AND policyname = 'kubcode_member_scope') THEN
    CREATE POLICY kubcode_member_scope ON kubcode_accounts.media_assets FOR SELECT TO kubcode_app
      USING (workspace_id IN (SELECT m.workspace_id FROM kubcode_accounts.workspace_members m
                               WHERE m.user_id = nullif(current_setting('kubcode.user_id', true), '')::uuid));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'kubcode_accounts'
                 AND tablename = 'posts' AND policyname = 'kubcode_member_scope') THEN
    CREATE POLICY kubcode_member_scope ON kubcode_accounts.posts FOR SELECT TO kubcode_app
      USING (workspace_id IN (SELECT m.workspace_id FROM kubcode_accounts.workspace_members m
                               WHERE m.user_id = nullif(current_setting('kubcode.user_id', true), '')::uuid));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'kubcode_accounts'
                 AND tablename = 'deliveries' AND policyname = 'kubcode_member_scope') THEN
    CREATE POLICY kubcode_member_scope ON kubcode_accounts.deliveries FOR SELECT TO kubcode_app
      USING (post_id IN (SELECT p.id FROM kubcode_accounts.posts p
                          JOIN kubcode_accounts.workspace_members m ON m.workspace_id = p.workspace_id
                         WHERE m.user_id = nullif(current_setting('kubcode.user_id', true), '')::uuid));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'kubcode_accounts'
                 AND tablename = 'receipts' AND policyname = 'kubcode_member_scope') THEN
    CREATE POLICY kubcode_member_scope ON kubcode_accounts.receipts FOR SELECT TO kubcode_app
      USING (delivery_id IN (SELECT d.id FROM kubcode_accounts.deliveries d
                              JOIN kubcode_accounts.posts p ON p.id = d.post_id
                              JOIN kubcode_accounts.workspace_members m ON m.workspace_id = p.workspace_id
                             WHERE m.user_id = nullif(current_setting('kubcode.user_id', true), '')::uuid));
  END IF;
END
$$;

-- Lambda role. Deletes only on the two housekeeping tables (old webhook ids,
-- old limiter windows).
DO $$
DECLARE
  tab text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kubcode_worker') THEN
    CREATE ROLE kubcode_worker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
  GRANT USAGE ON SCHEMA kubcode_accounts TO kubcode_worker;
  GRANT SELECT, INSERT ON kubcode_accounts.media_assets TO kubcode_worker;
  GRANT SELECT, INSERT, UPDATE (status, confirm_digest, confirmed_at, confirmed_by, updated_at)
     ON kubcode_accounts.posts TO kubcode_worker;
  GRANT SELECT, INSERT, UPDATE (status, provider_ref, attempts, last_error_code, publish_at, updated_at)
     ON kubcode_accounts.deliveries TO kubcode_worker;
  GRANT SELECT, INSERT, UPDATE (platform_post_id, platform_url, published_at, cover_check, cover_checked_at, updated_at)
     ON kubcode_accounts.receipts TO kubcode_worker;
  GRANT SELECT, INSERT, DELETE ON kubcode_accounts.provider_events TO kubcode_worker;
  GRANT SELECT, INSERT, DELETE, UPDATE (count) ON kubcode_accounts.rate_windows TO kubcode_worker;
  FOREACH tab IN ARRAY ARRAY['media_assets', 'posts', 'deliveries', 'receipts', 'provider_events', 'rate_windows'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
       WHERE schemaname = 'kubcode_accounts' AND tablename = tab AND policyname = 'kubcode_worker_access'
    ) THEN
      EXECUTE format(
        'CREATE POLICY kubcode_worker_access ON kubcode_accounts.%I FOR ALL TO kubcode_worker USING (true) WITH CHECK (true)',
        tab
      );
    END IF;
  END LOOP;
END
$$;

REVOKE ALL ON ALL TABLES IN SCHEMA kubcode_accounts FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA kubcode_accounts FROM PUBLIC;
DO $$
DECLARE
  api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA kubcode_accounts FROM %I', api_role);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA kubcode_accounts FROM %I', api_role);
    END IF;
  END LOOP;
END
$$;
