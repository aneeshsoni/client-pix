# Download System

This document outlines how the download system works in the application, including current implementation and future roadmap for improvements.

## Overview

The download system enables users to download individual photos or entire albums from shared links. It's designed with mobile users in mind, where network connections can be unreliable.

## Current Implementation (Phase 1)

### Features

### Resumable Downloads

All file downloads support HTTP Range headers, allowing:

- **Interrupted downloads to resume** from where they left off
- **Partial content requests** for efficient bandwidth usage
- **Mobile-friendly** behavior where connections frequently drop

### Single Photo Downloads

- Endpoint: `GET /api/share/{token}/download/{photo_id}`
- Returns the original file with proper filename
- Supports Range headers for resumable downloads
- Password protected via query parameter if required

### Bulk Downloads (Download All)

- Endpoint: `GET /api/share/{token}/download-all`
- Creates a ZIP file containing all photos in the album
- Uses `ZIP_STORED` (no compression) since images are already compressed
- Handles duplicate filenames by appending `_1`, `_2` suffixes
- Temporary files cleaned up after download completes
- Supports Range headers for resumable downloads

### Technical Details

**ResumableFileResponse** (`utils/download_util.py`):

- Custom response class that handles HTTP Range headers
- Streams files in 64KB chunks for memory efficiency
- Returns `206 Partial Content` for range requests
- Advertises `Accept-Ranges: bytes` header

**ZIP Creation**:

- Uses temporary files on disk (not memory) for large albums
- Background task cleans up temp files after response
- No compression overhead since images are pre-compressed

---

## Phase 2: Background Preparation (Implemented)

For albums with many photos (100+), synchronous ZIP creation is slow. Phase 2 adds background job processing with no new infrastructure dependencies.

### Features

1. **Async ZIP Preparation**
    - User clicks "Download All" → ZIP built in background thread via `asyncio.run_in_executor`
    - Frontend polls for progress every 1 second
    - User sees progress indicator: "Preparing... 45%"
    - When ready, browser download is triggered automatically
2. **Cached ZIPs**
    - Generated ZIPs cached on disk for 24 hours at `uploads/cache/zips/`
    - Subsequent downloads of same album are instant (cache hit)
    - Cache invalidated automatically when album photos are added/deleted
3. **In-Memory Job Tracking**
    - `DownloadService` singleton manages job state in a Python dict
    - Jobs expire from memory after 1 hour (completed/failed)
    - No external dependencies (no Redis, no Celery)

### Architecture

- **Backend**: `services/download_service.py` — `DownloadService` with thread pool executor
- **API**: `api/downloads/downloads_api.py` — admin endpoints; share endpoints in `share_public_api.py`
- **Frontend**: `hooks/use-download-job.ts` — React hook for prepare/poll/download flow
- **Cache**: ZIP files stored at `uploads/cache/zips/{album_id}.zip` (full album) or `{album_id}_{hash}.zip` (selection)

### API Endpoints

Admin (authenticated):
```
POST /api/downloads/prepare
  Body: { album_id: "...", photo_ids?: ["..."] }
  → Returns: { job_id, status, progress, download_url? }

GET /api/downloads/status/{job_id}
  → Returns: { job_id, status, progress, total_files, processed_files, zip_size, download_url?, error? }

GET /api/downloads/{job_id}/file
  → Returns: ZIP file (ResumableFileResponse with Range header support)
```

Public share links:
```
POST /api/share/{token}/prepare-download
  Body: { password?: "..." }
  → Returns: { job_id, status, progress, download_url? }

GET /api/share/{token}/download-status/{job_id}
  → Returns: same as admin status

GET /api/share/{token}/download-file/{job_id}
  → Returns: ZIP file
```

### Cache Invalidation

Cache is automatically invalidated when:
- Photos are uploaded to the album
- Photos are deleted from the album (single or bulk)
- Album is deleted
- Chunked upload is completed

---

## Phase 3: Cloud Storage Integration (Production Scale)

For production deployments with high traffic or large files, integrate with cloud storage and CDN.

### Proposed Features

1. **S3/R2 Storage for ZIPs**
    - Generated ZIPs uploaded to object storage
    - Signed URLs for secure, time-limited access
    - Automatic cleanup after expiration
2. **CDN Delivery**
    - CloudFlare, AWS CloudFront, or similar
    - Edge caching for faster global downloads
    - Reduced load on origin server
3. **Multi-Region Support**
    - ZIPs replicated to edge locations
    - Users download from nearest location

### Implementation Requirements

- **Object Storage**: AWS S3, Cloudflare R2, or MinIO
- **CDN Configuration**: Edge caching rules
- **Signed URL Generation**: Time-limited access tokens

### Environment Variables

```bash
# Cloud Storage
STORAGE_BACKEND=s3|r2|local
S3_BUCKET=my-album-downloads
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
S3_REGION=us-east-1

# CDN
CDN_ENABLED=true
CDN_BASE_URL=https://cdn.example.com

```

---

## Mobile Considerations

The download system is optimized for mobile users:

| Feature | Benefit |
| --- | --- |
| Resumable downloads | Interrupted downloads can continue |
| ZIP_STORED compression | Faster creation, no CPU overhead |
| Chunked streaming | Memory efficient on server |
| Range header support | Bandwidth efficient for retries |
| Background tasks | No request timeouts for large albums |

---

## Configuration

Current environment variables:

```bash
# Base URL for generating download links
BASE_URL=https://photos.example.com

# Upload directory where files are stored
UPLOAD_DIR=/app/uploads

```

---

## Testing Resumable Downloads

To test Range header support:

```bash
# Get file size
curl -I "<http://localhost:8000/api/share/{token}/download-all>"

# Download first 1000 bytes
curl -H "Range: bytes=0-999" -o partial.zip \\
  "<http://localhost:8000/api/share/{token}/download-all>"

# Resume from byte 1000
curl -H "Range: bytes=1000-" -o rest.zip \\
  "<http://localhost:8000/api/share/{token}/download-all>"

# Combine
cat partial.zip rest.zip > complete.zip

```

---

## Roadmap Priority

| Phase | Priority | Effort | Impact |
| --- | --- | --- | --- |
| Phase 1 | ✅ Done | Low | High - enables mobile downloads |
| Phase 2 | ✅ Done | Medium | High - scales to large albums |
| Phase 3 | Low | High | Medium - for high-traffic production |

Phase 3 is recommended for production deployments expecting significant traffic.