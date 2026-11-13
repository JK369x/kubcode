-- 0012_plan_waitlist: "แจ้งฉันเมื่อเปิด" on /pricing (coming-soon plans) and
-- /roadmap (items not open yet). One row per member per target; the member
-- toggles it on and off. Purely additive (new table, index, RLS, grants), the
-- same private-schema rules as 0002. No email is stored or sent: the row only
-- records interest, keyed by the internal user id.

CREATE TABLE IF NOT EXISTS kubcode_accounts.plan_waitlist (
  user_id uuid NOT NULL REFERENCES kubcode_accounts.users (id) ON DELETE CASCADE,
  -- 'plan' = an id in lib/plans.ts, 'roadmap' = an id in lib/roadmap.ts.
  -- The app accepts only ids that exist and are not open yet.
  target_kind text NOT NULL CHECK (target_kind IN ('plan', 'roadmap')),
  target_id text NOT NULL CHECK (target_id ~ '^[a-z0-9]+(-[a-z0-9]+){0,5}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, target_kind, target_id)
);
-- Owner counts per target.
CREATE INDEX IF NOT EXISTS plan_waitlist_target_idx ON kubcode_accounts.plan_waitlist (target_kind, target_id);

-- One row per join/leave, so the hourly toggle limit survives leaving.
CREATE TABLE IF NOT EXISTS kubcode_accounts.waitlist_toggles (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES kubcode_accounts.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS waitlist_toggles_user_idx ON kubcode_accounts.waitlist_toggles (user_id, created_at);

ALTER TABLE kubcode_accounts.plan_waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE kubcode_accounts.waitlist_toggles ENABLE ROW LEVEL SECURITY;

-- Runtime role: the minimum the app needs plus a server-only RLS policy.
-- Skipped where the role does not exist (e.g. a fresh local DB).
DO $$
DECLARE
  tab text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kubcode_app') THEN
    RAISE NOTICE 'kubcode_app role not found; runtime grants for 0012 skipped';
    RETURN;
  END IF;
  GRANT USAGE ON SCHEMA kubcode_accounts TO kubcode_app;
  GRANT SELECT, INSERT, DELETE ON kubcode_accounts.plan_waitlist TO kubcode_app;
  GRANT SELECT, INSERT ON kubcode_accounts.waitlist_toggles TO kubcode_app;
  FOREACH tab IN ARRAY ARRAY['plan_waitlist', 'waitlist_toggles'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
       WHERE schemaname = 'kubcode_accounts' AND tablename = tab AND policyname = 'kubcode_server_access'
    ) THEN
      EXECUTE format(
        'CREATE POLICY kubcode_server_access ON kubcode_accounts.%I FOR ALL TO kubcode_app USING (true) WITH CHECK (true)',
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
