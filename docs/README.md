# Client Pix Documentation

Technical documentation for the Client Pix photography client gallery platform.

## Contents

| Document                          | Description                                                      |
| --------------------------------- | ---------------------------------------------------------------- |
| [Architecture](./ARCHITECTURE.md) | System architecture, technology decisions, and project structure |
| [Deployment](./DEPLOYMENT.md)     | Production deployment guide (self-hosted, Coolify, VPS)          |
| [PRD](./PRD_Client_Pix.md)        | Product requirements document and design specification           |

## Quick Links

- **Frontend:** `apps/nextjs/` — Next.js with shadcn/ui
- **Backend:** `apps/python/` — FastAPI (Python)

## Deployment Options

### Self-Hosted (Recommended for Most Users)

Deploy on any VPS or server with automatic HTTPS:

```bash
# 1. Clone the repo
git clone https://github.com/your-username/client-pix.git
cd client-pix

# 2. Configure environment
cp .env.example .env
nano .env  # Set your domain and database password

# 3. Deploy with Caddy (automatic SSL)
docker compose -f docker-compose.selfhost.yml up -d
```

Your gallery will be live at `https://your-domain.com` with automatic SSL certificates.

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed instructions including DNS setup, firewall configuration, and backup strategies.

### Coolify / PaaS

For platforms like Coolify, use `docker-compose.prod.yml`. See [DEPLOYMENT.md](./DEPLOYMENT.md#coolify-deployment).

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
