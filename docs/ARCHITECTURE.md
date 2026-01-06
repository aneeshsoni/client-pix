# Client Pix Architecture

## Overview

Client Pix is a self-hosted photography client gallery platform built as a monorepo with separate frontend and backend applications.

```
┌─────────────────┐     ┌──────────────────┐     ┌──────────────┐
│   Next.js App   │────▶│  FastAPI Server  │────▶│  PostgreSQL  │
│   (Frontend)    │ REST│  (Python)        │     │              │
└─────────────────┘     └────────┬─────────┘     └──────────────┘
                                 │
                                 ▼
                        ┌──────────────┐
                        │  File System │
                        │  /uploads    │
                        └──────────────┘
```

## Technology Stack

| Layer                | Technology                 | Purpose                          |
| -------------------- | -------------------------- | -------------------------------- |
| **Frontend**         | Next.js, React, TypeScript | Web application UI               |
| **UI Components**    | shadcn/ui, Tailwind CSS    | Design system                    |
| **Backend**          | FastAPI (Python)           | REST API server                  |
| **Database**         | PostgreSQL                 | Persistent data storage          |
| **File Storage**     | Local file system          | Photo storage with deduplication |
| **Containerization** | Docker, Docker Compose     | Local dev & deployment           |

---

## Architecture Decision Records

### ADR-001: FastAPI (Python) for Backend

**Date:** January 2026

**Status:** Accepted

**Context:**

We evaluated backend technologies for handling uploads, albums, users, and file management. The primary candidates were:

1. **FastAPI (Python)** — Modern async Python framework
2. **NestJS (TypeScript)** — Full-featured Node.js framework (used by Immich)
3. **Next.js API Routes** — Built-in serverless functions

**Decision:**

We chose **FastAPI (Python)** for the backend.

**Rationale:**

| Factor             | FastAPI          | NestJS                  | Next.js API               |
| ------------------ | ---------------- | ----------------------- | ------------------------- |
| Performance        | ~40k req/s       | ~50k req/s              | ~20k req/s                |
| File handling      | Excellent        | Excellent               | Limited                   |
| Image processing   | Pillow ecosystem | Sharp                   | Sharp                     |
| Future ML features | Native           | Requires Python service | Requires separate service |
| OpenAPI generation | Built-in         | Built-in                | Manual                    |
| Learning curve     | Low              | Medium                  | Low                       |
| Scalability        | Horizontal       | Horizontal              | Serverless                |

**Key considerations:**

1. **Performance is effectively equal** — For I/O bound operations (file uploads, database queries), both Python and TypeScript perform similarly. The bottleneck is disk/network I/O, not language runtime.

2. **Image processing ecosystem** — Python's Pillow and related libraries are mature and well-documented for thumbnail generation, EXIF extraction, and image optimization.

3. **Future ML capabilities** — If we add smart tagging, face detection, or other ML features, Python is the natural choice without needing a separate service.

4. **Simpler file handling patterns** — FastAPI's async file streaming and `aiofiles` make upload handling straightforward.

5. **Auto-generated OpenAPI** — FastAPI generates OpenAPI specs automatically, enabling type-safe client generation for the frontend.

**Consequences:**

- Two languages in the monorepo (TypeScript frontend, Python backend)
- Need Python tooling (uv, pyproject.toml) alongside Node tooling
- Clear separation of concerns between frontend and backend

**Alternatives considered:**

- **Immich's approach** (NestJS + Python ML service): Overkill for our simpler use case
- **Full TypeScript stack**: Would require separate Python service if ML features needed later

---

## Project Structure

```
client-pix/
├── apps/
│   ├── nextjs/              # Frontend application
│   │   ├── app/             # Next.js app router
│   │   ├── components/      # React components
│   │   ├── lib/             # Utilities, API clients
│   │   └── styles/          # Global styles
│   │
│   └── python/              # Backend application
│       ├── main.py          # FastAPI app entry point
│       ├── router.py        # Main router (aggregates all API routers)
│       ├── api/             # API endpoints
│       ├── models/          # Pydantic data models
│       ├── services/        # Business logic
│       ├── utils/           # Utility functions
│       └── pyproject.toml   # Python dependencies (uv)
│
├── docs/                    # Documentation
├── docker-compose.yml       # Local development orchestration
└── README.md
```

