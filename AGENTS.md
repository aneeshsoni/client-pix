# AGENTS.md

This file provides guidance to coding agents working with this repository.

## Validation Policy

When making code changes through an LLM or coding agent, run the relevant local checks before committing and pushing.

- Backend changes:
  - `cd apps/python`
  - `uv run ruff check .`
  - `uv run ruff format --check .`
  - `uv run pytest tests/ -v`
- Frontend changes:
  - `cd apps/nextjs`
  - `npm run lint`
  - `npm test`
  - `npm run build`
- Cross-cutting changes that touch both apps should run both sets of checks.

If a check cannot be run in the current environment, call that out explicitly before committing or pushing.

### Git Hooks

This repo includes local Git hooks in `.githooks/`.

- `pre-commit`
  - Runs automatically before `git commit`
  - Fast checks only:
    - backend: `uv run ruff check .` and `uv run ruff format --check .`
    - frontend: `npm run lint`
- `pre-push`
  - Runs automatically before `git push`
  - Full validation:
    - backend: `uv run ruff check .`, `uv run ruff format --check .`, `uv run pytest tests/ -v`
    - frontend: `npm run lint`, `npm test`, `npm run build`

One-time setup for each local clone:

```bash
git config core.hooksPath .githooks
chmod +x .githooks/pre-commit .githooks/pre-push
```

After that, the hooks run automatically. They do not need to be triggered manually.

## Commands

### Development

```bash
# Start full dev environment
./start.sh
./start.sh down     # Stop all services
./start.sh logs     # View logs
./start.sh fresh    # Full rebuild (deletes all data!)
```

### Frontend (`apps/nextjs`)

```bash
cd apps/nextjs
nvm use               # Use the version from .nvmrc
npm install           # Install dependencies
npm run dev           # Start dev server (turbopack)
npm run build         # Build for production
npm run lint          # ESLint
npm test              # Run tests (vitest)
npm run test:watch    # Run tests in watch mode
```

### Backend (`apps/python`)

```bash
cd apps/python
uv sync               # Install Python and dependencies from pyproject.toml
uv run uvicorn main:app --reload  # Start dev server

# Linting / formatting
uv run ruff check .
uv run ruff check --fix .
uv run ruff format .

# Tests (SQLite in-memory by default; set DATABASE_URL for PostgreSQL)
uv run pytest tests/ -v
uv run pytest tests/test_auth.py -v
```

```bash
cd apps/python
source .venv/bin/activate
```

### Database Migrations

```bash
# Create a migration
docker compose -f docker-compose.dev.yml exec backend uv run alembic revision --autogenerate -m "description"

# Apply migrations
docker compose -f docker-compose.dev.yml exec backend uv run alembic upgrade head
```

Migration files live in `apps/python/alembic/versions/`.

## Architecture

This is a monorepo with two apps: a Next.js frontend and a FastAPI backend, connected via REST and proxied through Nginx in development.

```text
client-pix/
├── apps/
│   ├── nextjs/          # Frontend
│   └── python/          # Backend
├── docker/              # Nginx config
├── docker-compose.dev.yml
└── start.sh             # Dev entrypoint
```

### Frontend (`apps/nextjs`)

- Next.js App Router with TypeScript
- UI: shadcn/ui components + Tailwind CSS
- Authentication: custom `AuthContext` in `lib/auth.tsx` with JWT access + refresh tokens in `localStorage`
- API client: `lib/api.ts` uses relative URLs through Nginx proxying `/api`
- Routes:
  - `/` redirects to login or dashboard
  - `/login`, `/setup` are unauthenticated pages
  - `/dashboard/*` is the admin UI
  - `/share/[token]` is the public client gallery view

### Backend (`apps/python`)

- FastAPI with async SQLAlchemy (`asyncpg`) + Alembic migrations
- Entry point: `main.py` -> `router.py` -> `api/*_api.py`
- Naming conventions:
  - `api/<domain>/<domain>_api.py` for endpoint handlers
  - `models/api/<domain>_api_models.py` for Pydantic DTOs
  - `models/db/<domain>_db_models.py` for SQLAlchemy models
  - `services/<domain>_service.py` for business logic
  - `utils/<name>_util.py` for utilities
  - `core/` for app-wide config, database, and rate limiting
- Authentication: JWT access + refresh tokens, with optional TOTP 2FA
- File storage:
  - Originals: `uploads/originals/ab/cd/<sha256>.ext`
  - Thumbnails: `uploads/thumbnails/ab/cd/<sha256>.webp`
  - Web versions: `uploads/web/ab/cd/<sha256>.webp`
  - Videos: `uploads/videos/<uuid>.mp4`
- Config is environment-driven via `core/config.py`

## Key Design Decisions

- Frontend API calls use relative URLs; no `NEXT_PUBLIC_API_URL` is needed
- Image deduplication uses SHA256 hashes with reference counting
- Tests use SQLite in-memory by default; set `DATABASE_URL` for PostgreSQL-backed runs
- CORS allowed origins come from `ALLOWED_ORIGINS`
