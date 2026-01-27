# Rollback script for Client Pix
# Restores from backup if an upgrade fails

set -e

COMPOSE_FILE="${1:-docker-compose.selfhost.yml}"
BACKUP_SQL="$2"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

echo "=== Client Pix Rollback ==="
echo ""

# Check arguments
if [[ -z "$BACKUP_SQL" ]]; then
    echo "Usage: ./scripts/rollback.sh [compose-file] <backup.sql>"
    echo ""
    echo "Examples:"
    echo "  ./scripts/rollback.sh docker-compose.selfhost.yml ./backups/20240115_120000/database.sql"
    echo "  ./scripts/rollback.sh ./backups/20240115_120000/database.sql"
    echo ""
    echo "Available backups:"
    ls -la ./backups/ 2>/dev/null || echo "  No backups found in ./backups/"
    exit 1
fi

# Handle case where first arg is the backup file
if [[ -f "$COMPOSE_FILE" && "$COMPOSE_FILE" == *.sql ]]; then
    BACKUP_SQL="$COMPOSE_FILE"
    COMPOSE_FILE="docker-compose.selfhost.yml"
fi

if [[ ! -f "$BACKUP_SQL" ]]; then
    echo "ERROR: Backup file not found: $BACKUP_SQL"
    exit 1
fi

echo "Compose file: $COMPOSE_FILE"
echo "Backup file: $BACKUP_SQL"
echo ""

# Get the backup directory to find version info
BACKUP_DIR=$(dirname "$BACKUP_SQL")

# Check for version info
if [[ -f "$BACKUP_DIR/version.txt" ]]; then
    echo "Backup version info:"
    cat "$BACKUP_DIR/version.txt"
    echo ""
fi

# Confirm rollback
echo "WARNING: This will restore the database from backup."
echo "         Current database contents will be replaced."
echo ""
read -p "Are you sure you want to proceed? (y/N) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Rollback cancelled."
    exit 0
fi

echo ""
echo "Starting rollback..."
echo ""

# Check if we need to rollback git
if [[ -f "$BACKUP_DIR/version.txt" ]]; then
    BACKUP_COMMIT=$(grep "Commit:" "$BACKUP_DIR/version.txt" | cut -d' ' -f2)
    CURRENT_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "unknown")

    if [[ "$BACKUP_COMMIT" != "unknown" && "$BACKUP_COMMIT" != "$CURRENT_COMMIT" ]]; then
        echo "Git version mismatch detected."
        echo "  Current: $CURRENT_COMMIT"
        echo "  Backup:  $BACKUP_COMMIT"
        echo ""
        read -p "Checkout backup version? (y/N) " -n 1 -r
        echo ""
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            git checkout "$BACKUP_COMMIT"
            echo "[   OK    ] Checked out $BACKUP_COMMIT"
        fi
    fi
fi

# Stop containers (keep volumes!)
echo ""
echo "Stopping containers..."
docker compose -f "$COMPOSE_FILE" down
echo "[   OK    ] Containers stopped"

# Start only postgres for restore
echo ""
echo "Starting database for restore..."
docker compose -f "$COMPOSE_FILE" up -d postgres
echo "Waiting for database to be ready..."
sleep 10

# Check if postgres is ready
for i in {1..30}; do
    if docker compose -f "$COMPOSE_FILE" exec -T postgres pg_isready -U clientpix > /dev/null 2>&1; then
        break
    fi
    echo "Waiting for postgres... ($i/30)"
    sleep 2
done

# Restore database
echo ""
echo "Restoring database from backup..."
# Drop and recreate public schema for clean restore (handles both old and new backup formats)
docker compose -f "$COMPOSE_FILE" exec -T postgres psql -U clientpix -d clientpix -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" 2>/dev/null || true
docker compose -f "$COMPOSE_FILE" exec -T postgres psql -U clientpix -d clientpix < "$BACKUP_SQL"
echo "[   OK    ] Database restored"

# Rebuild and restart all containers
echo ""
echo "Rebuilding and starting all containers..."
docker compose -f "$COMPOSE_FILE" up -d --build
echo "[   OK    ] Containers started"

# Run health check
echo ""
echo "Running health check..."
sleep 10
"$SCRIPT_DIR/health-check.sh" "$COMPOSE_FILE" || true

echo ""
echo "=== Rollback Complete ==="
echo ""
echo "Please verify the application is working correctly."
