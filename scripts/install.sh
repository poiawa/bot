#!/usr/bin/env bash
# =============================================================================
# VPN Bot Platform — Production Installer (Ubuntu 22.04 / 24.04 LTS)
# Usage: sudo bash scripts/install.sh [--repo URL] [--os-override]
#
# Safety properties:
# - Stops safely on unsupported OS, missing resources, or failed validation
# - Never overwrites an existing .env without backup + confirmation
# - Never drops/reset an existing database; migrations are additive (drizzle)
# - Generates cryptographically secure secrets; never prints them
# - Installs prerequisites only after validation and explicit confirmation
# - Firewall changes are conservative: only if UFW is active, only ports 80/443
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

REPO_URL="${REPO_URL:-https://github.com/poiawa/bot.git}"
ENV_FILE="$PROJECT_ROOT/.env"
COMPOSE=""

# --- Parse flags -----------------------------------------------------------------
FORCE_OS=0
for arg in "$@"; do
  case "$arg" in
    --os-override) FORCE_OS=1 ;;
    *) ;;
  esac
done

# --- 1. Privilege check -----------------------------------------------------------
[ "$EUID" -ne 0 ] && die "Run as root: sudo bash scripts/install.sh"

# --- 2. OS check (hard stop on unsupported) -----------------------------------------
OS_RESULT="$(classify_os /etc/os-release)"
case "$OS_RESULT" in
  supported:*) info "OS: ${OS_RESULT#supported:} — supported" ;;
  unsupported:*)
    if [ "$FORCE_OS" -eq 1 ]; then
      warn "OS unsupported but --os-override given, continuing: ${OS_RESULT#unsupported:}"
    else
      die "${OS_RESULT#unsupported:} (use --os-override to proceed at your own risk)"
    fi ;;
esac

# --- 3. Resource checks ---------------------------------------------------------------
DISK_MB=$(disk_free_mb "$PROJECT_ROOT")
[ "${DISK_MB:-0}" -lt 5120 ] && die "Insufficient disk: ${DISK_MB:-0}MB free, 5GB required (project dir)."
MEM_MB="$(mem_total_mb)"
[ "$MEM_MB" -lt 1024 ] && warn "Only ${MEM_MB}MB RAM — 2GB recommended. Continuing."

# --- 4. Port availability (fail early, never kill services) -----------------------------
for p in 80 443; do
  if port_in_use "$p"; then
    die "Port $p is already in use. Stop the conflicting service or move this stack to other ports."
  fi
done
info "Ports 80 and 443 are free."

# --- 5. Docker availability (install only with explicit confirmation) --------------------
if command -v docker >/dev/null 2>&1; then
  info "Docker found: $(docker --version)"
else
  warn "Docker is not installed."
  if confirm "Install Docker via the official convenience script (get.docker.com)? [recommended] " y; then
    curl -fsSL https://get.docker.com | sh
    systemctl enable --now docker
    command -v docker >/dev/null 2>&1 || die "Docker installation failed — install manually and re-run."
    info "Docker installed."
  else
    die "Docker is required. Install it from https://docs.docker.com/engine/install/ubuntu/ and re-run."
  fi
fi
if docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE="docker-compose"
else
  die "Docker Compose plugin not found. Install it: apt install docker-compose-plugin"
fi
info "Compose OK: $COMPOSE"

# --- 6. Existing containers (idempotency — never clobber) ---------------------------------
EXISTING=$(docker ps -a --filter "name=vpnbot_" --format '{{.Names}}' 2>/dev/null | head -5 || true)
if [ -n "$EXISTING" ]; then
  warn "Existing vpnbot containers found:"
  echo "$EXISTING" | sed 's/^/  - /'
  if [ -f "$ENV_FILE" ]; then
    die "Installation appears to already exist. For updates run: sudo bash scripts/update.sh"
  fi
  warn "Continuing without existing .env — a new one will be created."
fi

