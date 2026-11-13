-- 0013_billing: kubcode Social month pass (ADR 0008, docs/design/billing-stripe.md §4.4).
--
-- ADDITIVE ONLY: five new tables, indexes, RLS, grants and one new role
-- (kubcode_billing). No existing table, column or row is changed or removed.
-- THE OWNER APPROVES THIS MIGRATION BEFORE IT RUNS IN PRODUCTION.
--
-- Who writes what:
-- - kubcode_billing (the billing Lambda) writes purchases, entitlements,
--   Stripe event ids, reminders and channel pauses. It holds the Stripe key.
-- - kubcode_app (the web host) only READS its own workspace's rows, so
--   /account/billing can show the pass and the banner; it never grants slots.
-- - kubcode_worker (the publishing Lambda) reads entitlements and pauses to
--   gate publishing and automations.
-- Stripe ids (session, payment intent) are readable by kubcode_billing only.

CREATE TABLE IF NOT EXISTS kubcode_accounts.billing_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES kubcode_accounts.workspaces (id) ON DELETE CASCADE,
  -- Who pressed pay (for support). Money records outlive a deleted user: SET NULL.
  user_id uuid REFERENCES kubcode_accounts.users (id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('new', 'renew', 'add')),
  slots integer NOT NULL CHECK (slots BETWEEN 1 AND 50),
  amount_satang bigint NOT NULL CHECK (amount_satang >= 1000),
  currency text NOT NULL DEFAULT 'thb' CHECK (currency = 'thb'),
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'expired')),
  -- Set when Stripe says paid but amount/currency differ: never granted, owner reviews.
  review_code text CHECK (review_code IS NULL OR review_code ~ '^[a-z_]{1,40}$'),
  stripe_checkout_session_id text UNIQUE CHECK (stripe_checkout_session_id IS NULL OR stripe_checkout_session_id ~ '^cs_(test|live)_[A-Za-z0-9]{1,200}$'),
  stripe_payment_intent_id text CHECK (stripe_payment_intent_id IS NULL OR stripe_payment_intent_id ~ '^pi_[A-Za-z0-9]{1,200}$'),
  payment_method text CHECK (payment_method IS NULL OR payment_method IN ('card', 'promptpay')),
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  closed_at timestamptz,
  CONSTRAINT billing_purchases_period CHECK (period_end > period_start),
  CONSTRAINT billing_purchases_paid_at CHECK ((status = 'paid') = (paid_at IS NOT NULL)),
  CONSTRAINT billing_purchases_closed_at CHECK ((status IN ('failed', 'expired')) = (closed_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS billing_purchases_workspace_idx
  ON kubcode_accounts.billing_purchases (workspace_id, status, period_end);

-- Derived from paid purchases, written in the same transaction as each
-- fulfilment so reads are one row. Rebuildable from billing_purchases.
CREATE TABLE IF NOT EXISTS kubcode_accounts.billing_entitlements (
  workspace_id uuid PRIMARY KEY REFERENCES kubcode_accounts.workspaces (id) ON DELETE CASCADE,
  slots integer NOT NULL CHECK (slots BETWEEN 0 AND 50),
  period_start timestamptz,
  paid_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Stripe webhook dedupe: insert first; a conflict means "already handled".
CREATE TABLE IF NOT EXISTS kubcode_accounts.stripe_events (
  event_id text PRIMARY KEY CHECK (event_id ~ '^evt_[A-Za-z0-9]{1,200}$'),
  type text NOT NULL CHECK (char_length(type) BETWEEN 1 AND 100),
  livemode boolean NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);

-- In-site reminders shown (no email). One row per workspace, pass end and kind,
-- so a reminder is recorded once and the banner can be dismissed.
CREATE TABLE IF NOT EXISTS kubcode_accounts.billing_reminders (
  workspace_id uuid NOT NULL REFERENCES kubcode_accounts.workspaces (id) ON DELETE CASCADE,
  paid_until timestamptz NOT NULL,
  kind text NOT NULL CHECK (kind IN ('t7', 't3', 't0', 'grace', 'paused')),
  shown_at timestamptz NOT NULL DEFAULT now(),
  dismissed_at timestamptz,
  PRIMARY KEY (workspace_id, paid_until, kind)
);

-- A channel paused by billing (past grace, or over the paid slot count).
-- Nothing is deleted: the channel and its connection stay; publishing and
-- automations skip it. After 14 days paused it is disconnected from Zernio
-- (disconnected_at set by the sweep). Resumed rows keep their history.
CREATE TABLE IF NOT EXISTS kubcode_accounts.billing_channel_pauses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES kubcode_accounts.channels (id) ON DELETE CASCADE,
  paused_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL CHECK (reason IN ('lapsed', 'over_slots')),
  disconnected_at timestamptz,
  resumed_at timestamptz,
  CONSTRAINT billing_channel_pauses_order CHECK (
    (disconnected_at IS NULL OR disconnected_at >= paused_at) AND (resumed_at IS NULL OR resumed_at >= paused_at))
);
-- At most one open pause per channel.
CREATE UNIQUE INDEX IF NOT EXISTS billing_channel_pauses_open
  ON kubcode_accounts.billing_channel_pauses (channel_id) WHERE resumed_at IS NULL;

ALTER TABLE kubcode_accounts.billing_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE kubcode_accounts.billing_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE kubcode_accounts.stripe_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE kubcode_accounts.billing_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE kubcode_accounts.billing_channel_pauses ENABLE ROW LEVEL SECURITY;

-- Web app role: read-only, own workspaces only, no Stripe ids. Dismissing a
-- banner is the one write (dismissed_at on its own reminder rows).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kubcode_app') THEN
    RAISE NOTICE 'kubcode_app role not found; web grants for 0013 skipped';
    RETURN;
  END IF;
  GRANT USAGE ON SCHEMA kubcode_accounts TO kubcode_app;
  GRANT SELECT (id, workspace_id, kind, slots, amount_satang, currency, period_start, period_end, status,
                payment_method, created_at, paid_at, closed_at)
     ON kubcode_accounts.billing_purchases TO kubcode_app;
  GRANT SELECT ON kubcode_accounts.billing_entitlements TO kubcode_app;
  GRANT SELECT, UPDATE (dismissed_at) ON kubcode_accounts.billing_reminders TO kubcode_app;
  GRANT SELECT ON kubcode_accounts.billing_channel_pauses TO kubcode_app;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'kubcode_accounts'
                 AND tablename = 'billing_purchases' AND policyname = 'kubcode_member_scope') THEN
    CREATE POLICY kubcode_member_scope ON kubcode_accounts.billing_purchases FOR SELECT TO kubcode_app
      USING (workspace_id IN (SELECT m.workspace_id FROM kubcode_accounts.workspace_members m
                               WHERE m.user_id = nullif(current_setting('kubcode.user_id', true), '')::uuid));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'kubcode_accounts'
                 AND tablename = 'billing_entitlements' AND policyname = 'kubcode_member_scope') THEN
    CREATE POLICY kubcode_member_scope ON kubcode_accounts.billing_entitlements FOR SELECT TO kubcode_app
      USING (workspace_id IN (SELECT m.workspace_id FROM kubcode_accounts.workspace_members m
                               WHERE m.user_id = nullif(current_setting('kubcode.user_id', true), '')::uuid));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'kubcode_accounts'
                 AND tablename = 'billing_reminders' AND policyname = 'kubcode_member_scope') THEN
    CREATE POLICY kubcode_member_scope ON kubcode_accounts.billing_reminders FOR ALL TO kubcode_app
      USING (workspace_id IN (SELECT m.workspace_id FROM kubcode_accounts.workspace_members m
                               WHERE m.user_id = nullif(current_setting('kubcode.user_id', true), '')::uuid))
      WITH CHECK (workspace_id IN (SELECT m.workspace_id FROM kubcode_accounts.workspace_members m
                               WHERE m.user_id = nullif(current_setting('kubcode.user_id', true), '')::uuid));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'kubcode_accounts'
                 AND tablename = 'billing_channel_pauses' AND policyname = 'kubcode_member_scope') THEN
    CREATE POLICY kubcode_member_scope ON kubcode_accounts.billing_channel_pauses FOR SELECT TO kubcode_app
      USING (channel_id IN (SELECT c.id FROM kubcode_accounts.channels c
                             JOIN kubcode_accounts.workspace_members m ON m.workspace_id = c.workspace_id
                            WHERE m.user_id = nullif(current_setting('kubcode.user_id', true), '')::uuid));
  END IF;
