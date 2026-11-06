#!/usr/bin/env bash
# Local end-to-end test for infra/scripts/move-db.sh with two throwaway
# Postgres 17 containers standing in for the old and new Supabase projects.
# The "old" one is migrated and seeded like production; the script must
# copy every row, keep ids and sequences, and leave both runtime roles able
# to log in on the "new" one. No network beyond 127.0.0.1, no real secrets.
#
#   infra/scripts/tests/move-db-local.sh
set -euo pipefail
cd "$(dirname "$0")/../../.."

PSQL=${PSQL:-/opt/homebrew/opt/libpq/bin/psql}
OLD_PORT=55441
NEW_PORT=55442
PW=fixture-only
OLD_C=kubcode-move-old
NEW_C=kubcode-move-new
OUT=$(mktemp -d)
cleanup() { docker rm -f "$OLD_C" "$NEW_C" >/dev/null 2>&1 || true; rm -rf "$OUT"; }
trap cleanup EXIT

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "ok - $*"; }

start() {
  docker rm -f "$1" >/dev/null 2>&1 || true
  docker run -d --name "$1" -e POSTGRES_PASSWORD=$PW -p "127.0.0.1:$2:5432" postgres:17-alpine >/dev/null
  # The image runs a temporary server for initdb, then restarts: wait for the
  # second "ready" line, or an early connection is cut by that restart.
  for _ in $(seq 1 60); do
    [ "$(docker logs "$1" 2>&1 | grep -c 'database system is ready to accept connections')" -ge 2 ] && return 0
    sleep 1
  done
  fail "container $1 did not start"
}
q() { PGPASSWORD=$PW "$PSQL" -X -q -t -A -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "$1" -U postgres -d postgres -c "$2"; }

start "$OLD_C" $OLD_PORT
start "$NEW_C" $NEW_PORT

# Supabase-like roles on both; the old one already has the runtime role, as in production.
for port in $OLD_PORT $NEW_PORT; do q "$port" "CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;" >/dev/null; done
q $OLD_PORT "CREATE ROLE kubcode_app LOGIN PASSWORD 'old-app-fixture';" >/dev/null
DATABASE_URL="postgresql://postgres:$PW@127.0.0.1:$OLD_PORT/postgres" npx tsx scripts/accounts-migrate.ts --apply >/dev/null
PGPASSWORD=$PW "$PSQL" -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $OLD_PORT -U postgres -d postgres -f db/runtime-role-grants.sql >/dev/null

# Seed: the owner (flag already granted), a member, identities, audit rows,
# a comment with a reply (self-FK), a download, a sealed secret.
q $OLD_PORT "
INSERT INTO kubcode_accounts.users (id, is_owner) VALUES
  ('d1ce43fa-2a4e-4f4a-9755-f5d8deb595c4', true), ('00000000-0000-4000-8000-000000000002', false);
INSERT INTO kubcode_accounts.user_identities (user_id, provider, subject) VALUES
  ('d1ce43fa-2a4e-4f4a-9755-f5d8deb595c4', 'google', 'g-owner'),
  ('00000000-0000-4000-8000-000000000002', 'line', 'l-member');
INSERT INTO kubcode_accounts.account_audit_events (user_id, event, provider)
  SELECT 'd1ce43fa-2a4e-4f4a-9755-f5d8deb595c4', 'user_created', 'google' FROM generate_series(1, 7);
INSERT INTO kubcode_accounts.page_comments (id, user_id, page_kind, page_slug, body, body_hash)
  VALUES ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'tool', 'remotion', 'parent', decode(repeat('ab', 32), 'hex'));
INSERT INTO kubcode_accounts.page_comments (id, user_id, page_kind, page_slug, parent_id, body, body_hash)
  VALUES ('10000000-0000-4000-8000-000000000002', 'd1ce43fa-2a4e-4f4a-9755-f5d8deb595c4', 'tool', 'remotion', '10000000-0000-4000-8000-000000000001', 'reply', decode(repeat('cd', 32), 'hex'));
INSERT INTO kubcode_accounts.user_secrets (user_id, kind, envelope, key_slot, hint, version)
  VALUES ('d1ce43fa-2a4e-4f4a-9755-f5d8deb595c4', 'instagram_app', decode(repeat('ee', 600), 'hex'), 1, 'ab12', 1);
" >/dev/null
q $OLD_PORT "INSERT INTO kubcode_accounts.download_events (user_id, package_slug, package_version)
  VALUES ('d1ce43fa-2a4e-4f4a-9755-f5d8deb595c4', 'freshstack-what-if', '0.1.0');" >/dev/null

