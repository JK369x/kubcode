-- 0010: Instagram comment → DM (docs/design/ig-comment-dm.md §4).
-- Additive. Rules are written by members through the web app (RLS by
-- workspace); received comments and the DM ledger are written by the Lambda
-- role only. Comment text is matched when it arrives and never stored.

CREATE TABLE IF NOT EXISTS kubcode_accounts.automation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES kubcode_accounts.channels (id) ON DELETE CASCADE,
  keywords text[] NOT NULL CHECK (cardinality(keywords) BETWEEN 1 AND 20),
  match_mode text NOT NULL DEFAULT 'contains' CHECK (match_mode IN ('contains', 'exact')),
  -- NULL: every post of the channel; otherwise the platform's post id.
  platform_post_id text CHECK (platform_post_id IS NULL OR char_length(platform_post_id) BETWEEN 1 AND 128),
  -- Instagram comments are capped at 2,200 characters, DMs at about 1,000.
  public_reply text CHECK (public_reply IS NULL OR char_length(public_reply) BETWEEN 1 AND 2200),
  dm_text text NOT NULL CHECK (char_length(dm_text) BETWEEN 1 AND 1000),
  -- after_dm (default, owner 2026-11-10): the public reply only after a sent DM.
  reply_policy text NOT NULL DEFAULT 'after_dm' CHECK (reply_policy IN ('after_dm', 'always')),
  active boolean NOT NULL DEFAULT true,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS automation_rules_channel_idx ON kubcode_accounts.automation_rules (channel_id);

-- Inbox item: one received comment, deduplicated by the provider's comment id.
CREATE TABLE IF NOT EXISTS kubcode_accounts.comment_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES kubcode_accounts.channels (id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider ~ '^[a-z]{1,20}$'),
  comment_id text NOT NULL CHECK (char_length(comment_id) BETWEEN 1 AND 128),
  platform_post_id text NOT NULL CHECK (char_length(platform_post_id) BETWEEN 1 AND 128),
  author_id text NOT NULL CHECK (char_length(author_id) BETWEEN 1 AND 128),
  commented_at timestamptz,
  received_at timestamptz NOT NULL DEFAULT now(),
  -- The rule chosen on arrival (NULL: none matched); the text is not kept.
  rule_id uuid REFERENCES kubcode_accounts.automation_rules (id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done')),
  outcome text CHECK (outcome IS NULL OR outcome ~ '^[a-z_]{1,40}$'),
  processed_at timestamptz,
  CONSTRAINT comment_items_ref UNIQUE (provider, comment_id)
);
CREATE INDEX IF NOT EXISTS comment_items_pending_idx
  ON kubcode_accounts.comment_items (received_at) WHERE status = 'pending';

-- One DM per person per post. The private reply has no idempotency key at the
-- provider and Instagram allows one per comment, so dm_sending is written
-- before the call and a row left in it becomes dm_unknown, never retried.
CREATE TABLE IF NOT EXISTS kubcode_accounts.dm_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES kubcode_accounts.channels (id) ON DELETE CASCADE,
  platform_post_id text NOT NULL CHECK (char_length(platform_post_id) BETWEEN 1 AND 128),
  author_id text NOT NULL CHECK (char_length(author_id) BETWEEN 1 AND 128),
  comment_item_id uuid NOT NULL REFERENCES kubcode_accounts.comment_items (id) ON DELETE CASCADE,
  rule_id uuid REFERENCES kubcode_accounts.automation_rules (id) ON DELETE SET NULL,
  dm_state text NOT NULL DEFAULT 'claimed'
    CHECK (dm_state IN ('claimed', 'dm_sending', 'dm_sent', 'dm_failed', 'dm_unknown', 'dm_consumed')),
  reply_state text NOT NULL DEFAULT 'none' CHECK (reply_state IN ('none', 'sent', 'failed', 'skipped')),
  error_code text CHECK (error_code IS NULL OR error_code ~ '^[a-z_]{1,40}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dm_ledger_once UNIQUE (channel_id, platform_post_id, author_id)
);
CREATE INDEX IF NOT EXISTS dm_ledger_month_idx ON kubcode_accounts.dm_ledger (channel_id, created_at);

