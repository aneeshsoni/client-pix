#!/bin/bash
# =============================================================================
# Client Pix - One-Command Installer
# =============================================================================
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/aneeshsoni/client-pix/main/install.sh | bash
#
# Options (environment variables):
#   INSTALL_DIR   Where to install (default: ~/client-pix)
#   DOMAIN        Your domain for HTTPS (leave empty for LAN-only access)
#   CLIENT_PIX_UPLOADS_PATH
#                 Optional host/NAS folder for uploaded files
# =============================================================================
set -euo pipefail

REPO="aneeshsoni/client-pix"
BRANCH="main"
INSTALL_DIR="${INSTALL_DIR:-$HOME/client-pix}"
BASE_URL="https://raw.githubusercontent.com/$REPO/$BRANCH"

# -----------------------------------------------------------------------------
# Colors
# -----------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

info()  { echo -e "${BLUE}[INFO]${NC}  $1"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# -----------------------------------------------------------------------------
# Banner
# -----------------------------------------------------------------------------
echo ""
echo -e "${BLUE}╔══════════════════════════════════════╗${NC}"
echo -e "${BLUE}║${NC}       Client Pix Installer           ${BLUE}║${NC}"
echo -e "${BLUE}║${NC}   Self-hosted photo galleries        ${BLUE}║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════╝${NC}"
echo ""

# -----------------------------------------------------------------------------
# Prerequisites
# -----------------------------------------------------------------------------
info "Checking prerequisites..."

if ! command -v docker &>/dev/null; then
  error "Docker is required but not installed.\n       Install it from https://docs.docker.com/get-docker/"
fi
ok "Docker found"

if ! docker compose version &>/dev/null; then
  error "Docker Compose v2 is required but not found.\n       It should be included with Docker Desktop, or install the plugin:\n       https://docs.docker.com/compose/install/"
fi
ok "Docker Compose found"

if ! command -v curl &>/dev/null; then
  error "curl is required but not installed."
fi
ok "curl found"

# Check if Docker daemon is running
if ! docker info &>/dev/null 2>&1; then
  error "Docker daemon is not running. Please start Docker and try again."
fi
ok "Docker daemon is running"

echo ""

# -----------------------------------------------------------------------------
# Configuration
# -----------------------------------------------------------------------------
info "Setting up configuration..."

# Domain
if [ -z "${DOMAIN:-}" ]; then
  echo ""
  echo "  Enter your domain for automatic HTTPS (e.g. photos.example.com)"
  echo "  Leave blank for local/LAN access (HTTP only, good for NAS installs)"
  echo ""
  read -rp "  Domain: " DOMAIN < /dev/tty
fi
DOMAIN="${DOMAIN:-localhost}"

# Upload storage
if [ -z "${CLIENT_PIX_UPLOADS_PATH+x}" ]; then
  echo ""
  echo "  Optional: store uploads in a normal host/NAS folder"
  echo "  Leave blank to use Docker's managed uploads volume"
  echo "  Example: /volume1/photos/client-pix/uploads"
  echo ""
  if [ -r /dev/tty ]; then
    read -rp "  Upload storage path: " CLIENT_PIX_UPLOADS_PATH < /dev/tty
  else
    CLIENT_PIX_UPLOADS_PATH=""
  fi
fi

if [ -n "${CLIENT_PIX_UPLOADS_PATH:-}" ]; then
  case "$CLIENT_PIX_UPLOADS_PATH" in
    /*) ;;
    *) error "Upload storage path must be an absolute path, or leave it blank." ;;
  esac
  case "$CLIENT_PIX_UPLOADS_PATH" in
    *[[:space:]]*) error "Upload storage path cannot contain whitespace." ;;
  esac
fi

# Generate a secure postgres password
POSTGRES_PASSWORD=$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)

echo ""
if [ "$DOMAIN" = "localhost" ]; then
  info "Mode: Local/LAN (HTTP only)"
else
  info "Mode: Domain with HTTPS ($DOMAIN)"
fi
if [ -n "${CLIENT_PIX_UPLOADS_PATH:-}" ]; then
  info "Upload storage: $CLIENT_PIX_UPLOADS_PATH"
else
  info "Upload storage: Docker volume"
fi

# -----------------------------------------------------------------------------
# Install
# -----------------------------------------------------------------------------
echo ""
info "Installing to $INSTALL_DIR ..."

mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

if [ -n "${CLIENT_PIX_UPLOADS_PATH:-}" ]; then
  mkdir -p "$CLIENT_PIX_UPLOADS_PATH"
  ok "Created upload storage directory: $CLIENT_PIX_UPLOADS_PATH"
fi

if [ "$DOMAIN" = "localhost" ]; then
  # LAN mode: Nginx, no SSL
  info "Downloading configuration files..."
  curl -fsSL "$BASE_URL/docker-compose.install-local.yml" -o docker-compose.yml
  curl -fsSL "$BASE_URL/docker/nginx/nginx.conf" -o nginx.conf
  ok "Downloaded docker-compose.yml and nginx.conf"
else
  # Domain mode: Caddy with auto-SSL
  info "Downloading configuration files..."
  curl -fsSL "$BASE_URL/docker-compose.install.yml" -o docker-compose.yml
  curl -fsSL "$BASE_URL/Caddyfile" -o Caddyfile
  ok "Downloaded docker-compose.yml and Caddyfile"
fi

# Generate .env
cat > .env <<EOF
# Client Pix configuration — generated by install.sh
DOMAIN=$DOMAIN
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
EOF
if [ -n "${CLIENT_PIX_UPLOADS_PATH:-}" ]; then
  cat >> .env <<EOF
CLIENT_PIX_UPLOADS_PATH=$CLIENT_PIX_UPLOADS_PATH
EOF
fi
ok "Generated .env file"

# Download upgrade script
cat > upgrade.sh <<'UPGRADE_EOF'
#!/bin/bash
set -euo pipefail
echo "Pulling latest Client Pix images..."
docker compose pull
echo "Restarting services..."
docker compose up -d
echo "Upgrade complete!"
UPGRADE_EOF
chmod +x upgrade.sh
ok "Created upgrade.sh"

# -----------------------------------------------------------------------------
# Launch
# -----------------------------------------------------------------------------
echo ""
info "Pulling Docker images and starting services..."
echo "  (this may take a few minutes on first install)"
echo ""

./upgrade.sh

# -----------------------------------------------------------------------------
# Done
# -----------------------------------------------------------------------------
echo ""
echo -e "${GREEN}╔══════════════════════════════════════╗${NC}"
echo -e "${GREEN}║${NC}     Client Pix is starting up!       ${GREEN}║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════╝${NC}"
echo ""

if [ "$DOMAIN" = "localhost" ]; then
  LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "<your-server-ip>")
  echo "  Access your gallery at:"
  echo ""
  echo "    http://localhost"
  [ "$LOCAL_IP" != "<your-server-ip>" ] && echo "    http://$LOCAL_IP"
else
  echo "  Access your gallery at:"
  echo ""
  echo "    https://$DOMAIN"
  echo ""
  echo "  (SSL certificate will be provisioned automatically — may take a minute)"
fi

echo ""
echo "  Install directory: $INSTALL_DIR"
if [ -n "${CLIENT_PIX_UPLOADS_PATH:-}" ]; then
  echo "  Upload storage:    $CLIENT_PIX_UPLOADS_PATH"
fi
echo "  Upgrade later:     cd $INSTALL_DIR && ./upgrade.sh"
echo "  View logs:         cd $INSTALL_DIR && docker compose logs -f"
echo "  Stop:              cd $INSTALL_DIR && docker compose down"
echo ""
