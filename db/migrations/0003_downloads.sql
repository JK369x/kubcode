-- 0003_downloads: one row per skill-package download (ADR 0002), used for the
-- per-member download limit and as the download log. Same rules as 0002:
-- schema-qualified, idempotent, purely additive, RLS on, nothing for PUBLIC or
-- the Supabase API roles, and the runtime grants live in this file.

CREATE TABLE IF NOT EXISTS kubcode_accounts.download_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES kubcode_accounts.users (id) ON DELETE CASCADE,
  package_slug text NOT NULL CHECK (package_slug ~ '^[a-z0-9]+(-[a-z0-9]+){0,4}$'),
  package_version text NOT NULL CHECK (package_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS download_events_user_idx ON kubcode_accounts.download_events (user_id, created_at);

ALTER TABLE kubcode_accounts.download_events ENABLE ROW LEVEL SECURITY;

-- Runtime role: append and read only. The log is never edited by the app.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kubcode_app') THEN
    RAISE NOTICE 'kubcode_app role not found; runtime grants for 0003 skipped';
    RETURN;
  END IF;
  GRANT USAGE ON SCHEMA kubcode_accounts TO kubcode_app;
  GRANT SELECT, INSERT ON kubcode_accounts.download_events TO kubcode_app;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'kubcode_accounts' AND tablename = 'download_events' AND policyname = 'kubcode_server_access'
  ) THEN
    CREATE POLICY kubcode_server_access ON kubcode_accounts.download_events
      FOR ALL TO kubcode_app USING (true) WITH CHECK (true);
  END IF;
END
$$;

-- Schema-wide, like 0002: also covers the identity sequence of the new table.
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
