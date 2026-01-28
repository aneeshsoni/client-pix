#!/bin/bash
# Health check script for Client Pix containers
# Verifies all services are running and healthy

set -e

COMPOSE_FILE="${1:-docker-compose.selfhost.yml}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

echo "=== Client Pix Health Check ==="
echo "Using compose file: $COMPOSE_FILE"
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "ERROR: Docker is not running"
    exit 1
fi

# Check if compose file exists
if [[ ! -f "$COMPOSE_FILE" ]]; then
    echo "ERROR: Compose file not found: $COMPOSE_FILE"
    exit 1
fi

# Get list of services from compose file
SERVICES=$(docker compose -f "$COMPOSE_FILE" config --services 2>/dev/null || echo "")

if [[ -z "$SERVICES" ]]; then
    echo "ERROR: No services found in $COMPOSE_FILE"
    exit 1
fi

echo "Checking container status..."
echo ""

ALL_HEALTHY=true

for service in $SERVICES; do
    # Get container status
    STATUS=$(docker compose -f "$COMPOSE_FILE" ps --format "{{.Status}}" "$service" 2>/dev/null | head -1)

    if [[ -z "$STATUS" ]]; then
        echo "[ STOPPED ] $service"
        ALL_HEALTHY=false
    elif [[ "$STATUS" == *"healthy"* ]]; then
        echo "[   OK   ] $service (healthy)"
    elif [[ "$STATUS" == *"Up"* ]]; then
        echo "[   OK   ] $service (running)"
    else
        echo "[ WARNING ] $service ($STATUS)"
        ALL_HEALTHY=false
    fi
done

echo ""

# Test API health endpoint
echo "Testing API health endpoint..."
if curl -sf http://localhost/api/system/health > /dev/null 2>&1; then
    echo "[   OK   ] API responding at /api/system/health"
else
    echo "[  FAILED  ] API health endpoint not responding"
    ALL_HEALTHY=false
fi

echo ""

# Check critical volumes
echo "Checking data volumes..."
POSTGRES_VOLUME=$(docker volume ls --format "{{.Name}}" | grep -E "postgres_data$" | head -1)
UPLOADS_VOLUME=$(docker volume ls --format "{{.Name}}" | grep -E "uploads_data$" | head -1)

if [[ -n "$POSTGRES_VOLUME" ]]; then
    echo "[   OK   ] Database volume exists: $POSTGRES_VOLUME"
else
    echo "[ WARNING ] Database volume not found"
fi

if [[ -n "$UPLOADS_VOLUME" ]]; then
    echo "[   OK   ] Uploads volume exists: $UPLOADS_VOLUME"
else
    echo "[ WARNING ] Uploads volume not found"
fi

echo ""

if $ALL_HEALTHY; then
    echo "=== All health checks passed ==="
    exit 0
else
    echo "=== Some health checks failed ==="
    exit 1
fi
