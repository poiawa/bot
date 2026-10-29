#!/usr/bin/env bash
# =============================================================================
# VPN Bot Platform — Uninstall (DESTRUCTIVE, double-confirmed)
# Usage: sudo bash scripts/uninstall.sh
#
# Safety:
# - Requires TWO explicit confirmations, one typed phrase for volumes.
# - NEVER silently deletes persistent data (database, redis, uploads volumes).
# - Creates a final backup before stopping containers.
# - Does NOT delete: project directory, .env, backups/ folder.
# =============================================================================
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"
cd "$PROJECT_ROOT"

[ "$EUID" -ne 0 ] && die "Run as root: sudo bash scripts/uninstall.sh"
command -v docker >/dev/null 2>&1 || die "Docker not installed."

echo "This will STOP and REMOVE the platform containers and networks."
warn "Persistent volumes (postgres_data, redis_data, uploads) contain ALL customer data."
warn "They will be deleted ONLY if you explicitly confirm below."

confirm "Stop and remove containers/networks (volumes kept)?" n || { info "Aborted — nothing changed."; exit 0; }

# Safety net: take a final backup first (best effort)
if [ -f .env ]; then
  info "Creating a final safety backup before removal..."
  bash "$SCRIPT_DIR/backup.sh" || warn "Backup failed — continuing, but consider a manual backup."
fi

docker compose down || true
info "Containers and network removed."

if confirm "ALSO DELETE persistent volumes (DATABASE, uploads) — IRREVERSIBLE?" n; then
  echo
  read -rp "Type exactly: DELETE-MY-DATA  > " PHRASE
  [ "$PHRASE" = "DELETE-MY-DATA" ] || die "Phrase mismatch. Volumes preserved. Exiting."
  docker compose down -v || docker volume rm vpnbot_postgres_data vpnbot_redis_data vpnbot_uploads vpnbot_backups 2>/dev/null || true
  warn "Volumes deleted."
else
  info "Volumes preserved. Remove later manually with: docker compose down -v"
fi

info "Uninstall complete. Project directory and backups were NOT deleted."
info "To remove them manually: rm -rf $PROJECT_ROOT  (review contents first)"
