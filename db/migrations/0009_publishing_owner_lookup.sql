-- 0009_publishing_owner_lookup: the publishing Lambda's ops function (the
-- owner's CLI, reached only through IAM) acts for the site owner, so the
-- Lambda role may read who the owner is: three columns of users, nothing
-- else (no identities, no emails). Additive only.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kubcode_worker') THEN
    CREATE ROLE kubcode_worker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
  GRANT USAGE ON SCHEMA kubcode_accounts TO kubcode_worker;
  GRANT SELECT (id, is_owner, status) ON kubcode_accounts.users TO kubcode_worker;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'kubcode_accounts' AND tablename = 'users' AND policyname = 'kubcode_worker_owner_lookup'
  ) THEN
    CREATE POLICY kubcode_worker_owner_lookup ON kubcode_accounts.users FOR SELECT TO kubcode_worker
      USING (is_owner AND status = 'active');
  END IF;
END
$$;
