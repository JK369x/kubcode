-- 0015: per-platform caption and options on a delivery (web composer
-- follow-up). Both are what the creator chose for that one channel, kept as
-- sent so the posts page can show them; absent means the shared caption and
-- the platform defaults. Additive, nullable, no backfill.
ALTER TABLE kubcode_accounts.deliveries
  ADD COLUMN IF NOT EXISTS caption text CHECK (caption IS NULL OR char_length(caption) <= 5000),
  ADD COLUMN IF NOT EXISTS options jsonb CHECK (options IS NULL OR (jsonb_typeof(options) = 'object' AND octet_length(options::text) <= 16384));

-- The web role reads them for /account/posts (RLS already scopes rows; it
-- has column grants on deliveries). The worker's table-level SELECT/INSERT
-- already covers new columns.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kubcode_app') THEN
    RAISE NOTICE 'kubcode_app role not found; web grants for 0015 skipped';
    RETURN;
  END IF;
  GRANT SELECT (caption, options) ON kubcode_accounts.deliveries TO kubcode_app;
END $$;