END
$$;

-- Publishing Lambda role: reads entitlements and pauses to gate work.
DO $$
DECLARE
  tab text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kubcode_worker') THEN
    RAISE NOTICE 'kubcode_worker role not found; worker grants for 0013 skipped';
    RETURN;
  END IF;
  GRANT SELECT ON kubcode_accounts.billing_entitlements TO kubcode_worker;
  GRANT SELECT ON kubcode_accounts.billing_channel_pauses TO kubcode_worker;
  FOREACH tab IN ARRAY ARRAY['billing_entitlements', 'billing_channel_pauses'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'kubcode_accounts'
                   AND tablename = tab AND policyname = 'kubcode_worker_read') THEN
      EXECUTE format('CREATE POLICY kubcode_worker_read ON kubcode_accounts.%I FOR SELECT TO kubcode_worker USING (true)', tab);
    END IF;
  END LOOP;
END
$$;

-- Billing Lambda role: its own tables, plus the reads it needs to price and
-- sweep (workspaces, members, owner flag, channels and their connections).
-- No DDL, no deletes anywhere: money records are kept.
DO $$
DECLARE
  tab text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kubcode_billing') THEN
    CREATE ROLE kubcode_billing NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
  GRANT USAGE ON SCHEMA kubcode_accounts TO kubcode_billing;
  GRANT SELECT, INSERT, UPDATE (status, review_code, stripe_checkout_session_id, stripe_payment_intent_id,
                                payment_method, paid_at, closed_at)
     ON kubcode_accounts.billing_purchases TO kubcode_billing;
  GRANT SELECT, INSERT, UPDATE (slots, period_start, paid_until, updated_at)
     ON kubcode_accounts.billing_entitlements TO kubcode_billing;
  GRANT SELECT, INSERT ON kubcode_accounts.stripe_events TO kubcode_billing;
  GRANT SELECT, INSERT ON kubcode_accounts.billing_reminders TO kubcode_billing;
  GRANT SELECT, INSERT, UPDATE (disconnected_at, resumed_at) ON kubcode_accounts.billing_channel_pauses TO kubcode_billing;
  GRANT SELECT ON kubcode_accounts.workspaces TO kubcode_billing;
  GRANT SELECT ON kubcode_accounts.workspace_members TO kubcode_billing;
  GRANT SELECT (id, is_owner, status) ON kubcode_accounts.users TO kubcode_billing;
  GRANT SELECT (id, workspace_id, platform, created_at) ON kubcode_accounts.channels TO kubcode_billing;
  GRANT SELECT (id, channel_id, provider, status) ON kubcode_accounts.channel_connections TO kubcode_billing;
  FOREACH tab IN ARRAY ARRAY['billing_purchases', 'billing_entitlements', 'stripe_events', 'billing_reminders',
                             'billing_channel_pauses', 'workspaces', 'workspace_members', 'users', 'channels',
                             'channel_connections'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'kubcode_accounts'
                   AND tablename = tab AND policyname = 'kubcode_billing_access') THEN
      EXECUTE format('CREATE POLICY kubcode_billing_access ON kubcode_accounts.%I FOR ALL TO kubcode_billing USING (true) WITH CHECK (true)', tab);
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