---

## Backend Architecture (FastAPI)

### Directory Structure & Naming Conventions

```
apps/python/
├── main.py                  # FastAPI app instance, middleware, CORS
├── router.py                # Aggregates all API routers under /api prefix
│
├── api/                     # API endpoints
│   ├── system/
│   │   └── system_api.py    # Health checks, system info
│   ├── auth/
│   │   └── auth_api.py      # Login, register, JWT tokens
│   ├── albums/
│   │   └── albums_api.py    # Album CRUD
│   ├── photos/
│   │   └── photos_api.py    # Photo upload, metadata
│   └── galleries/
│       └── galleries_api.py # Public client gallery access
│
├── models/                  # Pydantic data models
│   ├── api/                 # Models for API request/response
│   │   └── system_api_models.py
│   └── db/                  # Database/ORM models (future)
│       └── user_db_models.py
│
├── services/                # Business logic
│   ├── auth_service.py      # Password hashing, JWT
│   ├── storage_service.py   # File storage, deduplication
│   ├── image_service.py     # Thumbnails, optimization
│   └── album_service.py     # Album business logic
│
└── utils/                   # Utility functions
    ├── logger_util.py       # Logging configuration
    └── hashing_util.py      # SHA256 helpers
```

### Naming Conventions

| Directory     | File Suffix      | Example                | Purpose                        |
| ------------- | ---------------- | ---------------------- | ------------------------------ |
| `api/`        | `_api.py`        | `albums_api.py`        | API endpoint handlers          |
| `models/api/` | `_api_models.py` | `albums_api_models.py` | Pydantic request/response DTOs |
| `models/db/`  | `_db_models.py`  | `user_db_models.py`    | Database/ORM models (future)   |
| `services/`   | `_service.py`    | `storage_service.py`   | Business logic                 |
| `utils/`      | `_util.py`       | `logger_util.py`       | Reusable utility functions     |

### Entry Point Flow

```
main.py
  └── app = FastAPI()
  └── app.include_router(router)
        │
router.py
  └── router = APIRouter(prefix="/api")
  └── router.include_router(system_api.router)
  └── router.include_router(auth_api.router)
  └── ...
        │
api/*_api.py
  └── Individual endpoint handlers
```

### File Storage Strategy

Photos are stored using **SHA256 content-based deduplication**:

```
/uploads/
├── originals/
│   └── ab/cd/abcd1234...sha256.jpg    # Original files
├── thumbnails/
│   └── ab/cd/abcd1234...sha256_thumb.jpg
└── optimized/
    └── ab/cd/abcd1234...sha256_web.jpg
```

- Files are hashed on upload
- Duplicate uploads reference existing files
- Two-level directory structure prevents filesystem limits

---

## API Design

### Authentication

- JWT-based authentication
- Access tokens (short-lived) + Refresh tokens (long-lived)
- Admin users vs client gallery access (PIN/link-based)

### Endpoints Overview

```
POST   /api/auth/login           # Admin login
POST   /api/auth/register        # Admin registration (if enabled)
POST   /api/auth/refresh         # Refresh access token

GET    /api/albums               # List albums
POST   /api/albums               # Create album
GET    /api/albums/:id           # Get album details
PUT    /api/albums/:id           # Update album
DELETE /api/albums/:id           # Delete album

POST   /api/albums/:id/photos    # Upload photos to album
DELETE /api/photos/:id           # Delete photo

GET    /api/galleries/:slug      # Public gallery access
POST   /api/galleries/:slug/verify  # Verify PIN (if protected)
```

---

## References

- [Immich Architecture](https://immich.app/docs/developer/architecture) — Inspiration for self-hosted photo management
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [Next.js App Router](https://nextjs.org/docs/app)
