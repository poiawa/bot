#!/usr/bin/env bash
# =============================================================================
# scripts/configure-env.sh — sourced by install.sh (not executable directly).
# Creates/updates .env: interactive prompts + secure generated secrets.
# Never prints secret values.
# =============================================================================

SCRIPT_DIR_CFG="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_EXAMPLE="${ENV_EXAMPLE:-$(dirname "$SCRIPT_DIR_CFG")/.env.example}"

# --- Interactive configuration -------------------------------------------------
echo
info "=== Configuration ==="
DEFAULT_DOMAIN="$(env_get "$ENV_FILE" APP_URL 2>/dev/null || true)"
DEFAULT_DOMAIN="${DEFAULT_DOMAIN:-}"
read -rp "Domain name for HTTPS/app URL (e.g. vpn.example.com) [localhost]: " DOMAIN || DOMAIN=""
DOMAIN="${DOMAIN:-localhost}"

if [ "$DOMAIN" = "localhost" ]; then
  APP_URL_VALUE="http://localhost"
else
  APP_URL_VALUE="https://$DOMAIN"
fi

read -rp "Telegram bot token (from @BotFather) — leave empty to configure later: " TG_TOKEN || TG_TOKEN=""

MINI_APP_URL_VALUE="$APP_URL_VALUE/mini-app"

# --- Write .env ------------------------------------------------------------------
if [ ! -f "$ENV_FILE" ]; then
  cp "$ENV_EXAMPLE" "$ENV_FILE"
  info ".env created from template"
fi

# Server-facing URLs (docker network uses its own DATABASE_URL/REDIS_URL)
env_set "$ENV_FILE" APP_URL "$APP_URL_VALUE"
env_set "$ENV_FILE" MINI_APP_URL "$MINI_APP_URL_VALUE"

# Generate secrets ONLY when missing/placeholder — never clobber real values
env_has_real_value "$ENV_FILE" JWT_SECRET      || env_set "$ENV_FILE" JWT_SECRET "$(gen_secret)"
env_has_real_value "$ENV_FILE" ENCRYPTION_KEY  || env_set "$ENV_FILE" ENCRYPTION_KEY "$(gen_secret)"
env_has_real_value "$ENV_FILE" DB_PASSWORD     || env_set "$ENV_FILE" DB_PASSWORD "$(gen_secret | cut -c1-24)"
env_has_real_value "$ENV_FILE" REDIS_PASSWORD  || env_set "$ENV_FILE" REDIS_PASSWORD "$(gen_secret | cut -c1-24)"
if [ -n "$TG_TOKEN" ]; then
  env_set "$ENV_FILE" TELEGRAM_BOT_TOKEN "$TG_TOKEN"
else
  env_has_real_value "$ENV_FILE" TELEGRAM_BOT_TOKEN || warn "TELEGRAM_BOT_TOKEN not set — bot features disabled until configured."
fi

chmod 600 "$ENV_FILE"
info "Secrets generated (values hidden). .env permissions set to 600."

# --- Validation gate: fail BEFORE starting services ---------------------------------
echo
info "=== Validating configuration ==="
VALIDATION_FAILED=0
for var in JWT_SECRET ENCRYPTION_KEY DB_PASSWORD REDIS_PASSWORD; do
  if env_has_real_value "$ENV_FILE" "$var"; then
    info "  $var: OK"
  else
    err "  $var: missing or placeholder"
    VALIDATION_FAILED=1
  fi
done
if [ "$VALIDATION_FAILED" -eq 1 ]; then
  die "Configuration validation failed — services NOT started. Fix .env and re-run."
fi
info "Configuration valid."
