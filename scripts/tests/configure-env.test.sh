#!/usr/bin/env bash
# Functional smoke test for configure-env.sh (no Docker, no real services).
# Simulates install.sh by exporting the variables configure-env expects,
# then piping interactive answers. Runs entirely in a temp directory.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
# shellcheck source=../lib/common.sh
source "$PROJECT_ROOT/scripts/lib/common.sh"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
cp "$PROJECT_ROOT/.env.example" "$WORK/.env.example"

# Simulate install.sh's sourcing environment
SCRIPT_DIR="$PROJECT_ROOT/scripts"
PROJECT_ROOT="$WORK"
ENV_FILE="$WORK/.env"
export SCRIPT_DIR PROJECT_ROOT ENV_FILE

PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); printf '  PASS %s\n' "$1"; }
fail() { FAIL=$((FAIL+1)); printf '  FAIL %s\n' "$1"; }

# Run configure-env with piped answers: domain + empty token
( cd "$WORK" && printf 'vpn.my-real-site.com\n\n' | source "$SCRIPT_DIR/configure-env.sh" ) 2>/dev/null

# Assertions
v="$(env_get "$ENV_FILE" APP_URL)"
[ "$v" = "https://vpn.my-real-site.com" ] && ok "APP_URL from domain" || fail "APP_URL from domain (got: $v)"
v="$(env_get "$ENV_FILE" MINI_APP_URL)"
[ "$v" = "https://vpn.my-real-site.com/mini-app" ] && ok "MINI_APP_URL derived" || fail "MINI_APP_URL (got: $v)"
v="$(env_get "$ENV_FILE" JWT_SECRET)"
[ ${#v} -eq 64 ] && ok "JWT_SECRET generated (len 64)" || fail "JWT_SECRET length ${#v}"
v="$(env_get "$ENV_FILE" DB_PASSWORD)"
[ ${#v} -eq 24 ] && ok "DB_PASSWORD generated (len 24)" || fail "DB_PASSWORD length ${#v}"
v="$(env_get "$ENV_FILE" TELEGRAM_BOT_TOKEN)"
[ "$v" = "your-telegram-bot-token" ] && ok "empty token left as placeholder (warned)" || fail "token changed unexpectedly"
PERM=$(stat -c '%a' "$ENV_FILE" 2>/dev/null || echo '?')
case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*) ok ".env perm check skipped (Windows/MSYS chmod is a no-op)";;
  *) [ "$PERM" = "600" ] && ok ".env chmod 600" || fail ".env perms: $PERM" ;;
esac

# Idempotent re-run: secrets must NOT change (never clobber real values)
J1="$(env_get "$ENV_FILE" JWT_SECRET)"; D1="$(env_get "$ENV_FILE" DB_PASSWORD)"
( cd "$WORK" && printf '\n\n' | source "$SCRIPT_DIR/configure-env.sh" ) 2>/dev/null
J2="$(env_get "$ENV_FILE" JWT_SECRET)"; D2="$(env_get "$ENV_FILE" DB_PASSWORD)"
[ "$J1" = "$J2" ] && ok "re-run preserves JWT_SECRET" || fail "re-run clobbered JWT_SECRET"
[ "$D1" = "$D2" ] && ok "re-run preserves DB_PASSWORD" || fail "re-run clobbered DB_PASSWORD"

# Real token supplied on re-run must be stored
( cd "$WORK" && printf '\n123456:AA-RealTestToken\n' | source "$SCRIPT_DIR/configure-env.sh" ) 2>/dev/null
v="$(env_get "$ENV_FILE" TELEGRAM_BOT_TOKEN)"
[ "$v" = "123456:AA-RealTestToken" ] && ok "real token stored on re-run" || fail "real token not stored (got: $v)"

# No secret ever printed: re-run capturing stdout, ensure no 64-hex appears
OUT="$( cd "$WORK" && printf '\n\n' | source "$SCRIPT_DIR/configure-env.sh" 2>/dev/null )"
if echo "$OUT" | grep -qE '[0-9a-f]{64}'; then fail "secret leaked to stdout"; else ok "no secrets in stdout"; fi

echo
echo "configure-env smoke: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
