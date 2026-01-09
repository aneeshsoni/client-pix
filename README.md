# Client Pix

A self-hosted photography client gallery for professional photographers. Share photos with clients through beautiful, secure galleries.

![License](https://img.shields.io/badge/license-MIT-blue.svg)

## Features

- 📸 **Photo & Video Uploads** — Support for images and videos with automatic thumbnail generation
- 🖼️ **Smart Galleries** — Organize photos into albums with drag-and-drop
- 🔗 **Secure Sharing** — Generate expiring share links for client delivery
- 📱 **Responsive Design** — Beautiful on desktop, tablet, and mobile
- 🎨 **Modern UI** — Built with Next.js and shadcn/ui
- 🔒 **Self-Hosted** — Your data stays on your server
- 🚀 **Easy Deploy** — One-command deployment with automatic HTTPS

## Quick Start

### Self-Hosted Deployment

Deploy on any VPS (DigitalOcean, Hetzner, Linode, etc.) in minutes:

```bash
# Clone the repository
git clone https://github.com/your-username/client-pix.git
cd client-pix

# Configure your domain and database password
cp .env.example .env
nano .env

# Deploy (includes automatic SSL via Caddy)
docker compose -f docker-compose.selfhost.yml up -d
```

Your gallery will be live at `https://your-domain.com`!

### Local Development

```bash
# Start all services with Docker
./start.sh

# Open in browser
open http://localhost
```

## Requirements

- **Server:** Any Linux VPS with 1GB+ RAM
- **Docker:** Docker Engine 20.10+ with Compose
- **Domain:** A domain name pointing to your server (for HTTPS)

## Documentation

- [Deployment Guide](docs/DEPLOYMENT.md) — Production deployment, SSL setup, DNS configuration
- [Architecture](docs/ARCHITECTURE.md) — Technical overview and design decisions
- [Backend API](apps/python/README.md) — FastAPI backend and database migrations

## Tech Stack

| Component     | Technology                                             |
| ------------- | ------------------------------------------------------ |
| Frontend      | Next.js 15, React, TypeScript, Tailwind CSS, shadcn/ui |
| Backend       | FastAPI, Python 3.13, SQLAlchemy, Alembic              |
| Database      | PostgreSQL 16                                          |
| Reverse Proxy | Caddy (auto-SSL) or Nginx                              |
| Container     | Docker, Docker Compose                                 |

## Project Structure

```
client-pix/
├── apps/
│   ├── nextjs/          # Frontend application
│   └── python/          # Backend API
├── docker/
│   └── nginx/           # Nginx configuration
├── docs/                # Documentation
├── docker-compose.dev.yml      # Development environment
├── docker-compose.prod.yml     # Production (Coolify/PaaS)
├── docker-compose.selfhost.yml # Self-hosted with Caddy
└── Caddyfile            # Caddy reverse proxy config
```

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting a PR.

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -am 'Add new feature'`
4. Push to the branch: `git push origin feature/my-feature`
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

- 📖 [Documentation](docs/README.md)
- 🐛 [Issue Tracker](https://github.com/your-username/client-pix/issues)
- 💬 [Discussions](https://github.com/your-username/client-pix/discussions)
