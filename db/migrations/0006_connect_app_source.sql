-- 0006_connect_app_source: which app a connection is made through
-- (docs/design/settings-keys.md §2a, ADR 0003): kubcode's shared app or the
-- member's own app (BYOK). Chosen by the web host at Connect time, kept on the
-- intent for the exchange and on the connection for refresh and revoke.
-- Additive only: new columns with a default, plus column grants.

ALTER TABLE kubcode_accounts.oauth_connect_intents
  ADD COLUMN IF NOT EXISTS app_source text NOT NULL DEFAULT 'member'
  CHECK (app_source IN ('kubcode', 'member'));

ALTER TABLE kubcode_accounts.oauth_connections
  ADD COLUMN IF NOT EXISTS app_source text NOT NULL DEFAULT 'member'
  CHECK (app_source IN ('kubcode', 'member'));

-- 0004 gave kubcode_app column-level SELECT lists, so the new columns must be
-- added to them; INSERT is table-level already. The worker reads whole rows
-- and may switch a connection's app when the member reconnects.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kubcode_app') THEN
    GRANT SELECT (app_source) ON kubcode_accounts.oauth_connect_intents TO kubcode_app;
    GRANT SELECT (app_source) ON kubcode_accounts.oauth_connections TO kubcode_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kubcode_worker') THEN
    GRANT UPDATE (app_source) ON kubcode_accounts.oauth_connections TO kubcode_worker;
  END IF;
END
$$;
