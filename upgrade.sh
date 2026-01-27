# =============================================================================
# Unified upgrade script for Client Pix
# Handles backup, upgrade, health check, and rollback in one command
#
# NOTE: If you're using Coolify or another managed platform, you don't need
# this script. Coolify automatically pulls from GitHub, rebuilds containers,
# and preserves your data volumes. This script is for manual self-hosted
# deployments on a VPS or server where you manage Docker yourself.
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Default values
COMPOSE_FILE=""
NO_BACKUP=false
ROLLBACK_FILE=""
KEEP_BACKUPS=5
SKIP_PULL=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --compose)
            COMPOSE_FILE="$2"
            shift 2
            ;;
        --no-backup)
            NO_BACKUP=true
            shift
            ;;
        --rollback)
            ROLLBACK_FILE="$2"
            shift 2
            ;;
        --keep)
            KEEP_BACKUPS="$2"
            shift 2
            ;;
        --skip-pull)
            SKIP_PULL=true
            shift
            ;;
        -h|--help)
            echo "Usage: ./upgrade.sh [options]"
            echo ""
            echo "Options:"
            echo "  --compose <file>    Compose file (default: auto-detect)"
            echo "  --no-backup         Skip backup step (for fresh installs)"
            echo "  --rollback <file>   Rollback from backup file"
            echo "  --keep <n>          Keep last N backups (default: 5)"
            echo "  --skip-pull         Skip git pull (for local testing)"
            echo "  -h, --help          Show this help"
            echo ""
            echo "Examples:"
            echo "  ./upgrade.sh                          # Normal upgrade with backup"
            echo "  ./upgrade.sh --no-backup              # Upgrade without backup"
            echo "  ./upgrade.sh --rollback ./backups/*/database.sql"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Auto-detect compose file if not specified
if [[ -z "$COMPOSE_FILE" ]]; then
    if [[ -f "docker-compose.selfhost.yml" ]]; then
        COMPOSE_FILE="docker-compose.selfhost.yml"
    elif [[ -f "docker-compose.prod.yml" ]]; then
        COMPOSE_FILE="docker-compose.prod.yml"
    elif [[ -f "docker-compose.dev.yml" ]]; then
        COMPOSE_FILE="docker-compose.dev.yml"
    else
        echo -e "${RED}ERROR: No docker-compose file found${NC}"
        exit 1
    fi
fi

# Verify compose file exists
if [[ ! -f "$COMPOSE_FILE" ]]; then
    echo -e "${RED}ERROR: Compose file not found: $COMPOSE_FILE${NC}"
    exit 1
fi

# Header
echo ""
echo -e "${BLUE}╔══════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║       Client Pix Upgrade Utility         ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════╝${NC}"
echo ""
echo -e "Compose file: ${GREEN}$COMPOSE_FILE${NC}"
echo ""

# Handle rollback mode
if [[ -n "$ROLLBACK_FILE" ]]; then
    echo -e "${YELLOW}Running in ROLLBACK mode${NC}"
    echo ""
    ./scripts/rollback.sh "$COMPOSE_FILE" "$ROLLBACK_FILE"
    exit $?
fi

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}ERROR: Docker is not running${NC}"
    exit 1
fi

# Check if there's existing data (to determine if backup is needed)
HAS_DATA=false
if docker volume ls --format "{{.Name}}" | grep -q "postgres_data"; then
    # Check if containers are running and have data
    if docker compose -f "$COMPOSE_FILE" ps -q postgres 2>/dev/null | grep -q .; then
        HAS_DATA=true
    fi
fi

# Step 1: Backup (if not skipped and has data)
BACKUP_DIR=""
if [[ "$NO_BACKUP" == true ]]; then
    echo -e "${YELLOW}⏭  Skipping backup (--no-backup flag)${NC}"
elif [[ "$HAS_DATA" == false ]]; then
    echo -e "${YELLOW}⏭  Skipping backup (no existing data detected)${NC}"
