-- 0014: refunds and disputes on billing purchases (ADR 0008, amendment 2026-11-14).
-- Additive only: four nullable/defaulted columns, one index, column grants.
-- OWNER APPROVAL REQUIRED before Production applies it.
--
-- A revoked purchase keeps status 'paid' (the money was taken, then given back
-- or lost in a dispute); revoked_at excludes it from the entitlement. Status
-- values are not extended because that would mean dropping the 0013 CHECK.

ALTER TABLE kubcode_accounts.billing_purchases
  ADD COLUMN IF NOT EXISTS refunded_satang bigint NOT NULL DEFAULT 0
    CHECK (refunded_satang >= 0),
  ADD COLUMN IF NOT EXISTS dispute text
    CHECK (dispute IS NULL OR dispute IN ('open', 'won', 'lost')),
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_reason text
    CHECK (revoked_reason IS NULL OR revoked_reason IN ('refunded', 'dispute_lost'));

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'billing_purchases_revoked') THEN
    ALTER TABLE kubcode_accounts.billing_purchases
      ADD CONSTRAINT billing_purchases_revoked
      CHECK ((revoked_at IS NULL) = (revoked_reason IS NULL) AND (revoked_at IS NULL OR status = 'paid'));
  END IF;
END $$;

-- charge → payment_intent → purchase lookups from charge.* / dispute webhooks.
CREATE INDEX IF NOT EXISTS billing_purchases_payment_intent_idx
  ON kubcode_accounts.billing_purchases (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kubcode_app') THEN
    -- History labels on /account/billing (no Stripe ids).
    GRANT SELECT (refunded_satang, dispute, revoked_at, revoked_reason)
       ON kubcode_accounts.billing_purchases TO kubcode_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kubcode_billing') THEN
    GRANT SELECT (refunded_satang, dispute, revoked_at, revoked_reason),
          UPDATE (refunded_satang, dispute, revoked_at, revoked_reason)
       ON kubcode_accounts.billing_purchases TO kubcode_billing;
  END IF;
END $$;
