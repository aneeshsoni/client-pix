# Contributing to Client Pix

Thank you for your interest in contributing to Client Pix!

## TL;DR

```bash
# 0. Prerequisites: Install Node.js 22, Python 3.13.6, and uv
# Use nvm/pyenv to install the correct versions (see below)

# 1. Fork and clone
git clone https://github.com/aneeshsoni/client-pix.git
cd client-pix

# 2. Install the correct runtime versions and install dependencies
cd apps/nextjs && nvm install # Reads from apps/nextjs/.nvmrc
npm install # Reads from package.json
cd ..
cd python && pyenv install # Reads from apps/python/.python-version
uv sync # Reads from pyproject.toml
cd ../..

# 3. Start dev environment
./start.sh

# 4. Make changes, then create a PR
git checkout -b feature/my-feature
git commit -am 'Add new feature'
git push origin feature/my-feature
```

Open a Pull Request on GitHub. That's it!

More details below ⬇️

---

## Related Documentation

| Document                                | Description                               |
| --------------------------------------- | ----------------------------------------- |
| [Architecture](./ARCHITECTURE.md)       | System design and technical decisions     |
| [Deployment](./DEPLOYMENT.md)           | Production deployment guide               |
| [Download System](./DOWNLOAD_SYSTEM.md) | Overview of how the download system works |

---

## Getting Started

### Prerequisites

- **Docker and Docker Compose** - For running services (database, etc.)
- **Git** - For version control
- **Node.js** - For frontend development (specified in [apps/nextjs/.nvmrc](apps/nextjs/.nvmrc))
- **Python** - For backend development (specified in [apps/python/.python-version](apps/python/.python-version))
- **[uv](https://docs.astral.sh/uv/)** - Python package manager

#### Installing the Correct Runtime Versions

We use version files to ensure everyone uses the same runtime versions.

**Node.js (using nvm):**

```bash
# Install nvm if you don't have it: https://github.com/nvm-sh/nvm
# Then from the project root:
cd apps/nextjs
nvm install  # Reads version from .nvmrc
nvm use      # Activates the correct version
```

**Python (using pyenv):**

```bash
# Install pyenv if you don't have it: https://github.com/pyenv/pyenv
# Then from the project root:
cd apps/python
pyenv install  # Reads version from .python-version
pyenv local    # Sets the version for this directory
```

Alternatively, you can install these versions manually, but using version managers is recommended for easier switching between projects.

### Development Setup

1. **Clone the repository**

   ```bash
   git clone https://github.com/aneeshsoni/client-pix.git
   cd client-pix
   ```

2. **Install the correct runtime versions**

   ```bash
   # Node.js (using nvm)
   cd apps/nextjs
   nvm install && nvm use

   # Python (using pyenv)
   cd ../python
   pyenv install
   cd ../..
   ```

3. **Install local dependencies**

   ```bash
   # Install frontend dependencies
   cd apps/nextjs
   npm install

   # Install backend dependencies
   cd ../python
   uv sync
   cd ../..
   ```

4. **Start the development environment**

   ```bash
   ./start.sh
   ```

   This will start all services with hot reload enabled.

5. **Access the application**

   | URL                   | Description                    |
   | --------------------- | ------------------------------ |
   | http://localhost      | Main app (via Nginx)           |
   | http://localhost/docs | API documentation              |
   | http://localhost:8000 | Backend direct (for debugging) |

6. **Managing the environment**

   ```bash
   ./start.sh          # Start all services
   ./start.sh down     # Stop all services
   ./start.sh logs     # View logs
   ./start.sh fresh    # Full rebuild (deletes all data!)
   ```

### What `./start.sh` Does

The start script automates your entire development setup:

1. Checks and starts Docker if needed
2. Starts PostgreSQL and Nginx via Docker Compose
3. Builds and starts the FastAPI backend
4. Builds and starts the Next.js frontend

All services run with hot reload enabled, so your changes are reflected immediately.

### Why Local Runtimes Are Required

We require locally installed Node.js and Python runtimes for proper dependency management. When you add or update dependencies, the lock files (`package-lock.json` and `uv.lock`) must be updated locally and committed to the repository. Running dependency commands inside containers alone won't properly sync these files to your local filesystem for git to track.

Additionally, local runtimes provide:

- Better IDE support (autocomplete, type checking, linting)
- Faster test execution
- Easier debugging with breakpoints
- Consistent dependency management across the team

### Local Development Workflow

**Running Tests:**

```bash
# Backend tests
cd apps/python
uv run pytest tests/ -v

# Frontend tests
cd apps/nextjs
npm test
```

**Adding Dependencies:**

```bash
# Add a Python package
cd apps/python
uv add package-name

# Add a Node.js package
cd apps/nextjs
npm install package-name
```

After adding dependencies, make sure to commit the updated lock files (`uv.lock`, `package-lock.json`).

**Running Services (Database, etc.):**

While you run code locally, Docker Compose handles services like PostgreSQL:

```bash
# The ./start.sh script handles this, but you can also manually start just the database:
docker compose -f docker-compose.dev.yml up -d postgres
```

### Project Structure

```
client-pix/
├── apps/
│   ├── nextjs/          # Frontend (Next.js 15, React 19, TypeScript)
│   └── python/          # Backend (FastAPI, Python 3.13)
├── docker/              # Docker configuration
├── docs/                # Documentation
└── scripts/             # Utility scripts
```

## Code Style

### Python (Backend)

We use [Ruff](https://docs.astral.sh/ruff/) for linting and formatting.

```bash
# Check for issues
cd apps/python
uv run ruff check .

# Auto-fix issues
uv run ruff check --fix .

# Format code
uv run ruff format .
```

### TypeScript (Frontend)

We use ESLint for linting.

```bash
cd apps/nextjs
npm run lint
```

## Making Changes

### Branch Naming

- `feature/description` - New features
- `fix/description` - Bug fixes
- `docs/description` - Documentation updates
- `refactor/description` - Code refactoring

### Commit Messages

Write clear, concise commit messages that explain the "why" behind changes:

```
Add rate limiting to authentication endpoints

Prevents brute force attacks on login by limiting requests to 5/minute per IP.
```

### Pull Request Process

1. **Create a branch** from `main`

   ```bash
   git checkout -b feature/your-feature
   ```

2. **Make your changes** and commit them

3. **Run tests** before submitting

   ```bash
   # Backend tests
   cd apps/python
   uv run pytest tests/ -v

   # Frontend tests
   cd apps/nextjs
   npm test
   ```

4. **Push and create a PR**

   ```bash
   git push origin feature/your-feature
   ```

5. **Fill out the PR template** with:
   - Summary of changes
   - Test plan
   - Screenshots (if UI changes)

## Testing

### Backend Tests

```bash
cd apps/python
uv run pytest tests/ -v
```

### Frontend Tests

```bash
cd apps/nextjs
npm test
```

## Database Migrations

When making database schema changes:

1. **Create a migration**

   ```bash
   docker compose -f docker-compose.dev.yml exec backend uv run alembic revision --autogenerate -m "description"
   ```

2. **Review the generated migration** in `apps/python/alembic/versions/`

3. **Apply the migration**
   ```bash
   docker compose -f docker-compose.dev.yml exec backend uv run alembic upgrade head
   ```

## Reporting Issues

When reporting issues, please include:

- Clear description of the problem
- Steps to reproduce
- Expected vs actual behavior
- Environment details (OS, browser, Docker version)
- Relevant logs or screenshots

## Questions?

Feel free to open an issue for questions or join discussions in existing issues.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
