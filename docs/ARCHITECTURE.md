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
│   │   └── albums_api.py    # Album CRUD, photo management
│   ├── uploads/
│   │   └── uploads_api.py   # File upload endpoints
│   ├── share_links/
│   │   └── share_links_api.py # Share link management
│   └── galleries/
│       └── galleries_api.py # Public client gallery access
│
├── models/                  # Data models
│   ├── api/                 # Pydantic models for API request/response
│   │   ├── albums_api_models.py
│   │   ├── uploads_api_models.py
│   │   └── share_links_api_models.py
│   └── db/                  # SQLAlchemy ORM models
│       ├── base.py          # Declarative base
│       ├── album_db_models.py
│       ├── photo_db_models.py
│       ├── file_hash_db_models.py
│       └── share_link_db_models.py
│
├── services/                # Business logic
│   └── storage_service.py   # File storage, deduplication, thumbnails
│
└── utils/                   # Utility functions
    ├── slug_util.py         # URL slug generation
    └── response_util.py     # API response builders
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
│   └── ab/cd/abcd1234...sha256.jpg    # Original files (SHA256 hash)
├── thumbnails/
│   └── ab/cd/abcd1234...sha256.webp   # Thumbnails (800x800, WebP)
├── web/
│   └── ab/cd/abcd1234...sha256.webp   # Web-optimized (max 2400px, WebP)
└── videos/
    └── uuid.mp4                        # Video files (UUID-based, no dedup)
```

**Key Features:**

- **Images**: SHA256 hashing for deduplication, stored in 2-level sharded directories
- **Videos**: UUID-based storage (no hashing due to size), stored flat in `videos/` directory
- **Thumbnails**: Generated automatically (800x800px, WebP, 90% quality)
- **Web versions**: Optimized for web viewing (max 2400px, WebP, 92% quality)
- **Streaming uploads**: 8MB chunks for efficient large file handling
- Duplicate uploads reference existing files (reference counting in database)

---

## API Design

### Authentication

- JWT-based authentication
- Access tokens (short-lived) + Refresh tokens (long-lived)
- Admin users vs client gallery access (PIN/link-based)

### Endpoints Overview

```
# System
GET    /api/system/health        # Health check

# Albums
GET    /api/albums               # List albums
POST   /api/albums               # Create album
GET    /api/albums/:id           # Get album details
GET    /api/albums/slug/:slug   # Get album by slug
PATCH  /api/albums/:id           # Update album
DELETE /api/albums/:id           # Delete album
PUT    /api/albums/:id/cover/:photo_id  # Set cover photo

# Photos
POST   /api/albums/:id/photos    # Upload photos to album
GET    /api/albums/photos/all    # Get all photos across albums
GET    /api/albums/:id/photos/:photo_id/download  # Download photo
DELETE /api/albums/:id/photos/:photo_id  # Delete photo
POST   /api/albums/:id/photos/:photo_id/regenerate-thumbnails  # Regenerate thumbnails

# Share Links
POST   /api/albums/:id/share     # Create share link
GET    /api/albums/:id/share     # List share links for album
PATCH  /api/albums/:id/share/:share_link_id  # Update share link (password, revoke)
DELETE /api/albums/:id/share/:share_link_id  # Delete share link

# File Uploads
POST   /api/upload               # Upload single file
POST   /api/upload/multiple      # Upload multiple files
```

---

## Sharing & Access Control

### Share Links

Albums can be shared via unique, secure share links with optional password protection.

**Database Model:**

- `share_links` table with fields: `id`, `album_id` (FK), `token`, `password_hash`, `is_password_protected`, `expires_at`, `is_revoked`
- Foreign key relationship to `albums` with CASCADE delete
- Unique token generation using `secrets.token_urlsafe(32)`

**Security:**

- Passwords hashed using bcrypt
- Tokens are cryptographically secure (32-byte URL-safe tokens)
- Links can be revoked without deletion
- Optional expiration dates

**Frontend:**

- Share Modal component (`ShareModal.tsx`) for creating and managing share links
- Visual indicators for password-protected vs public links
- Copy-to-clipboard functionality
- Revoke/restore toggle

**API Endpoints:**

- `POST /api/albums/:id/share` - Create share link (optional password)
- `GET /api/albums/:id/share` - List all share links for album
- `PATCH /api/albums/:id/share/:share_link_id` - Update (password, expiration, revoke)
- `DELETE /api/albums/:id/share/:share_link_id` - Delete share link

---

## Error Handling & Network Resilience

### Frontend API Client

All API functions include comprehensive error handling:

- **Network error detection**: Catches `TypeError: Failed to fetch` and provides clear messages
- **HTTP error details**: Extracts error text from response body when available
- **Backend connectivity**: Clear messaging when backend is unavailable
- **URL encoding**: Proper encoding for slug-based endpoints

### CORS Configuration

Backend CORS middleware allows:

- `http://localhost:3000` - Direct Next.js dev server access
- `http://localhost` - Nginx proxy access (port 80)

### Development Scripts

The `start.sh` script includes:

- Backend health check (waits up to 30 seconds for backend to be ready)
- Automatic dependency installation
- Docker status checking
- Graceful cleanup on exit

---

## References

- [Immich Architecture](https://immich.app/docs/developer/architecture) — Inspiration for self-hosted photo management
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [Next.js App Router](https://nextjs.org/docs/app)
