# Pre-upgrade safety script for Client Pix
# Creates backups and performs safety checks before upgrading

set -e

COMPOSE_FILE="${1:-docker-compose.selfhost.yml}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="./backups/$TIMESTAMP"

echo "=== Client Pix Pre-Upgrade Safety Check ==="
echo "Timestamp: $TIMESTAMP"
echo "Compose file: $COMPOSE_FILE"
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "ERROR: Docker is not running"
    exit 1
fi

# Create backup directory
mkdir -p "$BACKUP_DIR"
echo "Backup directory: $BACKUP_DIR"
echo ""

# Backup database
echo "Creating database backup..."
# Use --clean to include DROP statements for clean restores
if docker compose -f "$COMPOSE_FILE" exec -T postgres pg_dump --clean --if-exists -U clientpix clientpix > "$BACKUP_DIR/database.sql" 2>/dev/null; then
    DB_SIZE=$(du -h "$BACKUP_DIR/database.sql" | cut -f1)
    echo "[   OK    ] Database backup created ($DB_SIZE)"
else
    echo "[ WARNING ] Database backup failed (container may not be running)"
    echo "           If this is a fresh install, this is expected."
fi

# Record current git commit
echo ""
echo "Recording current version..."
GIT_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
GIT_BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
echo "Branch: $GIT_BRANCH" > "$BACKUP_DIR/version.txt"
echo "Commit: $GIT_COMMIT" >> "$BACKUP_DIR/version.txt"
echo "[   OK    ] Git version recorded"

# Record current image versions
echo ""
echo "Recording Docker image versions..."
docker compose -f "$COMPOSE_FILE" images > "$BACKUP_DIR/images.txt" 2>/dev/null || true
echo "[   OK    ] Image versions recorded"

# List critical volumes
echo ""
echo "=== CRITICAL: Data Volumes ==="
echo "The following volumes contain your data and must NOT be deleted:"
echo ""
docker volume ls --format "{{.Name}}" | grep -E "(postgres_data|uploads_data)" || echo "(No matching volumes found)"
echo ""
echo "WARNING: Never run 'docker compose down -v' as it will delete all data!"
echo ""

# Summary
echo "=== Pre-Upgrade Summary ==="
echo "Backup location: $BACKUP_DIR"
echo ""
echo "Contents:"
ls -la "$BACKUP_DIR"
echo ""
echo "To proceed with upgrade:"
echo "  1. git pull origin main"
echo "  2. docker compose -f $COMPOSE_FILE up -d --build"
echo "  3. ./scripts/health-check.sh $COMPOSE_FILE"
echo ""
echo "To rollback if needed:"
echo "  ./scripts/rollback.sh $COMPOSE_FILE $BACKUP_DIR/database.sql"
echo ""
