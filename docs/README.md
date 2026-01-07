# Client Pix Documentation

Technical documentation for the Client Pix photography client gallery platform.

## Contents

| Document                          | Description                                                      |
| --------------------------------- | ---------------------------------------------------------------- |
| [Architecture](./ARCHITECTURE.md) | System architecture, technology decisions, and project structure |
| [PRD](./PRD_Client_Pix.md)        | Product requirements document and design specification           |

## Quick Links

- **Frontend:** `apps/nextjs/` — Next.js with shadcn/ui
- **Backend:** `apps/python/` — FastAPI (Python)

## Development

### Start Frontend Dev Server

Option 1 - Via start script (from the root of repo)

```bash
# Start frontend dev server from your terminal
./start.sh
```

Option 2 - Via npm

```bash
cd apps/nextjs && npm run dev
```

### Start All Services

Use the unified start script from the repository root:

```bash
./start.sh
```

This script will:

1. Check and start Docker if needed
2. Start PostgreSQL and Nginx via Docker Compose
3. Install Python dependencies (if needed)
4. Install Node.js dependencies (if needed)
5. Start the FastAPI backend
6. Start the Next.js frontend
7. Wait for backend health check

Access points:

- **App:** http://localhost (via Nginx)
- **API Docs:** http://localhost/docs
- **Backend Direct:** http://localhost:8000 (if needed)

Press `Ctrl+C` to stop all services.
