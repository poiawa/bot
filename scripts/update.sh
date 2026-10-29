#!/usr/bin/env bash
# =============================================================================
# VPN Bot Platform — Safe Update
# Usage: sudo bash scripts/update.sh
#
# Order matters: backup -> pull (ff-only) -> build -> migrate -> restart -> health.
# - Never resets the database; migrations are additive (drizzle).
# - Aborts before restarting if the build fails; old containers keep running.
# - No automatic DB-migration rollback exists (drizzle has none) — restore the
#   pre-update backup manually if a migration breaks (scripts/restore.sh).
# =============================================================================
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"
cd "$PROJECT_ROOT"

[ "$EUID" -ne 0 ] && die "Run as root: sudo bash scripts/update.sh"

# --- Dirty working tree check (never overwrite local changes silently) ---------
if [ -d .git ] && ! git diff --quiet 2>/dev/null; then
  warn "Local uncommitted changes detected — git pull will not run."
  confirm "Stash local changes and continue the update? (changes kept in stash)" n || {
    info "Update aborted. Commit or stash your changes, then re-run."
    exit 0
  }
  git stash push -m "auto-stash before update $(date +%Y%m%d%H%M%S)"
  info "Local changes stashed (recover with: git stash pop)."
fi

# --- 1. Backup BEFORE anything else --------------------------------------------
info "Step 1/5: Backup before update..."
bash "$SCRIPT_DIR/backup.sh" || die "Backup failed — update aborted for safety."

# --- 2. Pull latest code (fast-forward only; never force) -----------------------
info "Step 2/5: Pulling latest code..."
if [ -d .git ]; then
  git pull --ff-only || die "Fast-forward pull failed (diverged history). Resolve manually — this script never force-updates."
else
  warn "Not a git repository — skipping code pull."
fi

# --- 3. Rebuild images -----------------------------------------------------------
info "Step 3/5: Rebuilding images..."
docker compose build || die "Build failed. Old containers are still running."

# --- 4. Apply migrations (additive; existing data preserved) ----------------------
info "Step 4/5: Applying database migrations..."
docker compose up -d postgres backend
for i in $(seq 1 12); do
  docker compose exec -T postgres pg_isready -U vpnbot -d vpnbot >/dev/null 2>&1 && break
  [ "$i" -eq 12 ] && die "PostgreSQL did not become ready."
  sleep 5
done
docker compose exec -T backend npm run migrate || die "Migration failed. Previous containers remain; restore backup if needed."

# --- 5. Restart all and verify health ---------------------------------------------
info "Step 5/5: Restarting services..."
docker compose up -d --build
HEALTH_OK=0
for i in $(seq 1 30); do
  curl -sf http://localhost/health >/dev/null 2>&1 && { HEALTH_OK=1; break; }
  sleep 5
done
[ "$HEALTH_OK" -eq 1 ] || die "Update applied but backend is NOT healthy. Run: bash scripts/logs.sh backend"

info "Update complete and healthy."
docker compose ps