ALTER TABLE kubcode_accounts.automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE kubcode_accounts.comment_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE kubcode_accounts.dm_ledger ENABLE ROW LEVEL SECURITY;

-- Web app role: members manage their channels' rules and read outcomes and
-- counts; never the commenters' ids.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kubcode_app') THEN
    RAISE NOTICE 'kubcode_app role not found; runtime grants for 0010 skipped';
    RETURN;
  END IF;
  GRANT SELECT, INSERT, DELETE,
        UPDATE (keywords, match_mode, platform_post_id, public_reply, dm_text, reply_policy, active, position, updated_at)
     ON kubcode_accounts.automation_rules TO kubcode_app;
  GRANT SELECT (id, channel_id, platform_post_id, received_at, rule_id, status, outcome, processed_at)
     ON kubcode_accounts.comment_items TO kubcode_app;
  GRANT SELECT (id, channel_id, platform_post_id, rule_id, dm_state, reply_state, error_code, created_at)
     ON kubcode_accounts.dm_ledger TO kubcode_app;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'kubcode_accounts'
                 AND tablename = 'automation_rules' AND policyname = 'kubcode_member_scope') THEN
    CREATE POLICY kubcode_member_scope ON kubcode_accounts.automation_rules FOR ALL TO kubcode_app
      USING (channel_id IN (SELECT c.id FROM kubcode_accounts.channels c
                             JOIN kubcode_accounts.workspace_members m ON m.workspace_id = c.workspace_id
                            WHERE m.user_id = nullif(current_setting('kubcode.user_id', true), '')::uuid))
      WITH CHECK (channel_id IN (SELECT c.id FROM kubcode_accounts.channels c
                                  JOIN kubcode_accounts.workspace_members m ON m.workspace_id = c.workspace_id
                                 WHERE m.user_id = nullif(current_setting('kubcode.user_id', true), '')::uuid));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'kubcode_accounts'
                 AND tablename = 'comment_items' AND policyname = 'kubcode_member_scope') THEN
    CREATE POLICY kubcode_member_scope ON kubcode_accounts.comment_items FOR SELECT TO kubcode_app
      USING (channel_id IN (SELECT c.id FROM kubcode_accounts.channels c
                             JOIN kubcode_accounts.workspace_members m ON m.workspace_id = c.workspace_id
                            WHERE m.user_id = nullif(current_setting('kubcode.user_id', true), '')::uuid));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'kubcode_accounts'
                 AND tablename = 'dm_ledger' AND policyname = 'kubcode_member_scope') THEN
    CREATE POLICY kubcode_member_scope ON kubcode_accounts.dm_ledger FOR SELECT TO kubcode_app
      USING (channel_id IN (SELECT c.id FROM kubcode_accounts.channels c
                             JOIN kubcode_accounts.workspace_members m ON m.workspace_id = c.workspace_id
                            WHERE m.user_id = nullif(current_setting('kubcode.user_id', true), '')::uuid));
  END IF;
END
$$;

-- Lambda role: reads rules; records comments and the ledger. No deletes.
DO $$
DECLARE
  tab text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kubcode_worker') THEN
    CREATE ROLE kubcode_worker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
  GRANT USAGE ON SCHEMA kubcode_accounts TO kubcode_worker;
  GRANT SELECT ON kubcode_accounts.automation_rules TO kubcode_worker;
  GRANT SELECT, INSERT, UPDATE (rule_id, status, outcome, processed_at)
     ON kubcode_accounts.comment_items TO kubcode_worker;
  GRANT SELECT, INSERT, UPDATE (dm_state, reply_state, error_code, updated_at)
     ON kubcode_accounts.dm_ledger TO kubcode_worker;
  FOREACH tab IN ARRAY ARRAY['automation_rules', 'comment_items', 'dm_ledger'] LOOP
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

REVOKE ALL ON kubcode_accounts.automation_rules, kubcode_accounts.comment_items, kubcode_accounts.dm_ledger FROM PUBLIC;
DO $$
DECLARE
  api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON kubcode_accounts.automation_rules, kubcode_accounts.comment_items, kubcode_accounts.dm_ledger FROM %I', api_role);
    END IF;
  END LOOP;
END
$$;
