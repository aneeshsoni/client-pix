# 📸 Lightweight Immich-Inspired Photo Sharing App

**Design Specification (v1)**

---

## 1. Product Goals & Non-Goals

### Primary Goals

- Google Photos–level **polish and usability**
- Self-hosted on a VPS
- Single owner, with optional uploading by others
- Secure album sharing via public links
- Fast browsing on mobile web with downloads that don't fail with semi large albums like immich
- Deduplication
- Metadata visibility (EXIF / video metadata)
- Simple to deploy and reason about

### Explicit Non-Goals (v1)

These are **intentionally out of scope**:

- Face recognition
- Semantic search ("beach", "dog")
- Real-time sync
- Native mobile apps
- Timeline-based infinite scroll across _all_ photos
- Multi-region / object storage
- Collaborative editing, comments, likes

---

## 2. High-Level Architecture

```
Browser (Mobile)
   │
   ▼
NGINX (TLS, proxy, rate limits)
   │
   ├──► Next.js Frontend (gallery, lightbox, sharing UI)
   │
   ├──► FastAPI Backend (auth, albums, assets, sharing)
   │
   ├──► PostgreSQL (metadata, dedup, permissions)
   │
   └──► Local Disk (/data/photos)
```

---

## 3. Technology Stack

| Layer      | Choice         | Rationale                       |
| ---------- | -------------- | ------------------------------- |
| Frontend   | Next.js        | UX polish, mobile-first         |
| Backend    | FastAPI        | Async, simple, fast enough      |
| DB         | PostgreSQL     | Dedup + metadata queries        |
| Storage    | Local disk     | Cheapest, simplest              |
| Proxy      | NGINX          | TLS, signed URLs, rate limiting |
| Deployment | Shell → Docker | Progressive complexity          |

---

## 4. Core Domain Model

### 4.1 Users

```sql
users (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE,
  password_hash TEXT,
  role ENUM('owner', 'uploader'),
  created_at TIMESTAMP
)
```

- Only **owner** required in v1
- Uploaders optional later

---

### 4.2 Assets (Photos / Videos)

```sql
assets (
  id UUID PRIMARY KEY,
  original_filename TEXT,
  file_hash CHAR(64),
  file_size BIGINT,
  mime_type TEXT,
  width INT,
  height INT,
  duration_seconds FLOAT,
  taken_at TIMESTAMP,
  created_at TIMESTAMP,
  storage_path TEXT,
  metadata JSONB,
  is_video BOOLEAN
)
```

#### Deduplication Strategy

- SHA-256 hash of file contents
- Unique index on `file_hash`
- Upload flow:

  1. Hash file stream
  2. Check for existing hash
  3. Reuse asset if found
  4. Store file + metadata if new

---

### 4.3 Albums

```sql
albums (
  id UUID PRIMARY KEY,
  title TEXT,
  description TEXT,
  is_private BOOLEAN,
  owner_id UUID,
  created_at TIMESTAMP
)
```

```sql
album_assets (
  album_id UUID,
  asset_id UUID,
  position INT,
  PRIMARY KEY (album_id, asset_id)
)
```

- Assets may exist in multiple albums

---

### 4.4 Shared Links

```sql
shared_links (
  id UUID PRIMARY KEY,
  album_id UUID,
  token CHAR(64),
  permissions JSONB,
  password_hash TEXT NULL,
  expires_at TIMESTAMP NULL,
  revoked BOOLEAN DEFAULT false,
  created_at TIMESTAMP
)
```

- Multiple links per album
- Instant revocation
- Optional password + expiration

---

## 5. Media Storage Layout

```
/data/photos/
  ├── originals/
  │     └── ab/cd/<hash>.ext
  ├── thumbnails/
  │     └── ab/cd/<hash>_sm.jpg
  └── videos/
        └── ab/cd/<hash>.mp4
```

- Sharded directories
- Thumbnails generated async
- RAW files preserved

---

## 6. Metadata Handling

### Extracted at Upload

- EXIF (photos)
- ffprobe (videos)
- Camera make/model
- Lens
- ISO / shutter / aperture
- GPS (optional)

Stored as JSONB for flexible querying.

### Privacy Controls

- Strip GPS metadata for shared links (optional)
- Originals always preserved

---

## 7. API Design (FastAPI)

### Authentication

- JWT for owner/uploader
- Cookie-based sessions for frontend

### Asset Upload

```
POST /api/assets/upload
```

- Multipart upload
- Streaming hash calculation
- Async thumbnail generation

### Albums

```
POST /api/albums
GET  /api/albums
GET  /api/albums/{id}
POST /api/albums/{id}/assets
```

### Sharing

```
POST   /api/albums/{id}/share
GET    /api/share/{token}
POST   /api/share/{token}/auth
DELETE /api/share/{token}
```

### Downloads

```
GET /api/assets/{id}/download
GET /api/albums/{id}/download.zip
```

- ZIP files streamed on-the-fly

---

## 8. Signed URLs & Security

- HMAC-signed URLs
- Expiration timestamps
- Optional IP binding
- Enforced by NGINX

Example:

```
/media/<path>?expires=...&sig=...
```

Rate limiting:

- Per IP
- Per token
- Stricter limits for ZIP downloads

---

## 9. Frontend UX Principles

### UX Pillars

- Minimal UI
- Mobile-first
- Smooth animations
- Skeleton loaders
- Progressive image loading

### Key Screens

- Album grid
- Album view (masonry)
- Lightbox viewer
- Metadata drawer
- Share link management

### UI Stack

- Next.js App Router
- Tailwind CSS
- Headless UI
- Framer Motion
- Blurhash / LQIP previews

---

## 10. Deployment Plan

### Phase 1

- Shell scripts
- Manual NGINX config

### Phase 2

- Docker Compose
- Services: frontend, backend, postgres, nginx
- Persistent volume for `/data/photos`

---

## 11. Scaling Notes

- 10k+ photos trivial
- PostgreSQL more than sufficient
- Disk IO is the main bottleneck
- Dedup significantly reduces growth

---

## 12. Future Extensions

- Friend uploads
- Object storage (S3-compatible)
- Background job queue
- Timeline view
- Metadata search

---

**Positioning:**

> Immich-style storage and sharing, without sync or ML complexity

---

_End of specification._
