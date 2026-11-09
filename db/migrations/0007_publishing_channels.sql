-- 0007_publishing_channels: workspaces, channels and their provider
-- connections (docs/design/publishing-core.md §2, §8, ADR 0004).
-- Same rules as 0004: schema-qualified, idempotent, purely additive, RLS on,
-- nothing for PUBLIC or the Supabase API roles.
--
-- Provider ids (a Zernio profile or account id) live only in provider_ref
-- columns, which only the Lambda role (kubcode_worker) can read. The web app
-- (kubcode_app) sees our ids and labels, scoped by RLS to the workspaces the
-- signed-in member belongs to. Platform, provider and capability names are
-- regex-checked, not enums, so a new platform never needs a constraint change.

-- The unit that holds channels and is billed per channel later.
CREATE TABLE IF NOT EXISTS kubcode_accounts.workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kubcode_accounts.workspace_members (
  workspace_id uuid NOT NULL REFERENCES kubcode_accounts.workspaces (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES kubcode_accounts.users (id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);
-- One owned workspace per creator for now.
CREATE UNIQUE INDEX IF NOT EXISTS workspace_members_one_owned
  ON kubcode_accounts.workspace_members (user_id) WHERE role = 'owner';

-- A provider's own object for a workspace (one Zernio profile per workspace).
CREATE TABLE IF NOT EXISTS kubcode_accounts.provider_profiles (
  workspace_id uuid NOT NULL REFERENCES kubcode_accounts.workspaces (id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider ~ '^[a-z]{1,20}$'),
  provider_ref text NOT NULL CHECK (char_length(provider_ref) BETWEEN 1 AND 128),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, provider),
  CONSTRAINT provider_profiles_ref UNIQUE (provider, provider_ref)
);

-- One social account on one platform. Its status is derived from its
-- connections and the routing table, so it is not stored.
CREATE TABLE IF NOT EXISTS kubcode_accounts.channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES kubcode_accounts.workspaces (id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform ~ '^[a-z]{1,20}$'),
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 200),
  handle text CHECK (handle IS NULL OR char_length(handle) BETWEEN 1 AND 100),
  -- The platform's own id (YouTube channel id, IG user id) when known; used
  -- to put a native reconnect on the same channel (design §6.1).
  platform_account_id text CHECK (platform_account_id IS NULL OR char_length(platform_account_id) BETWEEN 1 AND 128),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS channels_workspace_idx ON kubcode_accounts.channels (workspace_id);
