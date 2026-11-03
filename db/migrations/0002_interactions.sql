-- 0002_interactions: stars and comments on tool and skill pages, comment
-- reports, and a minimal owner flag. Same private schema and rules as 0001:
-- schema-qualified, idempotent, RLS on with no policies here (the server
-- role's policy lives in db/runtime-role-grants.sql), nothing for PUBLIC or
-- the Supabase API roles. Applied only by the explicit migration runner.

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
