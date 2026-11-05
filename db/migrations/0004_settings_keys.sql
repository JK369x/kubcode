-- 0004_settings_keys: per-user API keys and OAuth connections for the
-- scheduler (docs/design/settings-keys.md §4). Same rules as 0001/0002:
-- schema-qualified, idempotent, purely additive, RLS on, nothing for PUBLIC
-- or the Supabase API roles, applied only by the explicit migration runner.
--
-- Every secret is an envelope v1 ciphertext (lib/keys/envelope.ts). The web
-- app (kubcode_app) can write envelopes but never read them back; only the
-- Lambda role (kubcode_worker) can SELECT them, and only KMS can unwrap them.
-- Unlike 0002, kubcode_app is scoped per user by RLS: each transaction sets
-- kubcode.user_id, so a query that forgets its WHERE still sees one user.

-- One row per user and kind (e.g. a Google OAuth client, an ElevenLabs key).
-- Kinds are a regex, not an enum, so a new kind never needs a constraint
-- change; the allowlist lives in the TS and Rust code.
CREATE TABLE IF NOT EXISTS kubcode_accounts.user_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES kubcode_accounts.users (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind ~ '^[a-z][a-z0-9_]{1,39}$'),
  -- Non-secret half shown in the UI: an OAuth client id or an app id.
  public_value text CHECK (public_value IS NULL OR char_length(public_value) BETWEEN 1 AND 255),
  envelope bytea NOT NULL CHECK (octet_length(envelope) BETWEEN 1 AND 8192),
  key_slot smallint NOT NULL CHECK (key_slot BETWEEN 1 AND 255),
  -- Last 4 characters of the secret, for "ตั้งค่าแล้ว ••••ab12".
  hint text CHECK (hint IS NULL OR char_length(hint) BETWEEN 1 AND 4),
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_secrets_user_kind UNIQUE (user_id, kind)
);

-- A connected YouTube channel or Instagram account. The envelope holds the
-- long-lived token (Google refresh token, IG 60-day token); written only by
-- the Lambda after the OAuth exchange.
CREATE TABLE IF NOT EXISTS kubcode_accounts.oauth_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES kubcode_accounts.users (id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('youtube', 'instagram')),
  external_account_id text NOT NULL CHECK (char_length(external_account_id) BETWEEN 1 AND 128),
  account_label text CHECK (account_label IS NULL OR char_length(account_label) BETWEEN 1 AND 200),
  scopes text[] NOT NULL DEFAULT '{}',
  -- Version of the app credentials used to connect, to spot replaced creds.
  app_secret_version integer NOT NULL CHECK (app_secret_version >= 1),
  envelope bytea NOT NULL CHECK (octet_length(envelope) BETWEEN 1 AND 8192),
  key_slot smallint NOT NULL CHECK (key_slot BETWEEN 1 AND 255),
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'needs_reconnect', 'revoking')),
  token_expires_at timestamptz,
  last_refreshed_at timestamptz,
  last_checked_at timestamptz,
  -- Fixed codes only, never provider text.
  last_error_code text CHECK (last_error_code IS NULL OR last_error_code ~ '^[a-z_]{1,40}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT oauth_connections_account UNIQUE (user_id, provider, external_account_id)
);

