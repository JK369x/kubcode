#!/usr/bin/env bash
# End-to-end check of the web host without AWS: builds the release like CI,
# runs host/setup.sh on a clean ubuntu:24.04 container, then deploys over real
# SSH through the forced command and the real smoke test, checks the lockdown,
# deploys a second release and rolls back. systemd is replaced by a stand-in
# /usr/bin/systemctl (containers have no systemd); env values are fake but
# shaped like real ones (lib/auth-policy.ts rejects malformed/short values).
#
# Usage: infra/web/tests/container-e2e.sh   (from the repo root; needs Docker)
#   RELEASE=path/to/release.tar.gz   reuse a built release instead of building
#   SAVE_RELEASE=path                keep the built release there for reruns
#   KEEP=1                           leave the container running on failure
set -euo pipefail
REPO=$(git rev-parse --show-toplevel)
PLATFORM="${PLATFORM:-linux/amd64}" # Lightsail micro_3_0 is x86_64
NAME=kubcode-web-e2e
work=$(mktemp -d)
cleanup() {
  local rc=$?
  if [ "$rc" -ne 0 ]; then
    echo; echo "=== FAILED (exit $rc); app log:"
    docker exec "$NAME" tail -40 /var/log/kubcode-web.log 2>/dev/null || true
  fi
  if [ "$rc" -ne 0 ] && [ "${KEEP:-0}" = 1 ]; then echo "container $NAME kept"; else docker rm -f "$NAME" >/dev/null 2>&1 || true; fi
  rm -rf "$work"
}
trap cleanup EXIT
docker rm -f "$NAME" >/dev/null 2>&1 || true
step() { echo; echo "=== $*"; }
in_box() { docker exec "$NAME" bash -c "$1"; }

mkdir -p "$work/src"
if [ -n "${RELEASE:-}" ]; then
  step "reuse release $RELEASE"
  cp "$RELEASE" "$work/src/release.tar.gz"
else
  step "build the release like CI ($PLATFORM)"
  git -C "$REPO" ls-files -co --exclude-standard -z | rsync -a --from0 --files-from=- "$REPO/" "$work/src/"
  docker run --rm --platform "$PLATFORM" -v "$work/src:/src" -w /src node:22-bookworm bash -c '
    set -e
    npm ci --ignore-scripts --no-audit --no-fund >/dev/null
    NEXT_PUBLIC_MEDIA_MODE=licensed-only npm run build >/tmp/build.log 2>&1 || { tail -40 /tmp/build.log; exit 1; }
    bash scripts/package-release.sh /src/release.tar.gz'
  if [ -n "${SAVE_RELEASE:-}" ]; then cp "$work/src/release.tar.gz" "$SAVE_RELEASE"; fi
fi

step "box setup"
ssh-keygen -q -t ed25519 -N '' -C kubcode-ci-deploy -f "$work/deploy_key"
cp -R "$REPO/infra/web/host" "$work/host"
cp "$work/deploy_key.pub" "$work/host/deploy_key.pub"
docker run -d --name "$NAME" --platform "$PLATFORM" -v "$work:/w" ubuntu:24.04 sleep infinity >/dev/null
in_box 'cp -R /w/host /tmp/host && KUBCODE_SETUP_NO_SYSTEMD=1 bash /tmp/host/setup.sh'
in_box 'KUBCODE_SETUP_NO_SYSTEMD=1 bash /tmp/host/setup.sh >/dev/null && echo "setup re-run: ok"'

