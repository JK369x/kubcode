-- 0016: a member's first checkout creates their workspace (ADR 0008).
-- Until now only the publishing Lambda created workspaces, and the web reaches
-- it only for paid members, so a first-time buyer had no workspace to pay for.
-- The billing role gets INSERT on the two tables; the kubcode_billing_access
-- policies from 0013 already cover them. Additive; no data change.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kubcode_billing') THEN
    RAISE NOTICE 'kubcode_billing role not found; grants for 0016 skipped';
    RETURN;
  END IF;
  GRANT INSERT ON kubcode_accounts.workspaces TO kubcode_billing;
  GRANT INSERT ON kubcode_accounts.workspace_members TO kubcode_billing;
END
$$;