-- Server-side state of one "Connect" click. state/cookie/session binding
-- are stored as SHA-256 hashes; the PKCE verifier is an envelope (Google
-- only) and must be wiped once the intent closes.
CREATE TABLE IF NOT EXISTS kubcode_accounts.oauth_connect_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES kubcode_accounts.users (id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('youtube', 'instagram')),
  state_hash bytea NOT NULL UNIQUE CHECK (octet_length(state_hash) = 32),
  cookie_hash bytea NOT NULL CHECK (octet_length(cookie_hash) = 32),
  session_binding_hash bytea NOT NULL CHECK (octet_length(session_binding_hash) = 32),
  verifier_envelope bytea CHECK (verifier_envelope IS NULL OR octet_length(verifier_envelope) BETWEEN 1 AND 8192),
  key_slot smallint CHECK (key_slot IS NULL OR key_slot BETWEEN 1 AND 255),
  phase text NOT NULL DEFAULT 'await_callback' CHECK (phase IN ('await_callback', 'exchanging', 'closed')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'consumed', 'failed', 'expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  closed_at timestamptz,
  CONSTRAINT oauth_connect_intents_slot CHECK ((verifier_envelope IS NULL) = (key_slot IS NULL)),
  CONSTRAINT oauth_connect_intents_closed CHECK (
    (phase = 'closed') = (status <> 'open') AND (phase = 'closed') = (closed_at IS NOT NULL)
  ),
  CONSTRAINT oauth_connect_intents_closed_wiped CHECK (phase <> 'closed' OR verifier_envelope IS NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS oauth_connect_intents_one_open
  ON kubcode_accounts.oauth_connect_intents (user_id) WHERE status = 'open';

-- Replay guard for HMAC-signed calls to the connect Lambda (Lambda only).
CREATE TABLE IF NOT EXISTS kubcode_accounts.connect_request_nonces (
  nonce_hash bytea PRIMARY KEY CHECK (octet_length(nonce_hash) = 32),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Who changed which key, never the values. Kept when the user is deleted.
CREATE TABLE IF NOT EXISTS kubcode_accounts.secret_audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid REFERENCES kubcode_accounts.users (id) ON DELETE SET NULL,
  event text NOT NULL CHECK (event ~ '^[a-z_]{1,40}$'),
  -- A kind or a provider name, never a value.
  subject text CHECK (subject IS NULL OR subject ~ '^[a-z][a-z0-9_]{1,39}$'),
  actor text NOT NULL CHECK (actor IN ('user', 'lambda', 'operator')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS secret_audit_events_user_idx
  ON kubcode_accounts.secret_audit_events (user_id, created_at DESC);

ALTER TABLE kubcode_accounts.user_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE kubcode_accounts.oauth_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE kubcode_accounts.oauth_connect_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE kubcode_accounts.connect_request_nonces ENABLE ROW LEVEL SECURITY;
ALTER TABLE kubcode_accounts.secret_audit_events ENABLE ROW LEVEL SECURITY;

-- Web app role: column grants keep every envelope write-only, and one
-- per-user policy per table. No access to the nonce table; audit is
-- insert + read only. Connections are created by the Lambda, so the web app
-- may only mark them revoking or delete them. Skipped where the role does
-- not exist (e.g. a fresh local DB).
DO $$
DECLARE
  tab text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kubcode_app') THEN
    RAISE NOTICE 'kubcode_app role not found; runtime grants for 0004 skipped';
    RETURN;
  END IF;
  GRANT USAGE ON SCHEMA kubcode_accounts TO kubcode_app;
  GRANT SELECT (id, user_id, kind, public_value, key_slot, hint, version, created_at, updated_at),
        INSERT, DELETE,
        UPDATE (public_value, envelope, key_slot, hint, version, updated_at)
     ON kubcode_accounts.user_secrets TO kubcode_app;
  GRANT SELECT (id, user_id, provider, external_account_id, account_label, scopes, app_secret_version,
                key_slot, version, status, token_expires_at, last_refreshed_at, last_checked_at,
                last_error_code, created_at, updated_at),
        DELETE,
        UPDATE (status, updated_at)
     ON kubcode_accounts.oauth_connections TO kubcode_app;
  GRANT SELECT (id, user_id, provider, state_hash, cookie_hash, session_binding_hash, key_slot, phase,
                status, created_at, expires_at, closed_at),
        INSERT, DELETE,
        UPDATE (verifier_envelope, key_slot, phase, status, closed_at)
     ON kubcode_accounts.oauth_connect_intents TO kubcode_app;
  GRANT SELECT, INSERT ON kubcode_accounts.secret_audit_events TO kubcode_app;
  FOREACH tab IN ARRAY ARRAY['user_secrets', 'oauth_connections', 'oauth_connect_intents', 'secret_audit_events'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
       WHERE schemaname = 'kubcode_accounts' AND tablename = tab AND policyname = 'kubcode_user_scope'
    ) THEN
      EXECUTE format(
        'CREATE POLICY kubcode_user_scope ON kubcode_accounts.%I FOR ALL TO kubcode_app '
        'USING (user_id = nullif(current_setting(''kubcode.user_id'', true), '''')::uuid) '
        'WITH CHECK (user_id = nullif(current_setting(''kubcode.user_id'', true), '''')::uuid)',
        tab
      );
    END IF;
  END LOOP;
END
$$;

-- Lambda role: reads envelopes for every user (the refresh job is
-- cross-user), creates and updates connections, moves intents along, owns
-- the nonce table and appends audit rows. No DDL, no audit rewrite, no
-- writes to user_secrets (re-wrapping comes with its own migration).
-- The role is created here, NOLOGIN and without a password, so its grants
-- always apply. An existing role is left exactly as it is: the operator
-- gives it LOGIN + a password when the Lambdas ship (the DB URL goes to SSM,
-- never to git).
DO $$
DECLARE
  tab text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kubcode_worker') THEN
    CREATE ROLE kubcode_worker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
  GRANT USAGE ON SCHEMA kubcode_accounts TO kubcode_worker;
  GRANT SELECT ON kubcode_accounts.user_secrets TO kubcode_worker;
  GRANT SELECT, INSERT, DELETE,
        UPDATE (account_label, scopes, app_secret_version, envelope, key_slot, version, status,
                token_expires_at, last_refreshed_at, last_checked_at, last_error_code, updated_at)
     ON kubcode_accounts.oauth_connections TO kubcode_worker;
  GRANT SELECT, UPDATE (verifier_envelope, key_slot, phase, status, closed_at)
     ON kubcode_accounts.oauth_connect_intents TO kubcode_worker;
  GRANT SELECT, INSERT, DELETE ON kubcode_accounts.connect_request_nonces TO kubcode_worker;
  GRANT INSERT ON kubcode_accounts.secret_audit_events TO kubcode_worker;
  FOREACH tab IN ARRAY ARRAY['user_secrets', 'oauth_connections', 'oauth_connect_intents',
                             'connect_request_nonces', 'secret_audit_events'] LOOP
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
