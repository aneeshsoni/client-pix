# 📘 Product Requirements Document (PRD)

**Product Name (placeholder):** _GalleryVault_  
**Version:** v0.1 (MVP)  
**Owner:** Aneesh Soni  
**Last Updated:** 2025-10-18

---

## 1. Overview

### 1.1 Vision

Create a **self-hosted photography client gallery platform** that combines the clean, elegant presentation of Pixieset with the privacy, control, and cost efficiency of hosting on your own VPS.  
Users (photographers/studios) can easily upload, organize, and share galleries with clients through password-protected links, while deduplication ensures efficient storage usage.

### 1.2 Objectives

- Deliver a **minimal, elegant, and performant** web experience for viewing photos.
- Enable **simple deployment** on a VPS using Docker (reverse proxy ready).
- Support **deduplication** at the file-content level to avoid redundant storage.
- Provide **private gallery sharing** with optional passwords or tokens.
- Lay the foundation for a future multi-user model (MVP will be single admin).

---

## 2. Target Users

| Persona                                | Description                                                 | Needs                                                          |
| -------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------- |
| **Photographer / Studio Owner**        | Individual or small studio managing multiple client shoots. | Easy upload, organization, branding, and sharing of galleries. |
| **Client (End User)**                  | A wedding couple, family, or brand client reviewing photos. | Clean, responsive, private viewing experience.                 |
| **IT-savvy Solopreneur / Self-hoster** | Someone running their own VPS or home server.               | Simple setup, security, and maintenance; low overhead.         |

---

## 3. Core Features

### 3.1 Image Upload & Management

- **Batch upload** via web UI or API.
- **Automatic deduplication** via file content hash (SHA256 or perceptual hash).
- Basic EXIF extraction (optional metadata display).
- **Folder → gallery mapping**: each uploaded folder becomes a gallery.
- File storage on local filesystem or mounted volume (e.g., `/data/photos`).

### 3.2 Gallery Presentation

- **Public URL** per gallery: `https://example.com/gallery/{slug}`
- Clean, minimal **Next.js + shadcn/ui** gallery layout:
  - Grid of thumbnails (lazy-loaded)
  - Lightbox-style viewer
  - Optional download toggle (admin controlled)
- Client-accessible via password or token-based access.

### 3.3 Authentication & Access

- Local authentication with a **single admin account**, seeded from environment variables.
- Postgres (or SQLite) backend for credentials.
- **Coolify-style bootstrap** — admin created once at startup via env vars.
- JWT-based session management (access + refresh tokens).
- Optional password for galleries (stored hashed).
- Tokenized URLs for temporary, expirable share links.

### 3.4 Deduplication Engine

- Compute **SHA256** hash on upload.
- Store hashes in DB.
- Skip or hard-link file if already present.
- Optional **image similarity deduping** using perceptual hash (future).
- Show dedupe stats per gallery (savings, duplicates).

### 3.5 Reverse Proxy Support

- Built for **reverse proxy** deployment via Nginx or Caddy.
- Docker Compose config includes:
  - `galleryvault-frontend` (Next.js)
  - `galleryvault-backend` (FastAPI)
  - `galleryvault-db` (Postgres)
  - `galleryvault-storage` (volume)
- TLS handled by reverse proxy (Caddy/Cloudflare).

### 3.6 Administration Dashboard

- Simple admin web UI:
  - Upload galleries
  - Edit gallery metadata (title, password)
  - Delete galleries
  - View dedup stats
- Gallery index page listing all galleries.

---

## 4. Technical Architecture

| Layer           | Technology                                        | Notes                               |
| --------------- | ------------------------------------------------- | ----------------------------------- |
| **Frontend**    | Next.js (v15) + TypeScript + shadcn/ui + Tailwind | Static gallery UI + admin dashboard |
| **Backend API** | Python (FastAPI)                                  | Uploads, metadata, auth, deduping   |
| **Database**    | Postgres (SQLite fallback)                        | Stores users, galleries, hashes     |
| **Storage**     | Local filesystem (`/data/photos`)                 | Mounted volume, later S3-compatible |
| **Deployment**  | Docker Compose + Nginx/Caddy                      | Single-command setup                |
| **Hashing**     | SHA256 (+ perceptual hash optional)               | Deduplication engine                |
| **Auth**        | JWT (FastAPI + Next.js integration)               | Minimal, secure                     |

---

## 5. Authentication Architecture (Coolify-Style)

### 5.1 Overview

Local-only authentication, single admin seeded from environment variables.  
No self-service password changes, signups, or invites.

### 5.2 Environment Variables

```bash
ADMIN_EMAIL=admin@mydomain.com
ADMIN_PASSWORD=strongpass123
JWT_SECRET=supersecretjwtkey
```
