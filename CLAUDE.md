# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development

```bash
# Start full dev environment (PostgreSQL + Nginx via Docker, backend + frontend locally)
./start.sh
./start.sh down     # Stop all services
./start.sh logs     # View logs
./start.sh fresh    # Full rebuild (deletes all data!)
```

### Frontend (apps/nextjs)

```bash
cd apps/nextjs
nvm use               # Use the correct version of node as defined in .nvmrc file
npm install           # Install dependencies
npm run dev           # Start dev server (turbopack)
npm run build         # Build for production
npm run lint          # ESLint
npm test              # Run tests (vitest)
npm run test:watch    # Run tests in watch mode
```

### Backend (apps/python)

```bash
cd apps/python
uv sync               # Installs python based on .python-version along with the dependencies specified in pyproject.toml
uv run uvicorn main:app --reload  # Start dev server

# Linting / formatting
uv run ruff check .
uv run ruff check --fix .
uv run ruff format .

# Tests (SQLite in-memory by default; set DATABASE_URL for PostgreSQL)
uv run pytest tests/ -v
uv run pytest tests/test_auth.py -v   # Run a single test file
```

```bash
cd apps/python
source .venv/bin/activate # Activate the python virtual environment
```

### Database Migrations

```bash
# Create a migration (run inside the backend container)
docker compose -f docker-compose.dev.yml exec backend uv run alembic revision --autogenerate -m "description"

# Apply migrations
docker compose -f docker-compose.dev.yml exec backend uv run alembic upgrade head
```

Migration files live in `apps/python/alembic/versions/` with filenames like `YYYYMMDD_NNNNNN_NNN_description.py`.

---

## Architecture

This is a monorepo with two apps: a **Next.js** frontend and a **FastAPI** backend, connected via REST and proxied through Nginx in development.

```
client-pix/
├── apps/
│   ├── nextjs/          # Frontend
│   └── python/          # Backend
├── docker/              # Nginx config
├── docker-compose.dev.yml
└── start.sh             # Dev entrypoint
```

### Frontend (apps/nextjs)

- **Next.js App Router** with TypeScript
- **UI**: shadcn/ui components + Tailwind CSS
- **Authentication**: Custom `AuthContext` (`lib/auth.tsx`) with JWT access + refresh tokens stored in localStorage under keys `clientpix_token` / `clientpix_refresh_token`
- **API client**: `lib/api.ts` — all API calls use relative URLs (no `NEXT_PUBLIC_API_URL` needed; Nginx proxies `/api` to the backend)
- **Route structure**:
  - `/` — redirect to login or dashboard
  - `/login`, `/setup` — unauthenticated pages
  - `/dashboard/*` — admin UI (albums, gallery, settings)
  - `/share/[token]` — public client gallery view

### Backend (apps/python)

- **FastAPI** with async SQLAlchemy (asyncpg driver) + Alembic migrations
- **Entry point**: `main.py` → `router.py` (prefix `/api`) → individual `api/*_api.py` routers
- **Naming conventions**:
  - `api/<domain>/<domain>_api.py` — endpoint handlers
  - `models/api/<domain>_api_models.py` — Pydantic request/response DTOs
  - `models/db/<domain>_db_models.py` — SQLAlchemy ORM models
  - `services/<domain>_service.py` — business logic
  - `utils/<name>_util.py` — utility functions
  - `core/` — app-wide config, database setup, rate limiting
- **Authentication**: JWT (short-lived access tokens + long-lived refresh tokens); optional TOTP 2FA
- **File storage**: SHA256 content-based deduplication for images; UUID-based for videos
  - Originals → `uploads/originals/ab/cd/<sha256>.ext`
  - Thumbnails → `uploads/thumbnails/ab/cd/<sha256>.webp` (800×800, WebP)
  - Web versions → `uploads/web/ab/cd/<sha256>.webp` (max 2400px, WebP)
  - Videos → `uploads/videos/<uuid>.mp4`
- **Config**: environment variables via `.env` (see `core/config.py`). Default DB: `postgresql+asyncpg://clientpix:clientpix_dev@localhost:5432/clientpix`

### Key design decisions

- Frontend uses **relative URLs** for all API calls — no environment variable needed; Nginx proxies everything
- Image deduplication via SHA256 hash stored in `file_hashes` table with reference counting
- Tests use **SQLite in-memory** by default; set `DATABASE_URL` env var to use PostgreSQL in CI
- CORS allowed origins configured via `ALLOWED_ORIGINS` env var (comma-separated)
