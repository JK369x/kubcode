-- Operator-only grants for kubcode_app on the 0002_interactions tables.
-- Run as schema owner AFTER 0002_interactions and after runtime-role-grants.sql.
-- Minimal: no DELETE on comments (deletes are soft), no UPDATE on stars,
-- toggles or reports. users keeps its 0001 grants (is_owner is read only by
-- the app; operators set it with SQL as the owner role).
GRANT SELECT, INSERT, DELETE ON kubcode_accounts.page_stars TO kubcode_app;
GRANT SELECT, INSERT ON kubcode_accounts.star_toggles TO kubcode_app;
GRANT SELECT, INSERT, UPDATE ON kubcode_accounts.page_comments TO kubcode_app;
GRANT SELECT, INSERT ON kubcode_accounts.comment_reports TO kubcode_app;
DO $$
DECLARE tab text;
BEGIN
  FOREACH tab IN ARRAY ARRAY['page_stars','star_toggles','page_comments','comment_reports'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname='kubcode_accounts'
      AND tablename=tab AND policyname='kubcode_server_access'
    ) THEN
      EXECUTE format('CREATE POLICY kubcode_server_access ON kubcode_accounts.%I FOR ALL TO kubcode_app USING (true) WITH CHECK (true)',tab);
    END IF;
  END LOOP;
END $$;
-- Make the owner: UPDATE kubcode_accounts.users SET is_owner = true WHERE id = '<uuid>';
