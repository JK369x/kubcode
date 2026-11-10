-- 0011_article_interactions: stars and comments on article pages too.
-- Widens the page_kind CHECK on page_stars and page_comments from
-- ('tool', 'skill') to ('tool', 'skill', 'article'). No rows are read, moved
-- or rewritten: every existing row already satisfies the wider rule.
--
-- PostgreSQL cannot alter a CHECK constraint in place, so each one is
-- replaced: the new constraint is added NOT VALID first (no table scan under
-- the ACCESS EXCLUSIVE lock), the old one is dropped, then the new one is
-- VALIDATEd (SHARE UPDATE EXCLUSIVE: reads and writes continue). All of it
-- runs inside the runner's single migration transaction, and re-running the
-- file is harmless.
--
-- The DROP CONSTRAINT statements are written out in plain SQL on purpose so
-- the CI migration gate sees them: this file needs the owner's approval
-- phrase ("approve 0011_article_interactions") before it runs in production.
-- Nothing here deletes data.

-- New, wider rules (skipped when a re-run finds them already there).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'page_stars_page_kind_v2_check'
                    AND conrelid = 'kubcode_accounts.page_stars'::regclass) THEN
    ALTER TABLE kubcode_accounts.page_stars
      ADD CONSTRAINT page_stars_page_kind_v2_check CHECK (page_kind IN ('tool', 'skill', 'article')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'page_comments_page_kind_v2_check'
                    AND conrelid = 'kubcode_accounts.page_comments'::regclass) THEN
    ALTER TABLE kubcode_accounts.page_comments
      ADD CONSTRAINT page_comments_page_kind_v2_check CHECK (page_kind IN ('tool', 'skill', 'article')) NOT VALID;
  END IF;
END
$$;

-- 0002's inline CHECKs carry PostgreSQL's default names.
ALTER TABLE kubcode_accounts.page_stars DROP CONSTRAINT IF EXISTS page_stars_page_kind_check;
ALTER TABLE kubcode_accounts.page_comments DROP CONSTRAINT IF EXISTS page_comments_page_kind_check;

ALTER TABLE kubcode_accounts.page_stars VALIDATE CONSTRAINT page_stars_page_kind_v2_check;
ALTER TABLE kubcode_accounts.page_comments VALIDATE CONSTRAINT page_comments_page_kind_v2_check;

-- Fail (and roll back everything) rather than leave an older, narrower
-- page_kind rule in place under some other name.
DO $$
DECLARE
  leftover text;
BEGIN
  SELECT conrelid::regclass || '.' || conname INTO leftover FROM pg_constraint
   WHERE conrelid IN ('kubcode_accounts.page_stars'::regclass, 'kubcode_accounts.page_comments'::regclass)
     AND contype = 'c'
     AND conname NOT IN ('page_stars_page_kind_v2_check', 'page_comments_page_kind_v2_check')
     AND pg_get_constraintdef(oid) LIKE '%page_kind%'
   LIMIT 1;
  IF leftover IS NOT NULL THEN
    RAISE EXCEPTION '0011: unexpected page_kind constraint %', leftover;
  END IF;
END
$$;

-- Community feed ("latest comments" across all pages, newest first).
CREATE INDEX IF NOT EXISTS page_comments_recent_idx
  ON kubcode_accounts.page_comments (created_at DESC, id DESC) WHERE status = 'visible';
