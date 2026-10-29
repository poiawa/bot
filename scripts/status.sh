#!/usr/bin/env bash
# Usage: bash scripts/status.sh — service state, health, disk, volumes. Read-only.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"
cd "$PROJECT_ROOT"

command -v docker >/dev/null 2>&1 || die "Docker not installed."

echo "=== Containers ==="
docker compose ps
echo
echo "=== Health (HTTP) ==="
HEALTH_CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://localhost/health 2>/dev/null || echo 'unreachable')
echo "  backend /health: $HEALTH_CODE"
echo
echo "=== Disk ==="
df -h "$PROJECT_ROOT" | awk 'NR==1 || NR==2'
echo
echo "=== Volumes (persistent data) ==="
docker volume ls --filter name=vpnbot 2>/dev/null || docker volume ls | grep -i bot || true
echo
echo "=== Last 5 backend log lines ==="
docker compose logs --tail 5 backend 2>/dev/null | tail -5 || true