else
    echo -e "${BLUE}📦 Step 1: Creating backup...${NC}"
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    BACKUP_DIR="./backups/$TIMESTAMP"
    mkdir -p "$BACKUP_DIR"

    # Database backup with --clean for clean restores
    if docker compose -f "$COMPOSE_FILE" exec -T postgres pg_dump --clean --if-exists -U clientpix clientpix > "$BACKUP_DIR/database.sql" 2>/dev/null; then
        DB_SIZE=$(du -h "$BACKUP_DIR/database.sql" | cut -f1)
        echo -e "   ${GREEN}✓${NC} Database backup created ($DB_SIZE)"
    else
        echo -e "   ${YELLOW}⚠${NC} Database backup failed (will continue without backup)"
        rm -rf "$BACKUP_DIR"
        BACKUP_DIR=""
    fi

    # Version info
    if [[ -n "$BACKUP_DIR" ]]; then
        echo "Branch: $(git branch --show-current 2>/dev/null || echo 'unknown')" > "$BACKUP_DIR/version.txt"
        echo "Commit: $(git rev-parse HEAD 2>/dev/null || echo 'unknown')" >> "$BACKUP_DIR/version.txt"
        docker compose -f "$COMPOSE_FILE" images > "$BACKUP_DIR/images.txt" 2>/dev/null || true
        echo -e "   ${GREEN}✓${NC} Version info saved to $BACKUP_DIR"
    fi
    echo ""
fi

# Step 2: Pull latest code
if [[ "$SKIP_PULL" == true ]]; then
    echo -e "${YELLOW}⏭  Skipping git pull (--skip-pull flag)${NC}"
else
    echo -e "${BLUE}📥 Step 2: Pulling latest code...${NC}"
    if git pull origin main 2>&1 | head -5; then
        echo -e "   ${GREEN}✓${NC} Code updated"
    else
        echo -e "   ${YELLOW}⚠${NC} Git pull failed (continuing with current code)"
    fi
fi
echo ""

# Step 3: Rebuild and restart
echo -e "${BLUE}🔨 Step 3: Rebuilding containers...${NC}"
if docker compose -f "$COMPOSE_FILE" up -d --build 2>&1 | tail -10; then
    echo -e "   ${GREEN}✓${NC} Containers rebuilt and started"
else
    echo -e "   ${RED}✗${NC} Container build failed"
    if [[ -n "$BACKUP_DIR" ]]; then
        echo ""
        echo -e "${YELLOW}Rollback available: ./upgrade.sh --rollback $BACKUP_DIR/database.sql${NC}"
    fi
    exit 1
fi
echo ""

# Step 4: Health check with retries
echo -e "${BLUE}🏥 Step 4: Running health check...${NC}"
echo "   Waiting for services to start..."
sleep 10

HEALTH_OK=false
for attempt in 1 2 3; do
    if ./scripts/health-check.sh "$COMPOSE_FILE" > /dev/null 2>&1; then
        HEALTH_OK=true
        break
    fi
    if [[ $attempt -lt 3 ]]; then
        echo "   Attempt $attempt failed, retrying in 10 seconds..."
        sleep 10
    fi
done

if [[ "$HEALTH_OK" == true ]]; then
    echo -e "   ${GREEN}✓${NC} All health checks passed"
else
    echo -e "   ${RED}✗${NC} Health checks failed"
    ./scripts/health-check.sh "$COMPOSE_FILE" || true

    if [[ -n "$BACKUP_DIR" ]]; then
        echo ""
        echo -e "${YELLOW}Would you like to rollback? (y/N)${NC}"
        read -r -n 1 REPLY
        echo ""
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            ./scripts/rollback.sh "$COMPOSE_FILE" "$BACKUP_DIR/database.sql"
            exit $?
        fi
    fi
    exit 1
fi
echo ""

# Step 5: Cleanup old backups
if [[ -d "./backups" ]] && [[ $KEEP_BACKUPS -gt 0 ]]; then
    BACKUP_COUNT=$(ls -1d ./backups/*/ 2>/dev/null | wc -l | tr -d ' ')
    if [[ $BACKUP_COUNT -gt $KEEP_BACKUPS ]]; then
        echo -e "${BLUE}🧹 Step 5: Cleaning up old backups...${NC}"
        # Remove oldest backups, keeping the most recent N
        ls -1dt ./backups/*/ | tail -n +$((KEEP_BACKUPS + 1)) | xargs rm -rf
        REMOVED=$((BACKUP_COUNT - KEEP_BACKUPS))
        echo -e "   ${GREEN}✓${NC} Removed $REMOVED old backup(s), keeping last $KEEP_BACKUPS"
        echo ""
    fi
fi

# Success!
echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║          Upgrade Complete! 🎉            ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
echo ""
if [[ -n "$BACKUP_DIR" ]]; then
    echo -e "Backup saved to: ${BLUE}$BACKUP_DIR${NC}"
    echo -e "To rollback:     ${YELLOW}./upgrade.sh --rollback $BACKUP_DIR/database.sql${NC}"
fi
echo ""
