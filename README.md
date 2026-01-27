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
- 🚀 **Easy Deploy** — One-command deployment

## Quick Start

This is the fastest way to get this project up and running locally, more deployment options are outlined in [DEPLOYMENT.md](docs/DEPLOYMENT.md) including deploying on a VPS, deploying via a PaaS like Coolify, or deploying on any machine that supports Docker.

### Requirements

- **Docker:** Docker Engine 20.10+ with Compose
- **Domain:** A domain name pointing to your server (if you want it publicly accessible HTTPS)

### Local Development

Run the project on your own machine in <5 minutes using Docker

1. Start Docker on your machine

2. Clone the repository and run the `./start.sh` script from the root of the project

```bash
# Clone the repository
git clone https://github.com/aneeshsoni/client-pix.git
cd client-pix

# Run the start script which will start all docker compose
./start.sh
```

3. Access the app via http://localhost (more details on the different entrypoints below ⬇️)

| URL                   | Description                    |
| --------------------- | ------------------------------ |
| http://localhost      | Main app (via Nginx)           |
| http://localhost/docs | API documentation              |
| http://localhost:8000 | Backend direct (for debugging) |

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

```

```
