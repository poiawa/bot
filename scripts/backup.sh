#!/usr/bin/env bash
# Backup: encrypted PostgreSQL dump + .env into a timestamped archive.
# Usage: bash scripts/backup.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="${1:-$PROJECT_ROOT/backups}"
TS="$(date +%Y%m%d_%H%M%S)"

cd "$PROJECT_ROOT"
mkdir -p "$BACKUP_DIR"

echo "[INFO] Creating database dump..."
docker compose exec -T postgres pg_dump -U vpnbot -d vpnbot > "$BACKUP_DIR/db_$TS.sql"
gzip "$BACKUP_DIR/db_$TS.sql"

echo "[INFO] Copying environment configuration..."
cp .env "$BACKUP_DIR/env_$TS.bak" 2>/dev/null || echo "[WARN] No .env found — skipped."

# Encrypt if a backup key is configured
set -a; source .env 2>/dev/null || true; set +a
if [ -n "${BACKUP_ENCRYPTION_KEY:-}" ] && command -v openssl >/dev/null 2>&1; then
  echo "[INFO] Encrypting backup archive..."
  tar -czf - -C "$BACKUP_DIR" "db_$TS.sql.gz" "env_$TS.bak" \
    | openssl enc -aes-256-cbc -pbkdf2 -salt -pass "pass:$BACKUP_ENCRYPTION_KEY" \
    -out "$BACKUP_DIR/vpnbot_backup_$TS.tar.enc"
  rm -f "$BACKUP_DIR/db_$TS.sql.gz" "$BACKUP_DIR/env_$TS.bak"
  echo "[INFO] Encrypted backup: $BACKUP_DIR/vpnbot_backup_$TS.tar.enc"
else
  echo "[WARN] BACKUP_ENCRYPTION_KEY not set — backup stored UNENCRYPTED."
  echo "[INFO] Backup: $BACKUP_DIR/db_$TS.sql.gz"
fi
echo "[INFO] Backup complete."
