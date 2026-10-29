#!/usr/bin/env bash
# Usage: bash scripts/logs.sh [service] [lines]   e.g. bash scripts/logs.sh backend 100
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$(dirname "$SCRIPT_DIR")"
SERVICE="${1:-}"
LINES="${2:-100}"
if [ -n "$SERVICE" ]; then
  docker compose logs --tail "$LINES" "$SERVICE"
else
  docker compose logs --tail "$LINES"
fi
