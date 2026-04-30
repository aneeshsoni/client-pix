#!/bin/sh
set -e

REPO_ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"

require_command() {
    if ! command -v "$1" >/dev/null 2>&1; then
        echo "Error: required command '$1' is not installed or not on PATH."
        exit 1
    fi
}

echo "Setting up Client Pix development environment..."
echo ""

require_command git
require_command docker
require_command node
require_command npm
require_command python3
require_command uv

cd "$REPO_ROOT"

echo "Configuring repo-local Git hooks..."
git config core.hooksPath .githooks
chmod +x .githooks/pre-commit .githooks/pre-push

echo "Installing frontend dependencies..."
(
    cd apps/nextjs
    npm install
)

echo "Installing backend dependencies..."
(
    cd apps/python
    uv sync --dev
)

echo ""
echo "Developer setup complete."
echo ""
echo "Next steps:"
echo "  1. Start the dev stack with ./start.sh"
echo "  2. Use git commit / git push normally; hooks will now run automatically"
