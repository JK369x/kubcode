-- 0005_owner_flag: make the site owner's account the owner (users.is_owner,
-- added in 0002). This replaces the owner-run .qa/ops/set-owner-flag.sh: data
-- changes go through migrations. It contains an UPDATE, so the CI migration
-- gate stops for the owner's approval phrase before it runs in production.
--
-- Guarded and idempotent. It changes nothing (and only raises a NOTICE) when
-- any owner already exists, or when the target is not an active user with a
-- Google identity. A failed guard must not block every later deploy, so it
-- never raises an error.
DO $$
DECLARE
  -- The owner's Google-linked account, identified read-only on 2026-11-03.
  target constant uuid := 'd1ce43fa-2a4e-4f4a-9755-f5d8deb595c4';
BEGIN
  IF EXISTS (SELECT 1 FROM kubcode_accounts.users WHERE is_owner) THEN
    RAISE NOTICE '0005_owner_flag: an owner already exists; nothing changed';
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1
      FROM kubcode_accounts.users u
      JOIN kubcode_accounts.user_identities i ON i.user_id = u.id AND i.provider = 'google'
     WHERE u.id = target AND u.status = 'active'
  ) THEN
    RAISE NOTICE '0005_owner_flag: target is not an active Google-linked user; nothing changed';
    RETURN;
  END IF;
  UPDATE kubcode_accounts.users SET is_owner = true, updated_at = now() WHERE id = target;
  INSERT INTO kubcode_accounts.account_audit_events (user_id, event, provider)
  VALUES (target, 'operator_owner_granted', 'google');
  RAISE NOTICE '0005_owner_flag: owner flag granted';
END
$$;
