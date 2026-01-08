#!/bin/bash
# =============================================================================
# Reset Development Environment
# =============================================================================
# Completely resets the dev environment: database, uploads, and containers.
# WARNING: This deletes ALL data!
#
# Usage:
#   ./scripts/reset-dev.sh           # Full reset (asks for confirmation)
#   ./scripts/reset-dev.sh --force   # Skip confirmation
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${RED}⚠️  Reset Development Environment${NC}"
echo "================================"
echo "This will DELETE:"
echo "  • All database data (albums, photos, admin account)"
echo "  • All uploaded files"
echo "  • All Docker volumes"
echo ""

if [[ "$1" != "--force" ]]; then
    read -p "Are you sure? (type 'yes' to confirm): " confirm
    if [[ "$confirm" != "yes" ]]; then
        echo "Cancelled."
        exit 0
    fi
fi

echo ""
echo "Stopping containers..."
cd "$PROJECT_ROOT"
docker compose -f docker-compose.dev.yml down -v 2>/dev/null || true

echo ""
echo "Clearing local uploads..."
rm -rf "$PROJECT_ROOT/apps/python/uploads/originals"/* 2>/dev/null || true
rm -rf "$PROJECT_ROOT/apps/python/uploads/thumbnails"/* 2>/dev/null || true
rm -rf "$PROJECT_ROOT/apps/python/uploads/web"/* 2>/dev/null || true
rm -rf "$PROJECT_ROOT/apps/python/uploads/videos"/* 2>/dev/null || true
rm -f "$PROJECT_ROOT/apps/python/uploads"/temp_* 2>/dev/null || true

# Recreate directory structure
mkdir -p "$PROJECT_ROOT/apps/python/uploads"/{originals,thumbnails,web,videos}

echo ""
echo -e "${GREEN}✓ Development environment reset${NC}"
echo ""
echo "To start fresh, run:"
echo "  ./start.sh"
