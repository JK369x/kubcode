-- 0001_accounts: central internal users, provider identities, link intents
-- and a secret-free audit trail. Idempotent (IF NOT EXISTS) and applied only
-- by the explicit migration runner (npm run db:migrate:accounts -- --apply),
-- never on an ordinary request. Requires PostgreSQL 13+ (gen_random_uuid).
--
-- Everything lives in the private schema kubcode_accounts, never in public
-- (the Supabase Data API schema). The schema and its objects are revoked from
-- PUBLIC and from the Supabase API roles anon/authenticated (when present),
-- and every table has row level security enabled with NO policies: a role
-- that is not the owner sees nothing until a scoped policy is added on
-- purpose. Runtime SQL is always schema-qualified (no search_path reliance).

CREATE SCHEMA IF NOT EXISTS kubcode_accounts;
REVOKE ALL ON SCHEMA kubcode_accounts FROM PUBLIC;

CREATE TABLE IF NOT EXISTS kubcode_accounts.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  session_version integer NOT NULL DEFAULT 1 CHECK (session_version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One row per external login. Email is optional, nonunique metadata and only
-- ever stored for Google (verified); identities are never matched by email.
CREATE TABLE IF NOT EXISTS kubcode_accounts.user_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES kubcode_accounts.users (id) ON DELETE RESTRICT,
  provider text NOT NULL CHECK (provider IN ('google', 'line')),
  subject text NOT NULL CHECK (char_length(subject) BETWEEN 1 AND 255),
  display_name text CHECK (display_name IS NULL OR char_length(display_name) <= 200),
  email text CHECK (email IS NULL OR (provider = 'google' AND char_length(email) <= 320)),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz,
  CONSTRAINT user_identities_provider_subject_key UNIQUE (provider, subject),
  CONSTRAINT user_identities_user_provider_key UNIQUE (user_id, provider)
);
CREATE INDEX IF NOT EXISTS user_identities_user_id_idx ON kubcode_accounts.user_identities (user_id);

-- Server-side link/unlink intents. Only a SHA-256 hash of the cookie token and
-- of the browser session binding are stored. The pending target identity is
-- held only while the intent is open and wiped on every terminal state.
CREATE TABLE IF NOT EXISTS kubcode_accounts.account_link_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash bytea NOT NULL CHECK (octet_length(token_hash) = 32),
  kind text NOT NULL CHECK (kind IN ('link', 'unlink')),
  user_id uuid NOT NULL REFERENCES kubcode_accounts.users (id) ON DELETE CASCADE,
  session_binding_hash bytea NOT NULL CHECK (octet_length(session_binding_hash) = 32),
  session_version integer NOT NULL CHECK (session_version >= 1),
  source_identity_id uuid REFERENCES kubcode_accounts.user_identities (id) ON DELETE SET NULL,
  target_provider text NOT NULL CHECK (target_provider IN ('google', 'line')),
  target_identity_id uuid REFERENCES kubcode_accounts.user_identities (id) ON DELETE SET NULL,
  pending_subject text CHECK (pending_subject IS NULL OR char_length(pending_subject) BETWEEN 1 AND 255),
  pending_display_name text CHECK (pending_display_name IS NULL OR char_length(pending_display_name) <= 200),
  pending_email text CHECK (pending_email IS NULL OR char_length(pending_email) <= 320),
  phase text NOT NULL CHECK (phase IN ('await_source', 'await_target', 'await_confirm', 'closed')),
  status text NOT NULL CHECK (status IN ('open', 'consumed', 'cancelled', 'rejected', 'superseded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  source_verified_at timestamptz,
  target_verified_at timestamptz,
  closed_at timestamptz,
  CONSTRAINT account_link_intents_token_hash_key UNIQUE (token_hash),
  CONSTRAINT account_link_intents_closed_wiped CHECK (
    status = 'open'
    OR (phase = 'closed' AND closed_at IS NOT NULL AND pending_subject IS NULL
        AND pending_display_name IS NULL AND pending_email IS NULL)
  ),
  CONSTRAINT account_link_intents_pending_only_link CHECK (kind = 'link' OR pending_subject IS NULL)
);
-- At most one open intent per user, enforced by the database under races.
CREATE UNIQUE INDEX IF NOT EXISTS account_link_intents_one_open_idx
  ON kubcode_accounts.account_link_intents (user_id) WHERE status = 'open';

-- Audit: fixed event names and provider only. No subjects, tokens, emails or IPs.
CREATE TABLE IF NOT EXISTS kubcode_accounts.account_audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid REFERENCES kubcode_accounts.users (id) ON DELETE SET NULL,
  event text NOT NULL CHECK (event ~ '^[a-z_]{1,40}$'),
  provider text CHECK (provider IS NULL OR provider IN ('google', 'line')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS account_audit_events_user_idx
  ON kubcode_accounts.account_audit_events (user_id, created_at);

-- Defense in depth: RLS on, deliberately no policies (owner bypasses RLS).
ALTER TABLE kubcode_accounts.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE kubcode_accounts.user_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE kubcode_accounts.account_link_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE kubcode_accounts.account_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE kubcode_accounts.schema_migrations ENABLE ROW LEVEL SECURITY;

-- No access for PUBLIC or the Supabase API roles, including grants that
-- default privileges may have added when the objects above were created.
REVOKE ALL ON ALL TABLES IN SCHEMA kubcode_accounts FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA kubcode_accounts FROM PUBLIC;
DO $$
DECLARE
  api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA kubcode_accounts FROM %I', api_role);
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA kubcode_accounts FROM %I', api_role);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA kubcode_accounts FROM %I', api_role);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA kubcode_accounts FROM %I', api_role);
    END IF;
  END LOOP;
END
$$;
