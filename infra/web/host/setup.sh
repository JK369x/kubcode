#!/usr/bin/env bash
# Sets up the kubcode-web box. Runs as root on the box, from a copy of this
# host/ directory (`scripts/webhost.sh provision` sends it). Safe to re-run.
#
# KUBCODE_SETUP_NO_SYSTEMD=1 skips steps that need a running systemd/sshd,
# for testing in a plain ubuntu:24.04 container.
set -euo pipefail
cd "$(dirname "$0")"

NODE_VERSION=22.23.4 # same major as CI (checks.yml); 2026-10-20 security release
NO_SYSTEMD="${KUBCODE_SETUP_NO_SYSTEMD:-0}"
log() { echo "setup: $*"; }

[ "$(id -u)" = 0 ] || { echo "setup: run as root" >&2; exit 1; }
[ -s deploy_key.pub ] || { echo "setup: host/deploy_key.pub is missing (run: webhost.sh deploy-key)" >&2; exit 1; }
grep -Eq '^ssh-ed25519 [A-Za-z0-9+/=]+ kubcode-ci-deploy$' deploy_key.pub || { echo "setup: deploy_key.pub is not the CI deploy key" >&2; exit 1; }

export DEBIAN_FRONTEND=noninteractive
log "packages"
apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg xz-utils sudo openssh-server unattended-upgrades >/dev/null

log "swap (1 GB)"
if [ "$NO_SYSTEMD" != 1 ] && ! swapon --show=NAME --noheadings | grep -qx /swapfile; then
  [ -f /swapfile ] || { fallocate -l 1G /swapfile; chmod 600 /swapfile; mkswap /swapfile >/dev/null; }
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
fi

log "node $NODE_VERSION"
if [ "$(/usr/local/bin/node --version 2>/dev/null || true)" != "v$NODE_VERSION" ]; then
  arch=$(uname -m)
  case "$arch" in x86_64) narch=x64 ;; aarch64) narch=arm64 ;; *) echo "setup: unsupported arch $arch" >&2; exit 1 ;; esac
  tarball="node-v$NODE_VERSION-linux-$narch.tar.xz"
  tmp=$(mktemp -d)
  curl -fsSL "https://nodejs.org/dist/v$NODE_VERSION/$tarball" -o "$tmp/$tarball"
  curl -fsSL "https://nodejs.org/dist/v$NODE_VERSION/SHASUMS256.txt" -o "$tmp/SHASUMS256.txt"
  (cd "$tmp" && grep " $tarball\$" SHASUMS256.txt | sha256sum -c --quiet -)
  tar -xJf "$tmp/$tarball" -C /usr/local --strip-components=1 --no-same-owner \
    "node-v$NODE_VERSION-linux-$narch/bin/node"
  rm -rf "$tmp"
fi

log "caddy"
if ! command -v caddy >/dev/null; then
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt -o /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq
  apt-get install -y -qq caddy >/dev/null
fi

log "users"
id kubcode >/dev/null 2>&1 || useradd --system --user-group --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin kubcode
# The deploy user needs a real shell: sshd runs the forced command through it.
id deploy >/dev/null 2>&1 || useradd --system --user-group --create-home --home-dir /home/deploy --shell /bin/bash deploy
passwd -l deploy >/dev/null

log "directories"
install -d -o deploy -g deploy -m 755 /srv/kubcode /srv/kubcode/releases
install -d -o kubcode -g kubcode -m 750 /var/cache/kubcode-web
install -d -o root -g root -m 700 /etc/kubcode
# The deploy user only creates a symlink to the cache; the app user writes it.
chmod o+x /var/cache/kubcode-web

log "files"
install -o root -g root -m 755 kubcode-deploy /usr/local/bin/kubcode-deploy
install -d -o root -g root -m 755 /usr/local/lib/kubcode
install -o root -g root -m 755 smoke /usr/local/lib/kubcode/smoke
install -o root -g root -m 755 start-web /usr/local/lib/kubcode/start-web
install -o root -g root -m 755 write-env /usr/local/lib/kubcode/write-env
install -o root -g root -m 644 kubcode-web.service /etc/systemd/system/kubcode-web.service
install -o root -g root -m 644 Caddyfile /etc/caddy/Caddyfile
install -o root -g root -m 644 sshd-kubcode.conf /etc/ssh/sshd_config.d/10-kubcode.conf
install -o root -g root -m 440 sudoers-kubcode-deploy /etc/sudoers.d/kubcode-deploy
visudo -cqf /etc/sudoers.d/kubcode-deploy

install -d -o deploy -g deploy -m 700 /home/deploy/.ssh
printf 'restrict,command="/usr/local/bin/kubcode-deploy" %s\n' "$(cat deploy_key.pub)" >/home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys

caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1 || { echo "setup: Caddyfile invalid" >&2; exit 1; }
mkdir -p /run/sshd
sshd -t

if [ "$NO_SYSTEMD" != 1 ]; then
  log "services"
  systemctl daemon-reload
  systemctl enable kubcode-web.service >/dev/null
  systemctl reload caddy || systemctl restart caddy
  systemctl reload ssh
  # Start only once there is a release and env; the first deploy restarts it.
  if [ -e /srv/kubcode/current ] && [ -s /etc/kubcode/web.env ]; then systemctl restart kubcode-web.service; fi
fi
log "done (web.env present: $([ -s /etc/kubcode/web.env ] && echo yes || echo no), release: $(basename "$(readlink /srv/kubcode/current 2>/dev/null || echo none)"))"
