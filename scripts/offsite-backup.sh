#!/usr/bin/env bash
# Copies the server's automatic AklatOne backups to another machine (off-site), so a dead server or disk does not
# take the backups with it. Run on the server from the project folder, e.g. daily from cron:
#   15 3 * * *  cd /opt/aklatone && ./scripts/offsite-backup.sh >> /var/log/aklatone-offsite.log 2>&1
# Needs: OFFSITE_TARGET in .env (user@host:/path, SSH key login set up once), rsync on both machines.
# Set BACKUP_ENCRYPTION_KEY in .env first, so the copies leave the server encrypted.
set -euo pipefail
cd "$(dirname "$0")/.."
TARGET=$(grep -E '^OFFSITE_TARGET=' .env | cut -d= -f2- || true)
[ -n "$TARGET" ] || { echo "Set OFFSITE_TARGET in .env (e.g. backup@nas.example.com:/backups/aklatone)"; exit 1; }
grep -qE '^BACKUP_ENCRYPTION_KEY=.+' .env || echo "Warning: BACKUP_ENCRYPTION_KEY is empty, copies are not encrypted." >&2

# The backups live in the "backups" volume of the api container; copy them out, then send only new files.
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
docker compose cp api:/app/backups/. "$STAGE/"
count=$(find "$STAGE" -type f -name '*.sql.gz*' | wc -l)
[ "$count" -gt 0 ] || { echo "No backups found in the api container yet."; exit 1; }
rsync -a --ignore-existing "$STAGE/" "$TARGET/"
echo "$(date -Is) sent $count backup file(s) to $TARGET (existing files skipped)"
