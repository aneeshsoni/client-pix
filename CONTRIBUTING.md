# Contributing to Client Pix

Thank you for your interest in contributing to Client Pix! This document provides guidelines and instructions for contributing.

## Getting Started

### Prerequisites

- Docker and Docker Compose
- Git

### Development Setup

1. **Clone the repository**

   ```bash
   git clone https://github.com/yourusername/client-pix.git
   cd client-pix
   ```

2. **Start the development environment**

   ```bash
   ./start.sh
   ```

   This will start all services with hot reload enabled.

3. **Access the application**
   - Frontend: http://localhost
   - API docs: http://localhost/docs

4. **Stop the environment**
   ```bash
   ./start.sh down
   ```

### Local Development Workflow

There are two approaches to development: fully containerized (no local runtimes needed) or hybrid (local runtimes for better IDE support).

#### Option 1: Fully Containerized (Recommended for Quick Contributions)

Everything runs in Docker. No need to install Node.js, Python, or other dependencies locally.

**Running Tests via Docker:**

```bash
# From project root (~/dev/client-pix)

# Backend tests
docker compose -f docker-compose.dev.yml exec backend uv run pytest tests/ -v

# Frontend tests
docker compose -f docker-compose.dev.yml exec frontend npm test
```

**Adding Dependencies via Docker:**

```bash
# From project root (~/dev/client-pix)

# Add a Python package
docker compose -f docker-compose.dev.yml exec backend uv add package-name

# Add a Node.js package
docker compose -f docker-compose.dev.yml exec frontend npm install package-name

# Add a dev dependency
docker compose -f docker-compose.dev.yml exec backend uv add --dev package-name
docker compose -f docker-compose.dev.yml exec frontend npm install --save-dev package-name
```

After adding dependencies, the lock files (`uv.lock`, `package-lock.json`) will be updated inside the container and synced to your local filesystem via volume mounts.

**Rebuilding Containers:**

If you need a fresh install of all dependencies:

```bash
./start.sh down
docker compose -f docker-compose.dev.yml build --no-cache
./start.sh
```

#### Option 2: Hybrid (Recommended for Regular Development)

Install local runtimes for better IDE support (autocomplete, type checking, debugging).

**Prerequisites:**

- Node.js 20+ (for frontend)
- Python 3.13+ with [uv](https://docs.astral.sh/uv/) (for backend)

**Setup:**

```bash
# Install frontend dependencies locally (for IDE support)
cd apps/nextjs
npm install

# Install backend dependencies locally (for IDE support)
cd apps/python
uv sync
```

**Running Tests Locally:**

```bash
# Backend tests (requires local Python)
cd apps/python
uv run pytest tests/ -v

# Frontend tests (requires local Node.js)
cd apps/nextjs
npm test
```

**Adding Dependencies Locally:**

```bash
# Add a Python package
cd apps/python
uv add package-name

# Add a Node.js package
cd apps/nextjs
npm install package-name
```

When running locally, you still use Docker Compose for the database and other services:

```bash
# Start only the database (from project root)
docker compose -f docker-compose.dev.yml up -d postgres
```

#### Which Approach Should I Use?

| Scenario                              | Recommended Approach     |
| ------------------------------------- | ------------------------ |
| Quick bug fix or small contribution   | Option 1 (Containerized) |
| Regular development with IDE features | Option 2 (Hybrid)        |
| Don't want to install Node/Python     | Option 1 (Containerized) |
| Need debugging with breakpoints       | Option 2 (Hybrid)        |
| CI/CD environment                     | Option 1 (Containerized) |

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