step "fake env and systemd stand-in"
in_box "cat > /etc/kubcode/web.env <<'EOF'
GOOGLE_CLIENT_ID='123456789-e2efakeclientid.apps.googleusercontent.com'
GOOGLE_CLIENT_SECRET='GOCSPX-e2eFakeSecretNotReal1234'
LINE_CLIENT_ID='2012344557'
LINE_CLIENT_SECRET='e2efakelinesecretnotreal0123456789'
NEXTAUTH_URL='https://kubcode.dev'
NEXTAUTH_SECRET='e2e-nextauth-secret-not-real-0123456789'
NEXT_PUBLIC_MEDIA_MODE='licensed-only'
EOF
chmod 600 /etc/kubcode/web.env"
in_box "cat > /usr/bin/systemctl <<'EOF'
#!/bin/bash
# Stand-in for: systemctl restart kubcode-web.service (same user, env, cwd, start command).
[ \"\$*\" = 'restart kubcode-web.service' ] || { echo \"fake systemctl: unsupported: \$*\" >&2; exit 1; }
pkill -u kubcode -f 'node server.js' || true
sleep 1
cd -P /srv/kubcode/current
set -a; . /etc/kubcode/web.env; set +a
NODE_ENV=production PORT=3000 HOSTNAME=127.0.0.1 NEXT_TELEMETRY_DISABLED=1 \
  setsid runuser -u kubcode -- /usr/local/lib/kubcode/start-web >/var/log/kubcode-web.log 2>&1 < /dev/null &
EOF
chmod 755 /usr/bin/systemctl && /usr/sbin/sshd"

deploy() {
  local sha=$1 sum
  sum=$(shasum -a 256 "$work/src/release.tar.gz" | cut -d' ' -f1)
  in_box "ssh -q -i /w/deploy_key -o StrictHostKeyChecking=accept-new deploy@127.0.0.1 'deploy $sha $sum' < /w/src/release.tar.gz"
}

step "deploy release A over SSH (forced command + real smoke)"
deploy "$(printf 'a%.0s' $(seq 40))"

step "lockdown checks"
in_box "ssh -q -i /w/deploy_key deploy@127.0.0.1 'bash -c id' && exit 1 || echo 'shell via deploy key: refused'"
in_box "runuser -u deploy -- sudo -n /usr/bin/systemctl stop caddy 2>/dev/null && exit 1 || echo 'sudo beyond restart: refused'"
in_box "runuser -u kubcode -- cat /etc/kubcode/web.env 2>/dev/null && exit 1 || echo 'app user reading web.env: refused'"
in_box "runuser -u kubcode -- touch /srv/kubcode/current/server.js 2>/dev/null && exit 1 || echo 'app user writing the release: refused'"
in_box "runuser -u kubcode -- touch /srv/kubcode/current/.next/cache/e2e && echo 'app user writing the image cache: ok'"
# Match on args: under amd64 emulation the process name is rosetta, not node.
in_box "users=\$(ps -eo user=,args= | grep '[s]erver.js' | awk '{print \$1}' | sort -u); [ \"\$users\" = kubcode ] && echo 'app runs only as kubcode: ok'"
# The image optimizer needs sharp's Linux binary and a writable cache.
in_box "code=\$(curl -s -o /dev/null -w '%{http_code}' -H 'Host: kubcode.dev' -H 'X-Forwarded-Proto: https' 'http://127.0.0.1:3000/_next/image?url=%2Fcovers%2Finstall-with-permissions%2Fcover-v2.jpg&w=640&q=75'); [ \"\$code\" = 200 ] && [ -n \"\$(ls -A /var/cache/kubcode-web/images 2>/dev/null)\" ] && echo 'image optimizer (sharp + cache): ok'"

step "deploy release B, then roll back to A"
deploy "$(printf 'b%.0s' $(seq 40))"
in_box "ssh -q -i /w/deploy_key deploy@127.0.0.1 status"
in_box "ssh -q -i /w/deploy_key deploy@127.0.0.1 rollback"
in_box "ssh -q -i /w/deploy_key deploy@127.0.0.1 status"

step "memory after smoke"
in_box "ps -eo rss=,args= | grep '[s]erver.js' | awk '{printf \"app RSS %.0f MB (emulated; native is lower)\n\", \$1/1024}'"
echo; echo "container-e2e: PASS"