# --- 7. Fresh clone support -----------------------------------------------------------------
if [ ! -f "$PROJECT_ROOT/docker-compose.yml" ]; then
  info "No repository found here. Cloning $REPO_URL ..."
  git clone --depth 1 "$REPO_URL" "$PROJECT_ROOT" || die "git clone failed"
  cd "$PROJECT_ROOT"
fi
cd "$PROJECT_ROOT"

# --- 8. Environment configuration -------------------------------------------------------------
mkdir -p "$PROJECT_ROOT/backups"
chmod 700 "$PROJECT_ROOT/backups" 2>/dev/null || true
if [ -f "$ENV_FILE" ]; then
  BACKUP_PATH="$ENV_FILE.backup.$(date +%Y%m%d%H%M%S)"
  cp "$ENV_FILE" "$BACKUP_PATH" && chmod 600 "$BACKUP_PATH"
  info "Backed up existing .env -> $(basename "$BACKUP_PATH")"
fi

source "$SCRIPT_DIR/configure-env.sh"

# --- 9. Build and start (repository's actual compose config) --------------------------
info "Building and starting services (this may take several minutes)..."
$COMPOSE up -d --build

# --- 10. Health verification ------------------------------------------------------------
info "Waiting for backend health..."
HEALTH_OK=0
for i in $(seq 1 30); do
  if curl -sf http://localhost/health >/dev/null 2>&1; then HEALTH_OK=1; break; fi
  sleep 5
done
if [ "$HEALTH_OK" -ne 1 ]; then
  err "Backend did not become healthy. Recent logs:"
  $COMPOSE logs --tail 30 backend || true
  die "Health check failed. Fix the issue and re-run: sudo bash scripts/install.sh"
fi
info "Backend healthy. Frontend: $(curl -s -o /dev/null -w '%{http_code}' http://localhost/ 2>/dev/null || echo 'n/a')"

# --- 11. Database migrations (additive, never destructive) --------------------------------
info "Applying database migrations (drizzle — additive only)..."
$COMPOSE exec -T backend npm run migrate || die "Migration failed. Database untouched. Check: $COMPOSE logs postgres"

# --- 12. Firewall (conservative — only when UFW is ACTIVE) ---------------------------------
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
  info "UFW is active — ensuring SSH/HTTP/HTTPS are allowed (no other rules touched)."
  ufw allow 22/tcp  >/dev/null 2>&1 && info "  ufw: 22/tcp allowed (SSH)"
  ufw allow 80/tcp  >/dev/null 2>&1 && info "  ufw: 80/tcp allowed"
  ufw allow 443/tcp >/dev/null 2>&1 && info "  ufw: 443/tcp allowed"
  # PostgreSQL (5432) and Redis (6379) are NOT published by compose — verify:
  if docker ps --format '{{.Ports}}' | grep -qE '0\.0\.0\.0:(5432|6379)'; then
    warn "PostgreSQL/Redis ports are published! Check docker-compose.yml — they should stay internal."
  else
    info "  database and Redis are not exposed publicly (compose has no host ports for them)."
  fi
else
  info "UFW inactive or absent — no firewall changes made."
fi

# --- 13. Summary ------------------------------------------------------------------------------
echo
info "=================================================="
info " Installation complete"
info "=================================================="
$COMPOSE ps
echo
info "Next steps:"
echo "  1. If you skipped the bot token: edit .env (TELEGRAM_BOT_TOKEN), then: $COMPOSE up -d backend"
echo "  2. Create an admin user:"
echo "       $COMPOSE exec backend npm run create-admin"
echo "  3. HTTPS (if using a domain): install certbot and configure nginx/ssl — see docs/deployment.md"
echo "  4. Backups:        bash scripts/backup.sh"
echo "  5. Status/logs:    bash scripts/status.sh | bash scripts/logs.sh"
echo "  6. Future updates: sudo bash scripts/update.sh"
echo
info "Telegram webhook (after HTTPS is configured): set webhook to $APP_URL_VALUE/telegram/webhook via BotFather."