CREATE UNIQUE INDEX IF NOT EXISTS channels_platform_account
  ON kubcode_accounts.channels (workspace_id, platform, platform_account_id)
  WHERE platform_account_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS kubcode_accounts.channel_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES kubcode_accounts.channels (id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider ~ '^[a-z]{1,20}$'),
  provider_ref text NOT NULL CHECK (char_length(provider_ref) BETWEEN 1 AND 128),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'needs_reconnect', 'revoked')),
  last_error_code text CHECK (last_error_code IS NULL OR last_error_code ~ '^[a-z_]{1,40}$'),
  connected_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT channel_connections_ref UNIQUE (provider, provider_ref),
  CONSTRAINT channel_connections_revoked CHECK ((status = 'revoked') = (revoked_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS channel_connections_channel_idx ON kubcode_accounts.channel_connections (channel_id);
-- At most one live connection per channel and provider.
CREATE UNIQUE INDEX IF NOT EXISTS channel_connections_one_live
  ON kubcode_accounts.channel_connections (channel_id, provider) WHERE status <> 'revoked';

-- One "connect a channel" click. The Lambda creates it (with the hashes the
-- web host computed) and consumes it; the web host reads it to check the
-- cookie and session on the callback. Hashes only, never the raw state.
CREATE TABLE IF NOT EXISTS kubcode_accounts.channel_connect_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES kubcode_accounts.workspaces (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES kubcode_accounts.users (id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform ~ '^[a-z]{1,20}$'),
  provider text NOT NULL CHECK (provider ~ '^[a-z]{1,20}$'),
  state_hash bytea NOT NULL UNIQUE CHECK (octet_length(state_hash) = 32),
  cookie_hash bytea NOT NULL CHECK (octet_length(cookie_hash) = 32),
  session_binding_hash bytea NOT NULL CHECK (octet_length(session_binding_hash) = 32),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'consumed', 'failed', 'expired')),
  result_channel_id uuid REFERENCES kubcode_accounts.channels (id) ON DELETE SET NULL,
  error_code text CHECK (error_code IS NULL OR error_code ~ '^[a-z_]{1,40}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  closed_at timestamptz,
  CONSTRAINT channel_connect_intents_closed CHECK ((status = 'open') = (closed_at IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS channel_connect_intents_one_open
  ON kubcode_accounts.channel_connect_intents (user_id) WHERE status = 'open';

-- Which provider carries out a capability on a platform (design §3.1).
-- Flipping a route is an operator change with an audit row, not a deploy.
CREATE TABLE IF NOT EXISTS kubcode_accounts.provider_routes (
  platform text NOT NULL CHECK (platform ~ '^[a-z]{1,20}$'),
  capability text NOT NULL CHECK (capability IN ('connect', 'publish', 'inbox', 'automations', 'analytics')),
  provider text NOT NULL CHECK (provider ~ '^[a-z]{1,20}$'),
  allow_fallback boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (platform, capability)
);
-- Phase 1: everything goes through Zernio. Existing rows are never touched.
INSERT INTO kubcode_accounts.provider_routes (platform, capability, provider)
SELECT p, c, 'zernio'
  FROM unnest(ARRAY['youtube', 'instagram', 'tiktok', 'facebook', 'threads', 'linkedin', 'x', 'pinterest', 'bluesky']) AS p,
       unnest(ARRAY['connect', 'publish', 'inbox', 'automations', 'analytics']) AS c
ON CONFLICT (platform, capability) DO NOTHING;

-- What happened to channels and posts, never values or provider text.
CREATE TABLE IF NOT EXISTS kubcode_accounts.publishing_audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workspace_id uuid REFERENCES kubcode_accounts.workspaces (id) ON DELETE SET NULL,
  user_id uuid REFERENCES kubcode_accounts.users (id) ON DELETE SET NULL,
  event text NOT NULL CHECK (event ~ '^[a-z_]{1,40}$'),
  -- A platform, provider or capability name.
  subject text CHECK (subject IS NULL OR subject ~ '^[a-z][a-z0-9_]{0,39}$'),
  actor text NOT NULL CHECK (actor IN ('user', 'lambda', 'operator', 'provider')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS publishing_audit_events_ws_idx
  ON kubcode_accounts.publishing_audit_events (workspace_id, created_at DESC);

ALTER TABLE kubcode_accounts.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE kubcode_accounts.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE kubcode_accounts.provider_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE kubcode_accounts.channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE kubcode_accounts.channel_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE kubcode_accounts.channel_connect_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE kubcode_accounts.provider_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE kubcode_accounts.publishing_audit_events ENABLE ROW LEVEL SECURITY;

-- Web app role: read-only on all of it (the Lambda writes), never a
-- provider_ref column, and only rows of the member's own workspaces.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kubcode_app') THEN
    RAISE NOTICE 'kubcode_app role not found; runtime grants for 0007 skipped';
    RETURN;
  END IF;
  GRANT USAGE ON SCHEMA kubcode_accounts TO kubcode_app;
  GRANT SELECT ON kubcode_accounts.workspaces TO kubcode_app;
  GRANT SELECT ON kubcode_accounts.workspace_members TO kubcode_app;
  GRANT SELECT ON kubcode_accounts.channels TO kubcode_app;
  GRANT SELECT (id, channel_id, provider, status, last_error_code, connected_at, revoked_at, updated_at)
     ON kubcode_accounts.channel_connections TO kubcode_app;
  GRANT SELECT (id, workspace_id, user_id, platform, provider, state_hash, cookie_hash, session_binding_hash,
                status, result_channel_id, error_code, created_at, expires_at, closed_at)
     ON kubcode_accounts.channel_connect_intents TO kubcode_app;
  GRANT SELECT ON kubcode_accounts.provider_routes TO kubcode_app;
  GRANT SELECT ON kubcode_accounts.publishing_audit_events TO kubcode_app;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'kubcode_accounts'
                 AND tablename = 'workspace_members' AND policyname = 'kubcode_member_scope') THEN
    CREATE POLICY kubcode_member_scope ON kubcode_accounts.workspace_members FOR SELECT TO kubcode_app
      USING (user_id = nullif(current_setting('kubcode.user_id', true), '')::uuid);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'kubcode_accounts'
                 AND tablename = 'workspaces' AND policyname = 'kubcode_member_scope') THEN
    CREATE POLICY kubcode_member_scope ON kubcode_accounts.workspaces FOR SELECT TO kubcode_app
      USING (id IN (SELECT m.workspace_id FROM kubcode_accounts.workspace_members m
                     WHERE m.user_id = nullif(current_setting('kubcode.user_id', true), '')::uuid));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'kubcode_accounts'
                 AND tablename = 'channels' AND policyname = 'kubcode_member_scope') THEN
    CREATE POLICY kubcode_member_scope ON kubcode_accounts.channels FOR SELECT TO kubcode_app
      USING (workspace_id IN (SELECT m.workspace_id FROM kubcode_accounts.workspace_members m
                               WHERE m.user_id = nullif(current_setting('kubcode.user_id', true), '')::uuid));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'kubcode_accounts'
                 AND tablename = 'channel_connections' AND policyname = 'kubcode_member_scope') THEN
    CREATE POLICY kubcode_member_scope ON kubcode_accounts.channel_connections FOR SELECT TO kubcode_app
      USING (channel_id IN (SELECT c.id FROM kubcode_accounts.channels c
                             JOIN kubcode_accounts.workspace_members m ON m.workspace_id = c.workspace_id
                            WHERE m.user_id = nullif(current_setting('kubcode.user_id', true), '')::uuid));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'kubcode_accounts'
                 AND tablename = 'channel_connect_intents' AND policyname = 'kubcode_user_scope') THEN
    CREATE POLICY kubcode_user_scope ON kubcode_accounts.channel_connect_intents FOR SELECT TO kubcode_app
      USING (user_id = nullif(current_setting('kubcode.user_id', true), '')::uuid);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'kubcode_accounts'
                 AND tablename = 'provider_routes' AND policyname = 'kubcode_read_all') THEN
    CREATE POLICY kubcode_read_all ON kubcode_accounts.provider_routes FOR SELECT TO kubcode_app USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'kubcode_accounts'
                 AND tablename = 'publishing_audit_events' AND policyname = 'kubcode_member_scope') THEN
    CREATE POLICY kubcode_member_scope ON kubcode_accounts.publishing_audit_events FOR SELECT TO kubcode_app
      USING (workspace_id IN (SELECT m.workspace_id FROM kubcode_accounts.workspace_members m
                               WHERE m.user_id = nullif(current_setting('kubcode.user_id', true), '')::uuid));
  END IF;
