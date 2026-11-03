-- Operator-only grants for the already-created scoped LOGIN role kubcode_app.
-- Run as schema owner AFTER 0001_accounts and AFTER securely provisioning its
-- SCRAM login password. No password/URL belongs in this file.
-- These policies trust only the server DB role, never browser API roles.
GRANT CONNECT ON DATABASE postgres TO kubcode_app;
GRANT USAGE ON SCHEMA kubcode_accounts TO kubcode_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  kubcode_accounts.users,
  kubcode_accounts.user_identities,
  kubcode_accounts.account_link_intents,
  kubcode_accounts.account_audit_events
TO kubcode_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA kubcode_accounts TO kubcode_app;
DO $$
DECLARE tab text;
BEGIN
  FOREACH tab IN ARRAY ARRAY['users','user_identities','account_link_intents','account_audit_events'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname='kubcode_accounts'
      AND tablename=tab AND policyname='kubcode_server_access'
    ) THEN
      EXECUTE format('CREATE POLICY kubcode_server_access ON kubcode_accounts.%I FOR ALL TO kubcode_app USING (true) WITH CHECK (true)',tab);
    END IF;
  END LOOP;
END $$;
-- No schema CREATE, migration-ledger access, TRUNCATE, role/DB creation,
-- superuser or BYPASSRLS grants. PUBLIC/anon/authenticated remain revoked.
