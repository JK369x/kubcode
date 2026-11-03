-- 0002_interactions: stars and comments on tool and skill pages, comment
-- reports, a minimal owner flag and the public comment name. Same private
-- schema and rules as 0001: schema-qualified, idempotent, purely additive
-- (no data rewrites), RLS on, nothing for PUBLIC or the Supabase API roles.
-- Applied only by the explicit migration runner. Unlike 0001, this file also
-- grants the runtime role kubcode_app exactly what the app needs, so one
-- migration fully opens the new tables (no separate operator grants step).

-- Owner: may hide comments. Set by an operator with SQL; no UI grants it.
ALTER TABLE kubcode_accounts.users ADD COLUMN IF NOT EXISTS is_owner boolean NOT NULL DEFAULT false;

-- Name shown with comments. NULL = not chosen yet (the provider display name
-- is shown); '' = member cleared it (the generic fallback is shown).
ALTER TABLE kubcode_accounts.users ADD COLUMN IF NOT EXISTS public_name text
  CHECK (public_name IS NULL OR char_length(public_name) <= 40);

-- Pages are addressed by kind + stable ASCII slug (PRD SEO slug rule).
CREATE TABLE IF NOT EXISTS kubcode_accounts.page_stars (
  user_id uuid NOT NULL REFERENCES kubcode_accounts.users (id) ON DELETE CASCADE,
  page_kind text NOT NULL CHECK (page_kind IN ('tool', 'skill')),
  page_slug text NOT NULL CHECK (page_slug ~ '^[a-z0-9]+(-[a-z0-9]+){0,4}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, page_kind, page_slug)
);
CREATE INDEX IF NOT EXISTS page_stars_page_idx ON kubcode_accounts.page_stars (page_kind, page_slug);

-- One row per star/unstar, so the hourly toggle limit survives unstarring.
CREATE TABLE IF NOT EXISTS kubcode_accounts.star_toggles (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES kubcode_accounts.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS star_toggles_user_idx ON kubcode_accounts.star_toggles (user_id, created_at);

-- Plain-text comments, one reply level (enforced by the store under a row
-- lock on the parent). A deleted comment keeps its row for reply threading
-- and limit counting, but its text is wiped.
CREATE TABLE IF NOT EXISTS kubcode_accounts.page_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES kubcode_accounts.users (id) ON DELETE CASCADE,
  page_kind text NOT NULL CHECK (page_kind IN ('tool', 'skill')),
  page_slug text NOT NULL CHECK (page_slug ~ '^[a-z0-9]+(-[a-z0-9]+){0,4}$'),
  parent_id uuid REFERENCES kubcode_accounts.page_comments (id) ON DELETE CASCADE,
  body text CHECK (body IS NULL OR char_length(body) BETWEEN 1 AND 2000),
  -- SHA-256 of the normalized text, for the duplicate check; wiped on delete.
  body_hash bytea CHECK (body_hash IS NULL OR octet_length(body_hash) = 32),
  status text NOT NULL DEFAULT 'visible' CHECK (status IN ('visible', 'hidden', 'deleted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz,
  -- Set while hidden by the owner and kept if the author later deletes it,
  -- so a moderated thread never resurfaces as a deleted anchor.
  moderated_at timestamptz,
  CONSTRAINT page_comments_hidden_moderated CHECK (status <> 'hidden' OR moderated_at IS NOT NULL),
  CONSTRAINT page_comments_deleted_wiped CHECK (
    (status = 'deleted') = (body IS NULL) AND (body IS NULL) = (body_hash IS NULL)
  ),
  CONSTRAINT page_comments_not_own_parent CHECK (parent_id IS NULL OR parent_id <> id)
);
CREATE INDEX IF NOT EXISTS page_comments_page_idx
  ON kubcode_accounts.page_comments (page_kind, page_slug, created_at);
CREATE INDEX IF NOT EXISTS page_comments_user_idx ON kubcode_accounts.page_comments (user_id, created_at);
CREATE INDEX IF NOT EXISTS page_comments_parent_idx ON kubcode_accounts.page_comments (parent_id);

-- One report per user per comment. No free text: nothing to moderate twice.
CREATE TABLE IF NOT EXISTS kubcode_accounts.comment_reports (
  comment_id uuid NOT NULL REFERENCES kubcode_accounts.page_comments (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES kubcode_accounts.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, user_id)
);

ALTER TABLE kubcode_accounts.page_stars ENABLE ROW LEVEL SECURITY;
ALTER TABLE kubcode_accounts.star_toggles ENABLE ROW LEVEL SECURITY;
ALTER TABLE kubcode_accounts.page_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE kubcode_accounts.comment_reports ENABLE ROW LEVEL SECURITY;

-- Runtime role: minimal privileges plus a server-only RLS policy per table.
-- No DELETE on comments (deletes are soft), no UPDATE on stars, toggles or
-- reports. users already carries its 0001 grants (is_owner is set only by
-- operators). Skipped where the role does not exist (e.g. a fresh local DB).
DO $$
DECLARE
  tab text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kubcode_app') THEN
    RAISE NOTICE 'kubcode_app role not found; runtime grants for 0002 skipped';
    RETURN;
  END IF;
  GRANT USAGE ON SCHEMA kubcode_accounts TO kubcode_app;
  GRANT SELECT, INSERT, DELETE ON kubcode_accounts.page_stars TO kubcode_app;
  GRANT SELECT, INSERT ON kubcode_accounts.star_toggles TO kubcode_app;
  GRANT SELECT, INSERT, UPDATE ON kubcode_accounts.page_comments TO kubcode_app;
  GRANT SELECT, INSERT ON kubcode_accounts.comment_reports TO kubcode_app;
  FOREACH tab IN ARRAY ARRAY['page_stars', 'star_toggles', 'page_comments', 'comment_reports'] LOOP
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
