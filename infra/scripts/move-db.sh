#!/usr/bin/env bash
# Move the kubcode accounts database from the old Supabase project (us-east-1)
# to the new one (ap-southeast-1, next to the Lightsail web box and the
# Lambdas), then point everything at it. Owner-run, once.
#
#   infra/scripts/move-db.sh
#
# What it does, in order (it stops at the first problem):
#   1. asks for the old and new Session pooler connection strings (hidden)
#   2. checks both databases, and that the new one is still empty
#   3. creates kubcode_app on the new database, runs every migration there,
#      applies db/runtime-role-grants.sql, and gives kubcode_worker a login
#   4. copies every kubcode_accounts row (one transaction) and compares each
#      table row by row
#   5. switches DATABASE_URL on the web box (restart + smoke, auto-restore on
#      failure), the GitHub secret MIGRATION_DATABASE_URL and the SSM
#      parameter /kubcode/prod/worker-db-url
#
# Secrets: the two postgres passwords are typed hidden; the kubcode_app and
# kubcode_worker passwords are generated here, sent to Postgres as SCRAM
# verifiers (never plaintext) and written straight to their destinations.
# Nothing secret is printed. The old project is left untouched.
#
# Run it from a checkout of main whose migrations match the old database.
# Don't use the site while it runs: writes made during the copy are not moved.
set -euo pipefail
cd "$(dirname "$0")/../.."

OLD_REF=sgtyrndczwxijrubyyjw
OLD_HOST=aws-0-us-east-1.pooler.supabase.com
NEW_REF=pdoszbllzpgbspthcxis
REPO=JK369x/kubcode
CA=db/certs/supabase-prod-ca.pem
export AWS_PROFILE="${AWS_PROFILE:-default}"
REGION=ap-southeast-1

PSQL=${PSQL:-$(command -v psql || echo /opt/homebrew/opt/libpq/bin/psql)}
PG_DUMP=${PG_DUMP:-$(command -v pg_dump || echo /opt/homebrew/opt/libpq/bin/pg_dump)}
TEST=${MOVE_DB_TEST:-0}

die() { echo "move-db: $*" >&2; exit 1; }
say() { echo "move-db: $*" >&2; }
[ -x "$PSQL" ] && [ -x "$PG_DUMP" ] || die "psql/pg_dump not found (brew install libpq)"

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
umask 077

# --- 1. Inputs
if [ "$TEST" = 1 ]; then
  OLD_URL=$MOVE_DB_OLD_URL OLD_PW=$MOVE_DB_OLD_PASSWORD
  NEW_URL=$MOVE_DB_NEW_URL NEW_PW=$MOVE_DB_NEW_PASSWORD
  NEW_HOST=127.0.0.1
