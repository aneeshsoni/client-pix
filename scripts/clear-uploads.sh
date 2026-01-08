#!/bin/bash
# =============================================================================
# Clear Uploads Directory
# =============================================================================
# Clears all uploaded files while preserving the directory structure.
# Use this during development to reset the uploads without losing DB data.
#
# Usage:
#   ./scripts/clear-uploads.sh        # Clear uploads in Docker volume
#   ./scripts/clear-uploads.sh --local # Clear local uploads directory
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🗑️  Clear Uploads${NC}"
echo "================================"

if [[ "$1" == "--local" ]]; then
    # Clear local uploads directory
    UPLOADS_DIR="$PROJECT_ROOT/apps/python/uploads"
    
    if [[ ! -d "$UPLOADS_DIR" ]]; then
        echo -e "${RED}❌ Local uploads directory not found: $UPLOADS_DIR${NC}"
        exit 1
    fi
    
    echo "Clearing local uploads directory..."
    
    # Remove contents but keep directory structure
    rm -rf "$UPLOADS_DIR/originals"/*
    rm -rf "$UPLOADS_DIR/thumbnails"/*
    rm -rf "$UPLOADS_DIR/web"/*
    rm -rf "$UPLOADS_DIR/videos"/*
    
    # Remove any temp files
    rm -f "$UPLOADS_DIR"/temp_*
    
    echo -e "${GREEN}✓ Local uploads cleared${NC}"
else
    # Clear uploads in Docker volume
    if ! docker ps --format '{{.Names}}' | grep -q "clientpix-backend"; then
        echo -e "${RED}❌ Backend container not running. Start with: ./start.sh${NC}"
        exit 1
    fi
    
    echo "Clearing uploads in Docker volume..."
    
    docker exec clientpix-backend sh -c '
        rm -rf /app/uploads/originals/* 2>/dev/null || true
        rm -rf /app/uploads/thumbnails/* 2>/dev/null || true
        rm -rf /app/uploads/web/* 2>/dev/null || true
        rm -rf /app/uploads/videos/* 2>/dev/null || true
        rm -f /app/uploads/temp_* 2>/dev/null || true
    '
    
    echo -e "${GREEN}✓ Docker uploads cleared${NC}"
fi

echo ""
echo -e "${YELLOW}Note:${NC} Database records still reference these files."
echo "To fully reset, also run: ./scripts/reset-dev.sh"
