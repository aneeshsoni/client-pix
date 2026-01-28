#!/bin/bash
# =============================================================================
# Development Start Script
# =============================================================================
# Simple wrapper around docker compose for development.
#
# Usage:
#   ./start.sh        - Start all services
#   ./start.sh down   - Stop all services
#   ./start.sh logs   - View logs
#   ./start.sh build  - Rebuild containers
#   ./start.sh fresh  - Remove containers & volumes, rebuild images (no cache), start
# =============================================================================

set -e

COMPOSE_FILE="docker-compose.dev.yml"

case "${1:-up}" in
    up)
        echo "Starting development environment..."
        docker compose -f $COMPOSE_FILE up --build -d
        echo ""
        echo "✓ Services starting..."
        echo ""
        echo "  App:  http://localhost"
        echo "  API:  http://localhost/api"
        echo "  Docs: http://localhost/docs"
        echo ""
        echo "View logs: ./start.sh logs"
        echo "Stop:      ./start.sh down"
        ;;
    down)
        echo "Stopping development environment..."
        docker compose -f $COMPOSE_FILE down
        ;;
    logs)
        docker compose -f $COMPOSE_FILE logs -f
        ;;
    build)
        echo "Rebuilding containers..."
        docker compose -f $COMPOSE_FILE build --no-cache
        ;;
    fresh)
        echo ""
        echo "⚠️  WARNING: This will DELETE ALL DATA including:"
        echo "   - Database (albums, users, settings)"
        echo "   - Uploaded photos and videos"
        echo ""
        read -p "Are you sure? Type 'yes' to confirm: " CONFIRM
        if [[ "$CONFIRM" != "yes" ]]; then
            echo "Cancelled."
            exit 0
        fi
        echo ""
        echo "Performing fresh rebuild..."
        echo "Stopping and removing containers, networks, and volumes..."
        docker compose -f $COMPOSE_FILE down -v --remove-orphans
        echo "Rebuilding images with no cache and pulling latest bases..."
        docker compose -f $COMPOSE_FILE build --no-cache --pull
        echo "Starting services..."
        docker compose -f $COMPOSE_FILE up -d
        echo ""
        echo "✓ Fresh rebuild complete"
        echo "View logs: ./start.sh logs"
        ;;
    restart)
        docker compose -f $COMPOSE_FILE restart
        ;;
    *)
        echo "Usage: ./start.sh [up|down|logs|build|fresh|restart]"
        exit 1
        ;;
esac