else
  [ -s "$CA" ] || die "missing $CA"
  export PGSSLROOTCERT=$PWD/$CA
  # Paste the Session pooler connection string from Supabase › Connect (input
  # is hidden). If it still says [YOUR-PASSWORD], the password is asked next.
  # Prints "host<TAB>password"; checks the project ref and the pooler host.
  parse_pooler() { # uri expected_ref
    python3 - "$1" "$2" <<'PY'
import sys, urllib.parse as u
uri, ref = sys.argv[1].strip(), sys.argv[2]
try:
    p = u.urlsplit(uri)
    host, user = p.hostname or "", u.unquote(p.username or "")
    pw = u.unquote(p.password or "")
except ValueError:
    sys.exit("not a connection string")
if p.scheme not in ("postgres", "postgresql"): sys.exit("must start with postgresql://")
if not host.endswith(".pooler.supabase.com"): sys.exit("host must be <something>.pooler.supabase.com (use Connect › Session pooler)")
if user != f"postgres.{ref}": sys.exit(f"user must be postgres.{ref} (wrong project?)")
if (p.port or 5432) != 5432: sys.exit("use the Session pooler (port 5432)")
if pw in ("[YOUR-PASSWORD]", "YOUR-PASSWORD"): pw = ""
print(f"{host}\t{pw}")
PY
  }
  ask_pooler() { # label ref -> sets HOST_OUT PW_OUT
    local uri parsed
    read -r -s -p "Paste the $1 Session pooler connection string (hidden): " uri; echo >&2
    parsed=$(parse_pooler "$uri" "$2") || die "$1: connection string rejected"
    HOST_OUT=${parsed%%$'\t'*}
    PW_OUT=${parsed#*$'\t'}
    if [ -z "$PW_OUT" ]; then read -r -s -p "$1 postgres password (hidden): " PW_OUT; echo >&2; fi
    [ -n "$PW_OUT" ] || die "$1: empty password"
  }
  ask_pooler "OLD project (kubcode, us-east-1)" "$OLD_REF"
  OLD_HOST=$HOST_OUT OLD_PW=$PW_OUT
  ask_pooler "NEW project (kubcode-sg)" "$NEW_REF"
  NEW_HOST=$HOST_OUT NEW_PW=$PW_OUT
  [[ "$NEW_HOST" == *ap-southeast-1* ]] || die "the new project's host is not in ap-southeast-1"
  OLD_URL="postgresql://postgres.$OLD_REF@$OLD_HOST:5432/postgres?sslmode=verify-full"
  NEW_URL="postgresql://postgres.$NEW_REF@$NEW_HOST:5432/postgres?sslmode=verify-full"
fi

old_sql() { PGPASSWORD=$OLD_PW "$PSQL" -X -q -t -A -v ON_ERROR_STOP=1 "$OLD_URL" "$@"; }
new_sql() { PGPASSWORD=$NEW_PW "$PSQL" -X -q -t -A -v ON_ERROR_STOP=1 "$NEW_URL" "$@"; }

# URL with a percent-encoded password in it (for node and for the switch).
with_user_pw() { # url user password
  python3 - "$1" "$2" "$3" <<'PY'
import sys, urllib.parse as u
url, user, pw = sys.argv[1:]
p = u.urlsplit(url)
host = p.hostname + (f":{p.port}" if p.port else "")
print(u.urlunsplit((p.scheme, f"{u.quote(user, safe='')}:{u.quote(pw, safe='')}@{host}", p.path, p.query, "")))
PY
}

# SCRAM-SHA-256 verifier, so CREATE/ALTER ROLE never carries a plaintext password.
scram() {
  python3 - "$1" <<'PY'
import sys, os, hashlib, hmac, base64
pw = sys.argv[1].encode(); salt = os.urandom(16); it = 4096
salted = hashlib.pbkdf2_hmac("sha256", pw, salt, it)
ck = hmac.new(salted, b"Client Key", "sha256").digest()
sk = hmac.new(salted, b"Server Key", "sha256").digest()
b = lambda x: base64.b64encode(x).decode()
print(f"SCRAM-SHA-256${it}:{b(salt)}${b(hashlib.sha256(ck).digest())}:{b(sk)}")
PY
}

# --- 2. Checks
old_sql -c "SELECT 1" >/dev/null || die "cannot connect to the old database"
new_sql -c "SELECT 1" >/dev/null || die "cannot connect to the new database"
[ "$(old_sql -c "SELECT count(*) FROM pg_namespace WHERE nspname = 'kubcode_accounts'")" = 1 ] ||
  die "the old database has no kubcode_accounts schema"
[ "$(new_sql -c "SELECT count(*) FROM pg_namespace WHERE nspname = 'kubcode_accounts'")" = 0 ] ||
  die "the new database is not empty (kubcode_accounts exists); refusing to copy over it"

old_versions=$(old_sql -c "SELECT string_agg(version, ',' ORDER BY version) FROM kubcode_accounts.schema_migrations")
local_versions=$(for f in db/migrations/*.sql; do basename "$f" .sql; done | paste -sd, -)
[ "$old_versions" = "$local_versions" ] ||
  die "this checkout's migrations ($local_versions) differ from the old database ($old_versions); use main"
say "both databases reachable; migrations $old_versions"

# --- 3. New database: roles, schema, grants
APP_PW=$(openssl rand -hex 24)
WORKER_PW=$(openssl rand -hex 24)
APP_V=$(scram "$APP_PW")
WORKER_V=$(scram "$WORKER_PW")

new_sql >/dev/null <<SQL
DO \$\$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kubcode_app') THEN
    ALTER ROLE kubcode_app LOGIN PASSWORD '$APP_V';
  ELSE
    CREATE ROLE kubcode_app LOGIN PASSWORD '$APP_V';
  END IF;
END
\$\$;
SQL
say "kubcode_app ready on the new database"

new_node_url=$(with_user_pw "$NEW_URL" "$( [ "$TEST" = 1 ] && echo postgres || echo "postgres.$NEW_REF")" "$NEW_PW")
if [ "$TEST" = 1 ]; then
  DATABASE_URL=$new_node_url npx tsx scripts/accounts-migrate.ts --apply >"$TMP/migrate.log" 2>&1 || { cat "$TMP/migrate.log" >&2; die "migrations failed"; }
else
  DATABASE_URL=$new_node_url KUBCODE_DB_CA_CERT="$(cat "$CA")" npx tsx scripts/accounts-migrate.ts --apply >"$TMP/migrate.log" 2>&1 ||
    { cat "$TMP/migrate.log" >&2; die "migrations failed"; }
fi
new_sql -f db/runtime-role-grants.sql >/dev/null
new_sql >/dev/null <<SQL
ALTER ROLE kubcode_worker LOGIN PASSWORD '$WORKER_V';
GRANT CONNECT ON DATABASE postgres TO kubcode_worker;
SQL
new_versions=$(new_sql -c "SELECT string_agg(version, ',' ORDER BY version) FROM kubcode_accounts.schema_migrations")
[ "$new_versions" = "$old_versions" ] || die "new ledger ($new_versions) differs from old ($old_versions)"
say "schema, grants and kubcode_worker login ready"

# --- 4. Copy and verify
PGPASSWORD=$OLD_PW "$PG_DUMP" --data-only --schema=kubcode_accounts \
  --exclude-table=kubcode_accounts.schema_migrations --no-owner --no-privileges "$OLD_URL" >"$TMP/data.sql" ||
  die "pg_dump of the old database failed"
new_sql --single-transaction -f "$TMP/data.sql" >/dev/null || die "restoring into the new database failed (rolled back)"
rm -f "$TMP/data.sql"

tables=$(old_sql -c "SELECT tablename FROM pg_tables WHERE schemaname = 'kubcode_accounts' AND tablename <> 'schema_migrations' ORDER BY 1")
digest="SELECT count(*) || ':' || md5(coalesce(string_agg(x::text, '|' ORDER BY x::text), ''))"
for t in $tables; do
  a=$(old_sql -c "$digest FROM kubcode_accounts.$t x")
  b=$(new_sql -c "$digest FROM kubcode_accounts.$t x")
  [ "$a" = "$b" ] || die "table $t differs after the copy (old ${a%%:*} rows, new ${b%%:*} rows)"
  printf '  %-26s %s rows ok\n' "$t" "${a%%:*}" >&2
done
say "every table matches"

# The runtime roles can log in through the pooler with their new passwords.
app_user=kubcode_app worker_user=kubcode_worker
[ "$TEST" = 1 ] || { app_user=kubcode_app.$NEW_REF; worker_user=kubcode_worker.$NEW_REF; }
app_check_url=$(with_user_pw "$NEW_URL" "$app_user" "$APP_PW")
worker_check_url=$(with_user_pw "$NEW_URL" "$worker_user" "$WORKER_PW")
"$PSQL" -X -q -t -A -v ON_ERROR_STOP=1 "$app_check_url" -c "SELECT count(*) FROM kubcode_accounts.users" >/dev/null ||
  die "kubcode_app cannot log in to the new database"
"$PSQL" -X -q -t -A -v ON_ERROR_STOP=1 "$worker_check_url" -c "SELECT count(*) FROM kubcode_accounts.user_secrets" >/dev/null ||
  die "kubcode_worker cannot log in to the new database"
say "kubcode_app and kubcode_worker log in"

if [ "$TEST" = 1 ]; then
  printf '%s' "$APP_PW" >"$MOVE_DB_TEST_OUT/app_password"
  printf '%s' "$WORKER_PW" >"$MOVE_DB_TEST_OUT/worker_password"
  say "test mode: nothing switched"
  exit 0
fi

# --- 5. Switch
app_url="postgresql://kubcode_app.$NEW_REF:$APP_PW@$NEW_HOST:5432/postgres?sslmode=verify-full"
printf "DATABASE_URL='%s'\n" "$app_url" | infra/web/scripts/webhost.sh ssh sudo /usr/local/lib/kubcode/write-env --merge >"$TMP/env.log" 2>&1 ||
  { grep -v -i -E 'password|postgres(ql)?://' "$TMP/env.log" >&2; die "web box switch failed; write-env restored the previous web.env"; }
grep -q 'smoke: ok' "$TMP/env.log" || die "web box did not report 'smoke: ok'"
say "web box now uses the new database (smoke ok)"

with_user_pw "$NEW_URL" "postgres.$NEW_REF" "$NEW_PW" | sed 's/?sslmode=verify-full$//' | gh secret set MIGRATION_DATABASE_URL --repo "$REPO" >/dev/null
say "GitHub secret MIGRATION_DATABASE_URL updated"

# sslmode=require is fine here: the Lambda forces TLS in code and rustls always
# verifies the server against the Supabase CA built into the binary
# (services/crates/kubcode-oauth-connect/src/db.rs), and tokio-postgres does
# not parse verify-full.
printf "postgresql://kubcode_worker.%s:%s@%s:5432/postgres?sslmode=require" "$NEW_REF" "$WORKER_PW" "$NEW_HOST" >"$TMP/worker"
aws ssm put-parameter --region "$REGION" --type SecureString --key-id alias/kubcode-secrets \
  --overwrite --name /kubcode/prod/worker-db-url --value "file://$TMP/worker" >/dev/null
rm -f "$TMP/worker"
say "SSM /kubcode/prod/worker-db-url updated"

say "done. Next: merge the PR that sets MIGRATION_EXPECT_PROJECT_REF=$NEW_REF (production runs stop at the URL check until then), then pause the old project after a week."
