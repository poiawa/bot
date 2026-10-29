#!/usr/bin/env bash
# =============================================================================
# scripts/tests/run-tests.sh — unit tests for installer library + syntax checks.
# Usage: bash scripts/tests/run-tests.sh
# Pure-bash tests; no Docker or network required.
# =============================================================================
set -u
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
# shellcheck source=../lib/common.sh
source "$PROJECT_ROOT/scripts/lib/common.sh"

PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); printf '  \033[0;32mPASS\033[0m %s\n' "$1"; }
fail() { FAIL=$((FAIL+1)); printf '  \033[0;31mFAIL\033[0m %s\n' "$1"; }
expect() { # expect DESC EXPECTED ACTUAL
  if [ "$2" = "$3" ]; then ok "$1"; else fail "$1 (expected: '$2', got: '$3')"; fi
}
expect_rc() { # expect_rc DESC EXPECTED_RC ACTUAL_RC
  if [ "$2" -eq "$3" ]; then ok "$1"; else fail "$1 (expected rc=$2, got rc=$3)"; fi
}

TMPDIR_T="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_T"' EXIT

# --- 1. OS classification -----------------------------------------------------
printf 'ID=ubuntu\nVERSION_ID=22.04\nPRETTY_NAME="Ubuntu 22.04 LTS"\n' > "$TMPDIR_T/os1"
printf 'ID=ubuntu\nVERSION_ID=24.04\nPRETTY_NAME="Ubuntu 24.04 LTS"\n' > "$TMPDIR_T/os2"
printf 'ID=ubuntu\nVERSION_ID=20.04\nPRETTY_NAME="Ubuntu 20.04"\n'     > "$TMPDIR_T/os3"
printf 'ID=debian\nVERSION_ID=12\nPRETTY_NAME="Debian 12"\n'           > "$TMPDIR_T/os4"
printf 'ID=centos\nVERSION_ID=9\nPRETTY_NAME="CentOS 9"\n'             > "$TMPDIR_T/os5"
echo "== classify_os =="
case "$(classify_os "$TMPDIR_T/os1")" in supported*) ok "ubuntu 22.04 supported";; *) fail "ubuntu 22.04 supported" ;; esac
case "$(classify_os "$TMPDIR_T/os2")" in supported*) ok "ubuntu 24.04 supported";; *) fail "ubuntu 24.04 supported" ;; esac
case "$(classify_os "$TMPDIR_T/os3")" in unsupported*) ok "ubuntu 20.04 rejected";; *) fail "ubuntu 20.04 rejected" ;; esac
case "$(classify_os "$TMPDIR_T/os4")" in unsupported*) ok "debian rejected";; *) fail "debian rejected" ;; esac
case "$(classify_os "$TMPDIR_T/os5")" in unsupported*) ok "centos rejected";; *) fail "centos rejected" ;; esac
: > "$TMPDIR_T/os6"
case "$(classify_os "$TMPDIR_T/os6")" in unsupported*) ok "empty os-release rejected";; *) fail "empty os-release rejected" ;; esac

# --- 2. Placeholder detection ---------------------------------------------------
echo "== is_placeholder =="
if is_placeholder ""; then ok "empty is placeholder"; else fail "empty is placeholder"; fi
if is_placeholder "your-telegram-bot-token"; then ok "your-* is placeholder"; else fail "your-* is placeholder"; fi
if is_placeholder "change-me-securely"; then ok "change-me is placeholder"; else fail "change-me is placeholder"; fi
if is_placeholder "https://bot.example.com"; then ok "example.com is placeholder"; else fail "example.com is placeholder"; fi
if is_placeholder "32-byte-encryption-key-here"; then ok "encryption placeholder"; else fail "encryption placeholder"; fi
if is_placeholder "an-actual-produced-secret-value"; then fail "real value misdetected"; else ok "real value accepted"; fi

# --- 3. Secret generation --------------------------------------------------------
echo "== gen_secret =="
S1="$(gen_secret)"; S2="$(gen_secret)"
expect "secret is 64 hex chars" "64" "${#S1}"
if [ "$S1" != "$S2" ]; then ok "secrets are unique"; else fail "secrets are unique"; fi

# --- 4. env_set / env_get idempotency ---------------------------------------------
echo "== env_set/env_get =="
F="$TMPDIR_T/test.env"
cp "$PROJECT_ROOT/.env.example" "$F"
env_set "$F" JWT_SECRET "new-secret-1"
env_set "$F" JWT_SECRET "new-secret-2"   # second write must replace, not append
COUNT=$(grep -c '^JWT_SECRET=' "$F")
expect "JWT_SECRET appears exactly once" "1" "$COUNT"
expect "JWT_SECRET value updated" "new-secret-2" "$(env_get "$F" JWT_SECRET)"
env_set "$F" BRAND_NEW_KEY "brand-new"
expect "appended key readable" "brand-new" "$(env_get "$F" BRAND_NEW_KEY)"
COUNT=$(grep -c '^APP_SECRET=' "$F")
expect "no duplicate APP_SECRET in example" "1" "$COUNT"

# --- 5. env_has_real_value ---------------------------------------------------------
echo "== env_has_real_value =="
if env_has_real_value "$PROJECT_ROOT/.env.example" TELEGRAM_BOT_TOKEN; then fail "template token flagged real"; else ok "template token flagged placeholder"; fi
env_set "$F" TELEGRAM_BOT_TOKEN "123456:ABC-real"
if env_has_real_value "$F" TELEGRAM_BOT_TOKEN; then ok "real token accepted"; else fail "real token accepted"; fi

# --- 6. .env.example is committed-safe (no real-looking secrets) ---------------------
echo "== template hygiene =="
for var in TELEGRAM_BOT_TOKEN ZARINPAL_MERCHANT_ID JWT_SECRET ENCRYPTION_KEY DB_PASSWORD REDIS_PASSWORD; do
  val="$(env_get "$PROJECT_ROOT/.env.example" "$var")"
  if is_placeholder "$val"; then ok "$var is placeholder"; else fail "$var should be placeholder in template"; fi
done

# --- 7. Syntax-check every script (bash -n) ------------------------------------------
echo "== bash -n on all scripts =="
for f in "$PROJECT_ROOT"/scripts/*.sh; do
  if bash -n "$f" 2>/dev/null; then ok "syntax: $(basename "$f")"; else fail "syntax: $(basename "$f")"; fi
done

echo
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
