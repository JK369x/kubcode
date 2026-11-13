#!/usr/bin/env bash
# Owner, once (ADR 0008): give the DB role kubcode_billing a login and store its
# connection URL as /kubcode/prod/billing-db-url for the billing Lambda.
#
#   infra/scripts/billing-db-url.sh
#
#   1. generates a strong password (hex, nothing to URL-encode)
#   2. puts `ALTER ROLE kubcode_billing LOGIN PASSWORD '<SCRAM verifier>'; GRANT CONNECT …`
#      on the clipboard (a SCRAM-SHA-256 verifier, so the plaintext password
#      never reaches the SQL editor or its history)
#   3. waits while you paste it into the Supabase SQL editor of project
#      kubcode-sg (pdoszbllzpgbspthcxis) and run it, then press Enter
#   4. connects AS kubcode_billing through the Session pooler (TLS verified
#      against db/certs/supabase-prod-ca.pem) and runs SELECT 1 plus a read of
#      its own tables; only if that works does it
#   5. write the URL to SSM (SecureString, alias/kubcode-secrets) from a 0600
#      temp file. The Lambda picks it up within 5 minutes.
#
# The URL follows /kubcode/prod/worker-db-url (same pooler, user
# <role>.<project ref>, port 5432, database postgres, sslmode=require). An admin
# cannot decrypt that parameter (by design), so the host is the same constant
# webhost.sh uses. Nothing secret is printed or put in argv. Re-running
# rotates the password (the old one stops working once you run the new SQL).
# Needs the admin AWS profile (account 955758449820) and psql (libpq).
set -euo pipefail
cd "$(dirname "$0")/../.."

REF=pdoszbllzpgbspthcxis
HOST=${KUBCODE_POOLER_HOST:-aws-0-ap-southeast-1.pooler.supabase.com}
REGION=ap-southeast-1
ACCOUNT=955758449820
CA=db/certs/supabase-prod-ca.pem
PARAM=/kubcode/prod/billing-db-url
PSQL=${PSQL:-$(command -v psql || echo /opt/homebrew/opt/libpq/bin/psql)}
export AWS_PROFILE="${AWS_PROFILE:-default}"

die() { echo "billing-db-url: $*" >&2; exit 2; }
say() { echo "billing-db-url: $*" >&2; }

[[ "$HOST" =~ ^[a-z0-9.-]+[.]pooler[.]supabase[.]com$ ]] || die "pooler host must be <something>.pooler.supabase.com"
[ -x "$PSQL" ] || die "psql not found (brew install libpq)"
[ -f "$CA" ] || die "missing $CA"
acct=$(aws sts get-caller-identity --query Account --output text 2>/dev/null) || die "no AWS credentials"
[ "$acct" = "$ACCOUNT" ] || die "wrong AWS account ($acct); use the kubcode admin profile"

TMP=$(mktemp -d)
chmod 700 "$TMP"
trap 'rm -rf "$TMP"; printf "" | pbcopy 2>/dev/null || true' EXIT

(umask 077 && openssl rand -hex 24 | tr -d '\n' >"$TMP/pw")
# SCRAM-SHA-256 verifier (same as move-db.sh): Postgres stores it as-is.
python3 - "$TMP/pw" >"$TMP/verifier" <<'PY'
import sys, os, hashlib, hmac, base64
pw = open(sys.argv[1], "rb").read(); salt = os.urandom(16); it = 4096
salted = hashlib.pbkdf2_hmac("sha256", pw, salt, it)
ck = hmac.new(salted, b"Client Key", "sha256").digest()
sk = hmac.new(salted, b"Server Key", "sha256").digest()
b = lambda x: base64.b64encode(x).decode()
print(f"SCRAM-SHA-256${it}:{b(salt)}${b(hashlib.sha256(ck).digest())}:{b(sk)}", end="")
PY
printf "ALTER ROLE kubcode_billing LOGIN PASSWORD '%s';\nGRANT CONNECT ON DATABASE postgres TO kubcode_billing;\n" "$(cat "$TMP/verifier")" | pbcopy
say "The SQL is on the clipboard. Paste it into the Supabase SQL editor (project kubcode-sg, $REF) and run it."
read -r -p "Then press Enter here (Ctrl-C to stop; nothing has been stored yet): " _
printf '' | pbcopy

# 4. Log in as kubcode_billing (verify-full against the pinned CA) before storing
# anything. The password goes through a 0600 pgpass file, never psql's argv.
(umask 077 && printf "%s:5432:postgres:kubcode_billing.%s:%s\n" "$HOST" "$REF" "$(cat "$TMP/pw")" >"$TMP/pgpass")
out=$(PGPASSFILE="$TMP/pgpass" PGCONNECT_TIMEOUT=15 "$PSQL" -X -q -t -A -v ON_ERROR_STOP=1 \
  "host=$HOST port=5432 dbname=postgres user=kubcode_billing.$REF sslmode=verify-full sslrootcert=$PWD/$CA" \
  -c "SELECT 1" -c "SELECT count(*) FROM kubcode_accounts.stripe_events" 2>&1) ||
  { printf '%s\n' "$out" | grep -v -i -E 'password|postgres(ql)?://' >&2; die "kubcode_billing cannot log in yet (did the SQL run in project $REF?). Nothing stored; run again."; }
unset out
say "kubcode_billing logs in through the pooler and reads its tables"

# 5. Store. sslmode=require: the Lambda forces TLS and verifies the Supabase CA
# built into the binary (kubcode-oauth-connect db.rs); tokio-postgres does not parse verify-full.
(umask 077 && printf "postgresql://kubcode_billing.%s:%s@%s:5432/postgres?sslmode=require" "$REF" "$(cat "$TMP/pw")" "$HOST" >"$TMP/url")
aws ssm put-parameter --region "$REGION" --type SecureString --key-id alias/kubcode-secrets \
  --overwrite --name "$PARAM" --value "file://$TMP/url" >/dev/null
say "$PARAM set; the billing Lambda picks it up within 5 minutes"
