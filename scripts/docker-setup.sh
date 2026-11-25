#!/usr/bin/env bash
# One-command setup of the whole AklatOne system with Docker (database, API, Staff Web, HTTPS proxy).
#
#   bash scripts/docker-setup.sh                      run on this computer / school LAN  (http://<this computer>)
#   bash scripts/docker-setup.sh library.example.com  run on a server with a domain       (https://library.example.com)
#
# Needs only Docker (Docker Desktop on Windows / macOS, Docker Engine + compose plugin on Linux) and Git Bash or
# WSL on Windows. The first run creates .env with random passwords; later runs keep it and just update the system.
set -euo pipefail
cd "$(dirname "$0")/.."

say() { printf '\033[1;34m[aklatone]\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m[aklatone] %s\033[0m\n' "$*"; exit 1; }

command -v docker >/dev/null || fail "Docker is not installed. Install Docker Desktop (Windows/macOS) or Docker Engine (Linux): https://docs.docker.com/get-docker/"
docker info >/dev/null 2>&1 || fail "Docker is installed but not running. Start Docker Desktop (or: sudo systemctl start docker) and run this again."
docker compose version >/dev/null 2>&1 || fail "The Docker Compose plugin is missing. Install it: https://docs.docker.com/compose/install/"

SITE=${1:-}
rand() { od -vN 24 -An -tx1 /dev/urandom | tr -d ' \n'; }   # 48 hex characters, no openssl needed

if [ ! -f .env ]; then
  say "Creating .env with random passwords (keep this file private; never put it on GitHub)"
  cp .env.example .env
  set_var() { sed -i.bak "s|^$1=.*|$1=$2|" .env && rm -f .env.bak; }
  set_var DB_PASSWORD "$(rand)"
  set_var DB_ROOT_PASSWORD "$(rand)"
  set_var DB_APP_PASSWORD "$(rand)"
  set_var JWT_SECRET "$(rand)$(rand)"
  set_var BACKUP_ENCRYPTION_KEY "$(rand)"
  if [ -n "$SITE" ]; then set_var SITE_ADDRESS "$SITE"; set_var CORS_ORIGINS "https://$SITE"; fi
  say "Copy BACKUP_ENCRYPTION_KEY from .env to a safe place: old backups cannot be opened without it."
else
  say ".env already exists: keeping its passwords"
  if [ -n "$SITE" ]; then sed -i.bak "s|^SITE_ADDRESS=.*|SITE_ADDRESS=$SITE|; s|^CORS_ORIGINS=.*|CORS_ORIGINS=https://$SITE|" .env && rm -f .env.bak; fi
fi
grep -qE '^EMAIL_USER=.+' .env || say "Note: EMAIL_USER / EMAIL_PASS are empty, so accounts with an email cannot receive sign-in codes. Fill them in .env and run this again."

say "Building and starting (the first time takes a few minutes)"
docker compose up -d --build

URL="http://localhost"; [ -n "$SITE" ] && URL="https://$SITE"
say "Waiting for AklatOne to answer on $URL/health"
for _ in $(seq 1 60); do
  if curl -fsk --max-time 3 "$URL/health" >/dev/null 2>&1; then
    say "Ready: open $URL  (the first visit asks you to create the librarian account)"
    say "Phones and other computers on this network: http://$(hostname -I 2>/dev/null | awk '{print $1}')"
    say "Stop: docker compose stop   Start again: docker compose up -d   Logs: docker compose logs -f api"
    exit 0
  fi
  sleep 5
done
fail "No answer after 5 minutes. Check: docker compose ps   and   docker compose logs api"
