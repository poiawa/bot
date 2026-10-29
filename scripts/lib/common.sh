#!/usr/bin/env bash
# =============================================================================
# scripts/lib/common.sh — shared helpers for all platform scripts.
# Sourced only. Contains pure, testable functions where possible.
# Never prints secrets. All functions are idempotent-safe where possible.
# =============================================================================

# --- Colors / logging --------------------------------------------------------
if [ -t 1 ]; then
  C_RED='\033[0;31m'; C_GREEN='\033[0;32m'; C_YELLOW='\033[1;33m'; C_BLUE='\033[0;34m'; C_NC='\033[0m'
else
  C_RED=''; C_GREEN=''; C_YELLOW=''; C_BLUE=''; C_NC=''
fi
info()  { printf '%s\n' "${C_GREEN}[INFO]${C_NC} $*"; }
warn()  { printf '%s\n' "${C_YELLOW}[WARN]${C_NC} $*"; }
err()   { printf '%s\n' "${C_RED}[ERROR]${C_NC} $*" >&2; }
die()   { err "$*"; exit 1; }

confirm() { # confirm PROMPT [default=y|n] -> returns 0 on yes
  local prompt="${1:-Continue?}" def="${2:-n}" ans
  if [ "$def" = "y" ]; then
    read -rp "$prompt [Y/n]: " ans || ans="n"
    [ -z "$ans" ] && ans="y"
  else
    read -rp "$prompt [y/N]: " ans
    [ -z "$ans" ] && ans="n"
  fi
  [ "$ans" = "y" ] || [ "$ans" = "Y" ]
}

# --- OS support ---------------------------------------------------------------
# Prints "supported" / "unsupported:<reason>" / "unknown". Pure (reads /etc/os-release file passed as $1).
classify_os() { # classify_os OS_RELEASE_FILE
  local file="$1"
  [ -f "$file" ] || { echo "unsupported:no /etc/os-release"; return; }
  local id="" ver=""
  # shellcheck disable=SC1091
  . "$1"
  id="${ID:-}"
  ver="${VERSION_ID:-}"
  if [ "$id" != "ubuntu" ]; then
    echo "unsupported:only Ubuntu 22.04/24.04 LTS are supported (detected: ${PRETTY_NAME:-$id})"
    return
  fi
  case "$ver" in
    22.04|24.04) echo "supported:${PRETTY_NAME:-Ubuntu $ver}" ;;
    *) echo "unsupported:Ubuntu $ver is not supported — use 22.04 LTS or 24.04 LTS" ;;
  esac
}

# --- Resource checks ----------------------------------------------------------
disk_free_mb() { # of a given path
  df -Pm "$1" 2>/dev/null | awk 'NR==2 {print $4}'
}
mem_total_mb() {
  awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo 2>/dev/null || echo 0
}
port_in_use() { # port_in_use PORT -> 0 if in use
  local port="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -Htan 2>/dev/null | awk '{print $4}' | grep -qE "[:.]${port}$"
  elif command -v netstat >/dev/null 2>&1; then
    netstat -ltn 2>/dev/null | grep -qE "[:.]${port}[[:space:]]"
  else
    return 1 # cannot check — assume free but caller should warn
  fi
}

# --- Secrets / env file helpers ------------------------------------------------
gen_secret() { # 64 hex chars; never echoed by callers to logs
  openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'
}
env_get() { # env_get FILE KEY -> prints value (may be empty)
  grep -E "^$2=" "$1" 2>/dev/null | tail -n1 | cut -d= -f2- | sed 's/^"//; s/"$//'
}
env_set() { # env_set FILE KEY VALUE — replaces existing key or appends
  local file="$1" key="$2" value="$3"
  touch "$file"
  if grep -qE "^${key}=" "$file"; then
    sed -i.bak "s|^${key}=.*|${key}=${value}|" "$file" && rm -f "${file}.bak"
  else
    printf '%s=%s\n' "$key" "$value" >> "$file"
  fi
}
is_placeholder() { # true if value is empty or looks like an example/placeholder
  local v="$1"
  [ -z "$v" ] && return 0
  case "$v" in
    your-*|*change-me*|*example.com*|"generate-a-secure"*|"32-byte-encryption-key-here"|*your_*|*-here) return 0 ;;
    *) return 1 ;;
  esac
}
env_has_real_value() { # env_has_real_value FILE KEY -> 0 if set and not placeholder
  local v
  v="$(env_get "$1" "$2")"
  ! is_placeholder "$v"
}
