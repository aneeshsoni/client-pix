# Client Pix

A self-hosted photography client gallery for professional photographers. Share photos with clients through beautiful, secure galleries.

![License](https://img.shields.io/badge/license-MIT-blue.svg)

## Features

- 📸 **Photo & Video Uploads** - Support for images and videos with automatic thumbnail generation
- 🖼️ **Smart Galleries** - Organize photos into albums with drag-and-drop
- 🔗 **Secure Sharing** - Generate expiring share links for client delivery
- 📱 **Responsive Design** - Beautiful on desktop, tablet, and mobile
- 🎨 **Modern UI** - Built with Next.js and shadcn/ui
- 🔒 **Self-Hosted** - Your data stays on your server
- 🚀 **Easy Deploy** - One-command deployment

## Quick Start

**Requirements:** Docker Desktop or Docker Engine

### Option 1: One-Command Install

Install Client Pix on any machine with Docker — VPS, NAS, or local server:

```bash
curl -fsSL https://raw.githubusercontent.com/aneeshsoni/client-pix/main/install.sh | bash
```

The installer will prompt for a domain (for automatic HTTPS) or default to local/LAN access

### Option 2: Clone and Build from Source

Best for development or if you want to customize the source code.

```bash
git clone https://github.com/aneeshsoni/client-pix.git
cd client-pix
./scripts/setup-dev.sh
./start.sh
```

This runs `docker compose up --build` using the development compose file, building the frontend and backend images from source and starting all services (PostgreSQL, Nginx, etc.).

`./scripts/setup-dev.sh` is a developer-only bootstrap script. It installs local dependencies, enables the repo's Git hooks, and prepares a clone for day-to-day development.

### Accessing the App

| URL                   | Description                    |
| --------------------- | ------------------------------ |
| http://localhost      | Main app (via Nginx)           |
| http://localhost/docs | API documentation              |
| http://localhost:8000 | Backend direct (for debugging) |

For production self-hosting with SSL, see the [Deployment Guide](docs/DEPLOYMENT.md).

## Documentation

- [Contributing Guide](docs/CONTRIBUTING.md) — Setup, development workflow, and how to contribute
- [Deployment Guide](docs/DEPLOYMENT.md) — Production deployment, SSL, DNS
- [Architecture](docs/ARCHITECTURE.md) — Technical overview and design decisions

## Tech Stack

| Component     | Technology                                             |
| ------------- | ------------------------------------------------------ |
| Frontend      | Next.js 16, React, TypeScript, Tailwind CSS, shadcn/ui |
| Backend       | FastAPI, Python, SQLAlchemy, Alembic                   |
| Database      | PostgreSQL 16                                          |
| Reverse Proxy | Caddy (auto-SSL) or Nginx                              |
| Container     | Docker, Docker Compose                                 |

## Project Structure

This is a monorepo project with clear separation between the frontend and backend services. The frontend web app is written in typescript using Next.js and the backend is a FastAPI python server.

```

client-pix/
├── apps/
│ ├── nextjs/ # Frontend application
│ └── python/ # Backend API
├── docker/
│ └── nginx/ # Nginx configuration
├── docs/ # Documentation
├── docker-compose.dev.yml # Development environment
├── docker-compose.prod.yml # Production (Coolify/PaaS)
├── docker-compose.selfhost.yml # Self-hosted with Caddy
└── Caddyfile # Caddy reverse proxy config

```

## Contributing

Contributions are welcome! Please read our [contributing guidelines](docs/CONTRIBUTING.md) before submitting a PR.

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -am 'Add new feature'`
4. Push to the branch: `git push origin feature/my-feature`
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

- 🐛 [Issue Tracker](https://github.com/aneeshsoni/client-pix/issues)
- 💬 [Discussions](https://github.com/aneeshsoni/client-pix/discussions)
