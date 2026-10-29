#!/usr/bin/env bash
# Update: pull latest code, rebuild, run migrations, restart.
# Preserves all persistent volumes (database, uploads).
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

echo "[INFO] Backing up before update..."
bash "$SCRIPT_DIR/backup.sh"

echo "[INFO] Pulling latest code..."
git pull --ff-only

echo "[INFO] Rebuilding and restarting..."
docker compose up -d --build

echo "[INFO] Applying migrations..."
docker compose exec backend npm run migrate

echo "[INFO] Update complete."
