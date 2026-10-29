#!/usr/bin/env bash
# =============================================================================
# VPN Bot Platform — One-Command Installer
# Usage: sudo bash scripts/install.sh
#
# - Checks OS compatibility and permissions
# - Detects missing dependencies
# - Generates secure secrets (never uses default credentials)
# - Backs up an existing .env before any change
# - Starts services via Docker Compose and runs health checks
# - Prints status and next steps; stops safely on errors
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_ROOT/.env"
ENV_EXAMPLE="$PROJECT_ROOT/.env.example"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# --- 1. Privilege check -------------------------------------------------------
if [[ $EUID -ne 0 ]]; then
  error "This script must be run as root: sudo bash scripts/install.sh"
fi

# --- 2. OS compatibility ------------------------------------------------------
if [ -f /etc/os-release ]; then
  . /etc/os-release
  case "${ID:-}" in
    ubuntu|debian) info "Detected ${PRETTY_NAME:-$ID}" ;;
    *) warn "Untested OS: ${PRETTY_NAME:-unknown}. Continuing, but Ubuntu 22.04 LTS is recommended." ;;
  esac
else
  warn "Cannot detect OS. Continuing."
fi

# --- 3. Dependency detection --------------------------------------------------
command -v docker >/dev/null 2>&1 || {
  error "Docker is not installed. Install it first: https://docs.docker.com/engine/install/ubuntu/"
}
if docker compose version >/dev/null 2>&1; then
  DOCKER_COMPOSE="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  DOCKER_COMPOSE="docker-compose"
else
  error "Docker Compose is not installed. Install the compose plugin."
fi
info "Docker and Compose found."

# --- 4. Environment file ------------------------------------------------------
if [ -f "$ENV_FILE" ]; then
  warn ".env already exists."
  read -rp "Overwrite existing .env? A backup will be created first [y/N]: " CONFIRM
  if [[ "${CONFIRM:-n}" != "y" && "${CONFIRM:-n}" != "Y" ]]; then
    info "Keeping existing .env."
  else
    cp "$ENV_FILE" "$ENV_FILE.backup.$(date +%Y%m%d%H%M%S)"
    info "Existing .env backed up."
    cp "$ENV_EXAMPLE" "$ENV_FILE"
    info ".env created from template — you MUST edit it with real values."
  fi
else
  cp "$ENV_EXAMPLE" "$ENV_FILE"
  info ".env created from template."
fi

# --- 5. Generate secrets if placeholders remain -------------------------------
gen_secret() { openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'; }
set_env_var() { # set_env_var KEY VALUE — replaces or appends
  if grep -q "^$1=" "$ENV_FILE"; then
    sed -i "s|^$1=.*|$1=$2|" "$ENV_FILE"
  else
    echo "$1=$2" >> "$ENV_FILE"
  fi
}

if ! grep -q "^APP_SECRET=generate" "$ENV_FILE" 2>/dev/null; then :; fi
if grep -q "^APP_SECRET=$" "$ENV_FILE" || grep -q "^APP_SECRET=generate" "$ENV_FILE" || ! grep -q "^APP_SECRET=" "$ENV_FILE"; then
  set_env_var APP_SECRET "$(gen_secret)"
  info "Generated APP_SECRET"
fi
if ! grep -q "^JWT_SECRET=" "$ENV_FILE" || grep -q "your-jwt-secret" "$ENV_FILE"; then
  set_env_var JWT_SECRET "$(gen_secret)"
  info "Generated JWT_SECRET"
fi
if ! grep -q "^ENCRYPTION_KEY=" "$ENV_FILE" || grep -q "32-byte-encryption-key" "$ENV_FILE"; then
  set_env_var ENCRYPTION_KEY "$(gen_secret)"
  info "Generated ENCRYPTION_KEY"
fi
if ! grep -q "^DB_PASSWORD=" "$ENV_FILE"; then
  set_env_var DB_PASSWORD "$(gen_secret | cut -c1-24)"
  info "Generated DB_PASSWORD"
fi
if ! grep -q "^REDIS_PASSWORD=" "$ENV_FILE"; then
  set_env_var REDIS_PASSWORD "$(gen_secret | cut -c1-24)"
  info "Generated REDIS_PASSWORD"
fi

# --- 6. Validate critical config ----------------------------------------------
MISSING_REQUIRED=0
for var in TELEGRAM_BOT_TOKEN; do
  val=$(grep "^$var=" "$ENV_FILE" | cut -d= -f2- || true)
  if [ -z "$val" ] || [[ "$val" == your-* ]]; then
    warn "$var is not set. The Telegram bot will not start until it is configured."
    MISSING_REQUIRED=1
  fi
done

# --- 7. Build and start ---------------------------------------------------------
info "Building and starting services (this may take several minutes)..."
cd "$PROJECT_ROOT"
$DOCKER_COMPOSE up -d --build

# --- 8. Health checks -----------------------------------------------------------
info "Waiting for services to become healthy..."
for i in $(seq 1 30); do
  if curl -sf http://localhost:3000/health >/dev/null 2>&1; then
    info "Backend is healthy."
    break
  fi
  [ "$i" -eq 30 ] && error "Backend did not become healthy. Run: $DOCKER_COMPOSE logs backend"
  sleep 5
done

# --- 9. Status & next steps ------------------------------------------------------
info "=============================================="
info " Installation complete"
info "=============================================="
info "Services:"
$DOCKER_COMPOSE ps
echo
info "Next steps:"
echo "  1. Edit .env and set: TELEGRAM_BOT_TOKEN, panel credentials, payment gateway keys"
echo "  2. Apply database migrations:  $DOCKER_COMPOSE exec backend npm run migrate"
echo "  3. Create an admin user:       $DOCKER_COMPOSE exec backend npm run create-admin"
echo "  4. View logs:                  $DOCKER_COMPOSE logs -f backend"
if [ "$MISSING_REQUIRED" -eq 1 ]; then
  warn "Some required configuration is missing — see warnings above."
fi
