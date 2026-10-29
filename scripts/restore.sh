#!/usr/bin/env bash
# Restore: decrypt archive (if encrypted) and restore the PostgreSQL dump.
# Usage: bash scripts/restore.sh <backup-archive-or-sql-gz>
# WARNING: Restoring overwrites the current database content.
set -euo pipefail

[ $# -eq 1 ] || { echo "Usage: bash scripts/restore.sh <backup-file>"; exit 1; }
BACKUP_FILE="$1"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
WORK_DIR="$(mktemp -d)"

cd "$PROJECT_ROOT"
set -a; source .env 2>/dev/null || true; set +a

if [[ "$BACKUP_FILE" == *.enc ]]; then
  [ -n "${BACKUP_ENCRYPTION_KEY:-}" ] || { echo "[ERROR] BACKUP_ENCRYPTION_KEY required for encrypted backups"; exit 1; }
  echo "[INFO] Decrypting..."
  openssl enc -d -aes-256-cbc -pbkdf2 -pass "pass:$BACKUP_ENCRYPTION_KEY" -in "$BACKUP_FILE" | tar -xzf - -C "$WORK_DIR"
  SQL_GZ="$(find "$WORK_DIR" -name 'db_*.sql.gz' | head -1)"
else
  SQL_GZ="$BACKUP_FILE"
fi

[ -f "$SQL_GZ" ] || { echo "[ERROR] No db_*.sql.gz found in backup"; exit 1; }

echo "[INFO] Stopping backend and worker to prevent writes..."
docker compose stop backend worker || true

echo "[INFO] Restoring database..."
gunzip -c "$SQL_GZ" | docker compose exec -T postgres psql -U vpnbot -d vpnbot

echo "[INFO] Restarting services..."
docker compose up -d backend worker

echo "[INFO] Restore complete. Verify with: docker compose logs -f backend"
rm -rf "$WORK_DIR"