END
$$;

-- Lambda role: cross-workspace (webhooks and the limiter are not per user).
-- No DDL, no audit rewrite, no deleting workspaces or channels.
DO $$
DECLARE
  tab text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kubcode_worker') THEN
    CREATE ROLE kubcode_worker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
  GRANT USAGE ON SCHEMA kubcode_accounts TO kubcode_worker;
  GRANT SELECT, INSERT ON kubcode_accounts.workspaces TO kubcode_worker;
  GRANT SELECT, INSERT ON kubcode_accounts.workspace_members TO kubcode_worker;
  GRANT SELECT, INSERT ON kubcode_accounts.provider_profiles TO kubcode_worker;
  GRANT SELECT, INSERT, UPDATE (display_name, handle, platform_account_id, updated_at)
     ON kubcode_accounts.channels TO kubcode_worker;
  GRANT SELECT, INSERT, UPDATE (status, last_error_code, revoked_at, updated_at)
     ON kubcode_accounts.channel_connections TO kubcode_worker;
  GRANT SELECT, INSERT, UPDATE (status, result_channel_id, error_code, closed_at)
     ON kubcode_accounts.channel_connect_intents TO kubcode_worker;
  GRANT SELECT ON kubcode_accounts.provider_routes TO kubcode_worker;
  GRANT INSERT ON kubcode_accounts.publishing_audit_events TO kubcode_worker;
  FOREACH tab IN ARRAY ARRAY['workspaces', 'workspace_members', 'provider_profiles', 'channels',
                             'channel_connections', 'channel_connect_intents', 'provider_routes',
                             'publishing_audit_events'] LOOP
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