# Run the move in test mode: URLs come from the environment, nothing is switched.
MOVE_DB_TEST=1 \
  MOVE_DB_OLD_URL="postgresql://postgres@127.0.0.1:$OLD_PORT/postgres" MOVE_DB_OLD_PASSWORD=$PW \
  MOVE_DB_NEW_URL="postgresql://postgres@127.0.0.1:$NEW_PORT/postgres" MOVE_DB_NEW_PASSWORD=$PW \
  MOVE_DB_TEST_OUT="$OUT" \
  infra/scripts/move-db.sh >"$OUT/log" 2>&1 || { cat "$OUT/log" >&2; fail "move-db.sh exited non-zero"; }
pass "move-db.sh completed"

# Every table holds the same rows (compared as text, order-independent).
tables=$(q $OLD_PORT "SELECT tablename FROM pg_tables WHERE schemaname = 'kubcode_accounts' AND tablename <> 'schema_migrations' ORDER BY 1")
for t in $tables; do
  a=$(q $OLD_PORT "SELECT md5(coalesce(string_agg(x::text, '|' ORDER BY x::text), '')) FROM kubcode_accounts.$t x")
  b=$(q $NEW_PORT "SELECT md5(coalesce(string_agg(x::text, '|' ORDER BY x::text), '')) FROM kubcode_accounts.$t x")
  [ "$a" = "$b" ] || fail "table $t differs"
done
pass "all $(wc -w <<<"$tables" | tr -d ' ') tables identical"

[ "$(q $NEW_PORT "SELECT count(*) FROM kubcode_accounts.users WHERE is_owner")" = 1 ] || fail "owner flag lost"
pass "owner flag kept"

old_v=$(q $OLD_PORT "SELECT string_agg(version, ',' ORDER BY version) FROM kubcode_accounts.schema_migrations")
new_v=$(q $NEW_PORT "SELECT string_agg(version, ',' ORDER BY version) FROM kubcode_accounts.schema_migrations")
[ "$old_v" = "$new_v" ] || fail "migration ledgers differ: old=$old_v new=$new_v"
pass "migration ledger matches ($new_v)"

# Identity sequences continue after the copied rows.
next=$(q $NEW_PORT "INSERT INTO kubcode_accounts.account_audit_events (event) VALUES ('probe') RETURNING id")
[ "$next" -gt 7 ] || fail "audit id sequence not advanced (got $next)"
pass "identity sequences advanced"

# Both runtime roles log in with the generated passwords and keep their limits.
app_pw=$(cat "$OUT/app_password")
worker_pw=$(cat "$OUT/worker_password")
[ "${#app_pw}" -ge 32 ] && [ "${#worker_pw}" -ge 32 ] || fail "generated passwords too short"
PGPASSWORD=$app_pw "$PSQL" -X -q -t -A -h 127.0.0.1 -p $NEW_PORT -U kubcode_app -d postgres -c "SELECT 1" >/dev/null || fail "kubcode_app cannot log in"
if PGPASSWORD=$app_pw "$PSQL" -X -q -t -A -h 127.0.0.1 -p $NEW_PORT -U kubcode_app -d postgres -c "SELECT envelope FROM kubcode_accounts.user_secrets" >/dev/null 2>&1; then
  fail "kubcode_app can read envelopes"
fi
PGPASSWORD=$worker_pw "$PSQL" -X -q -t -A -h 127.0.0.1 -p $NEW_PORT -U kubcode_worker -d postgres -c "SELECT count(envelope) FROM kubcode_accounts.user_secrets" >/dev/null || fail "kubcode_worker cannot read envelopes"
pass "kubcode_app and kubcode_worker log in with their grants"

# A second run must refuse: the new database is no longer empty.
if MOVE_DB_TEST=1 MOVE_DB_OLD_URL="postgresql://postgres@127.0.0.1:$OLD_PORT/postgres" MOVE_DB_OLD_PASSWORD=$PW \
  MOVE_DB_NEW_URL="postgresql://postgres@127.0.0.1:$NEW_PORT/postgres" MOVE_DB_NEW_PASSWORD=$PW MOVE_DB_TEST_OUT="$OUT" \
  infra/scripts/move-db.sh >"$OUT/log2" 2>&1; then
  fail "second run did not refuse a non-empty target"
fi
grep -q "not empty" "$OUT/log2" || fail "second run failed for the wrong reason: $(tail -2 "$OUT/log2")"
pass "refuses a non-empty target"

# No secret reaches the log.
grep -q -F "$app_pw" "$OUT/log" && fail "app password printed"
grep -q -F "$worker_pw" "$OUT/log" && fail "worker password printed"
pass "no generated password in the output"
echo "all move-db checks passed"
