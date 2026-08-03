# Adaptive Video Playback and Quality Selection

**Date:** 2026-07-30

**Last updated:** 2026-08-03

**Status:** Implemented
**Scope:** Admin galleries, album share links, and collection share links

## Summary

Client Pix currently plays the uploaded video file directly. A multi-gigabyte
original may have a bitrate higher than either the VPS outbound connection or
the viewer's available bandwidth, causing slow startup, buffering, and poor
seeking even when the server uses SSD storage.

This is an optional, opt-in feature. It is disabled by default. When an admin
enables it, Client Pix preserves the original file for downloads while
generating smaller streaming renditions for playback. The player then defaults
to adaptive quality and also allows viewers to select a specific quality.

The intended first release uses HTTP Live Streaming (HLS) with H.264 video,
AAC audio, fragmented MP4 segments, and a multivariant playlist.

## Why SSD Storage Does Not Guarantee Smooth Playback

The browser does not normally download the entire 5–10 GB file before playing.
It requests portions of the file as playback advances or the viewer seeks.
Playback stalls when those bytes cannot arrive faster than the encoded video is
consumed.

For example, excluding protocol overhead:

| Original size | Duration | Average bitrate required |
| --- | ---: | ---: |
| 5 GB | 60 minutes | approximately 11 Mbps |
| 5 GB | 30 minutes | approximately 22 Mbps |
| 10 GB | 60 minutes | approximately 22 Mbps |
| 10 GB | 30 minutes | approximately 44 Mbps |

Real peak bitrate can be substantially higher than the average. The limiting
factor may therefore be:

- VPS outbound bandwidth or provider throttling
- Viewer download speed, Wi-Fi, or mobile connection
- Network distance and routing between the VPS and viewer
- An original codec or bitrate that is inefficient for web playback
- An MP4 file whose metadata is at the end of the file instead of at the start
- Missing or ineffective HTTP byte-range support through one of the proxies
- CPU or connection pressure when the application serves several videos

The current Nginx configuration has `sendfile on`, but uploads are not mounted
in the Nginx container. Video bytes are served by FastAPI's `FileResponse` and
then proxied through Nginx. This is acceptable at the current scale, but Nginx
cannot use its direct-file `sendfile` path for these responses.

## Immediate Playback Audit

Before and after implementing renditions, production should record:

1. Source duration, dimensions, codec, average bitrate, and file size from
   `ffprobe`.
2. Time to first byte for a video request.
3. Whether a request with `Range: bytes=0-1048575` returns:
   - HTTP `206 Partial Content`
   - `Accept-Ranges: bytes`
   - a correct `Content-Range`
4. VPS network throughput to a representative viewer.
5. Browser network activity while starting and seeking.
6. Backend CPU, memory, and network use during concurrent playback.

The audit should distinguish:

- slow startup;
- buffering during sequential playback;
- slow or failed seeking; and
- server saturation with multiple viewers.

### Low-risk improvements before HLS

- Remux compatible MP4 uploads with `-movflags +faststart` so MP4 metadata is
  available at the beginning of the file.
- Confirm byte-range behavior through Coolify's outer proxy, project Nginx, and
  FastAPI.
- Avoid routing video responses through Next.js.
- Consider authenticated `X-Accel-Redirect` delivery later, with the uploads
  volume mounted read-only in Nginx, if Python response overhead becomes
  measurable.

These changes can improve startup and server efficiency, but they do not solve
an original bitrate that exceeds the viewer's connection.

## Goals

- Start playback quickly on typical broadband and mobile connections.
- Minimize buffering without requiring the original video bitrate.
- Keep adaptive playback disabled by default and require an explicit admin
  opt-in before creating any additional video files.
- Provide `Auto` and YouTube-style resolution choices such as `2160p 4K`,
  `1080p HD`, and `720p HD` when applicable.
- Never upscale a source video.
- Keep original files unchanged and available for authorized playback and
  downloads.
- Apply existing admin, album-share, password, and collection access rules to
  every playlist and segment.
- Support videos uploaded before this feature is deployed.
- Process videos asynchronously without holding an upload request open.
- Expose processing progress, failures, and retry controls to admins.
- Keep image upload and image delivery behavior unchanged.

## Non-goals for the First Release

- Live streaming
- DRM
- 4K streaming renditions
- HEVC, AV1, or multiple codec ladders
- Per-title encoding optimization
- Editing, trimming, or changing the original video
- A CDN or object-storage migration

## Viewer Experience

### Playback

- The player uses `Auto` by default.
- `Auto` selects between generated 1080p and 720p renditions based on bandwidth
  and playback conditions.
- The untouched uploaded file appears as its detected resolution rather than
  being labeled `Original`. For example, a 4K upload appears as `2160p 4K`.
- Selecting the source-resolution option plays the uploaded file directly. The
  source file does not participate in automatic quality selection.
- The quality menu lists the source resolution and only the additional
  generated resolutions available for that video.
- Selecting a fixed quality persists for the current player session.
- Selecting the highest source-resolution option may require substantially more
  bandwidth than `Auto`.
- If streaming renditions are not ready, the player falls back to the existing
  original-file playback behavior.
- If HLS is unsupported, the player falls back to the original file and shows
  no quality menu.
- Videos whose source quality is below 720p use the source-resolution option
  only and are not queued for transcoding.

### Processing states

Admins can see:

- `Pending`
- `Processing` with percentage when available
- `Ready`
- `Failed` with a retry action

Shared viewers should see normal original playback while processing, not an
error or an unavailable video.

## Rendition Ladder

The only generated renditions are web-optimized 1080p and 720p versions.
The source-resolution option is the existing uploaded file and does not create
another copy.
Preserve aspect ratio and use even output dimensions.

| Label | Maximum height | Target video bitrate | Maximum video bitrate | Audio |
| --- | ---: | ---: | ---: | ---: |
| 1080p | 1080 | 5 Mbps | 6 Mbps | AAC 128 Kbps |
| 720p | 720 | 2.8 Mbps | 3.5 Mbps | AAC 128 Kbps |

Generation rules:

| Source quality | Available choices | Generated files |
| --- | --- | --- |
| 1080p or higher, including 4K | Source resolution, 1080p, 720p | 1080p and 720p |
| At least 720p but below 1080p | Source resolution, 720p | 720p |
| Below 720p | Source resolution only | None |

An optimized rendition may have the same dimensions as the source. For
example, an original 1080p upload still receives a lower-bitrate streaming
1080p rendition plus a 720p rendition. This is intentional because reducing
bitrate, not only dimensions, is necessary to improve playback.

When a generated rendition has the same resolution label as the uploaded
source, show that resolution only once in the fixed-quality menu and map it to
the uploaded source. The optimized rendition remains available internally to
`Auto`. For example, a 1080p upload produces optimized 1080p and 720p streams,
but its menu shows `Auto`, `1080p HD`, and `720p HD`, not two 1080p entries.

For rotated portrait video, apply the threshold to the equivalent quality
axis after rotation: a 1080-by-1920 portrait source is eligible for 1080p and
720p, while a 720-by-1280 portrait source is eligible only for 720p.

Initial encoding rules:

- H.264 with a broadly compatible pixel format (`yuv420p`)
- AAC stereo audio
- Preserve frame rate up to 30 fps
- Six-second keyframe-aligned HLS segments
- Fragmented MP4/CMAF-style segments
- VBR encoding with capped peaks
- Do not copy or repackage the original into the HLS ladder; serve it through
  the existing authorized original-file endpoint when its resolution is
  explicitly selected

The exact bitrates should remain configurable and should be revisited using
real playback metrics. Adding 1440p, 4K, or sub-720p renditions is outside the
initial scope.

## Storage Layout

Store generated streams separately from originals:

```text
uploads/
├── videos/<video_file_id>.<ext>
└── video_streams/<prefix>/<video_file_id>/
    ├── master.m3u8
    ├── 1080p/
    │   ├── index.m3u8
    │   ├── init.mp4
    │   └── segment_00001.m4s
    └── 720p/
```

All output should first be written to a unique temporary directory. The
completed directory is atomically promoted only after FFmpeg succeeds and all
expected playlists and segments pass validation. A failed job must not replace
a previously working stream.

Deleting the final reference to a video must delete its stream directory.

## Data Model

Add persistent processing state rather than relying only on in-memory tasks.

### Video playback setting

Store a database-backed global setting:

- `adaptive_video_streaming_enabled`: boolean, non-null, default `false`

The migration must use a database/server default of `false`, not only an
application default. Existing installations and fresh installations must both
remain disabled until an admin explicitly enables the feature.

### `video_transcode_jobs`

- `id`
- `file_hash_id`
- `status`: `pending`, `processing`, `ready`, `failed`, `cancelled`
- `cancel_requested`
- `progress`
- `attempt_count`
- `error_message`
- `started_at`
- `completed_at`
- `created_at`
- `updated_at`

Only one active job may exist per underlying video.

### `video_renditions`

- `id`
- `file_hash_id`
- `quality_label`
- `width`
- `height`
- `video_bitrate`
- `audio_bitrate`
- `playlist_path`
- `file_size`
- `created_at`

One uploaded video can have many renditions. If video deduplication is added in
the future, all photo references to the same underlying video should share
these renditions.

## Processing Architecture

Encoding a multi-gigabyte video can take much longer than an HTTP request or a
normal application deployment. Jobs therefore need to be durable.

1. A completed video upload creates a `pending` transcode job only when the
   admin has enabled adaptive video playback.
2. A dedicated worker claims one job at a time.
3. The worker probes the source and builds the applicable ladder.
4. FFmpeg writes all outputs to a temporary directory.
5. The worker validates playlists, segments, duration, and available qualities.
6. Outputs are promoted atomically and rendition rows are committed.
7. The job becomes `ready`.
8. Failures record a safe admin-facing error and can be retried.

The worker should run as a separate Coolify service using the backend image,
database, and uploads volume. Start with one concurrent transcode per VPS.
Concurrency can be raised only after measuring CPU, memory, disk, and playback
impact.

Deployments and backend restarts must not lose pending jobs. A job left in
`processing` beyond a configurable timeout should return to `pending`.

When the feature is disabled, uploads complete exactly as they do today and do
not create transcode jobs, temporary rendition files, or additional permanent
video storage.

## Access Control

HLS playback makes many playlist and segment requests. Repeating a share
password in every URL is undesirable, and native HLS playback cannot reliably
attach custom authorization headers.

Before loading a stream, the frontend requests a short-lived signed playback
token after normal access validation.

The token must include:

- video/photo identifier;
- album identifier;
- access context: admin, share link, or collection;
- collection identifier when applicable;
- expiration time; and
- a random identifier or issued-at time.

The token is accepted only by the manifest and segment endpoints and cannot be
used for admin APIs or original downloads. A two-hour default lifetime is
recommended.

Every requested path must be resolved from database metadata. Never accept a
raw filesystem path from the request.

## API

### Admin processing

```text
GET  /api/system/settings/video-playback
PATCH /api/system/settings/video-playback
POST /api/videos/{photo_id}/transcode
POST /api/videos/{photo_id}/transcode/retry
GET  /api/videos/{photo_id}/processing-status
DELETE /api/videos/{photo_id}/renditions
DELETE /api/videos/renditions
```

The create endpoint is idempotent. If usable renditions already exist, it
returns the current status rather than creating duplicate work.

Transcode and retry endpoints must reject new work while the admin setting is
off. Deletion endpoints return the measured bytes reclaimed. Bulk deletion
requires an explicit confirmation in the admin UI.

### Playback authorization

```text
POST /api/videos/{photo_id}/playback-token
POST /api/share/{share_token}/videos/{photo_id}/playback-token
POST /api/collection-share/{collection_token}/albums/{album_id}/videos/{photo_id}/playback-token
```

Existing password validation applies before issuing the token.

### Streaming

```text
GET /api/video-stream/{playback_token}/master.m3u8
GET /api/video-stream/{playback_token}/{quality}/index.m3u8
GET /api/video-stream/{playback_token}/{quality}/{segment_name}
```

Responses require correct HLS MIME types, byte ranges where applicable, and
cache headers. Manifests should have short cache lifetimes; immutable completed
segments may be cached for a long period because their names and contents do
not change.

## Frontend

Create a shared video-player component used by:

- the admin lightbox;
- album share pages; and
- collection album pages.

The component should:

- request a playback token;
- use native HLS when supported;
- otherwise use `hls.js`;
- default to adaptive quality;
- expose the detected source resolution, 1080p, and 720p as applicable in a
  gear-icon quality menu;
- preserve existing playback controls and thumbnail selection;
- clean up the HLS instance when navigating between videos;
- fall back to original playback if stream setup fails; and
- report non-sensitive playback errors.

The quality menu should follow familiar YouTube-style labeling:

| Detected resolution | Visible label |
| --- | --- |
| 7680x4320 class | `4320p 8K` |
| 3840x2160 class | `2160p 4K` |
| 2560x1440 class | `1440p HD` |
| 1920x1080 class | `1080p HD` |
| 1280x720 class | `720p HD` |
| Lower or nonstandard | detected vertical resolution, such as `480p` |

Apply rotation metadata before determining the label. The UI must not display
the words `Original` or `Source`; source status is internal player metadata.

Show `Auto` first, followed by unique available resolutions in descending
order. `Auto` adapts only between generated renditions. The current
automatically selected level may be displayed next to `Auto`. Selecting the
highest source-resolution entry switches to the uploaded file. When no
renditions are generated, hide the gear-icon quality selector and play the
uploaded source directly.

## Admin Settings

Add a **Video Playback** section under dashboard settings.

### Opt-in toggle

The primary control is:

- **Label:** Generate optimized video qualities
- **Type:** Toggle
- **Default:** Off
- **Description:** Generate 1080p and 720p streaming versions when supported by
  the uploaded video. This can make playback faster and reduce buffering, but
  it uses additional storage.

Show an informational example next to the toggle:

> Example: A 1-minute video may add about 60 MB. Actual usage varies.

These estimates use the initial target bitrates in this specification. The UI
must describe them as estimates, not guarantees. Additional rendition size is
primarily determined by duration and configured bitrate, not the original file
size alone.

For a specific video, estimate additional storage before processing with:

```text
estimated bytes = duration seconds x (video bitrate + audio bitrate) / 8
```

After processing, show measured rendition storage rather than the estimate.

### Toggle behavior

- Turning the feature on affects new eligible video uploads from that point
  forward.
- Turning it on must not automatically process the existing library.
- Existing videos require a separate, explicit backfill action with a storage
  estimate and confirmation.
- Turning the feature off immediately stops creating jobs for new uploads and
  makes players use the uploaded source file.
- Pending jobs are cancelled when the feature is turned off.
- A processing worker observes `cancel_requested`, stops FFmpeg safely, removes
  temporary output, and marks the job `cancelled`.
- Turning the feature off does not silently delete completed renditions.
- Completed renditions remain unused but can be reused if the feature is
  enabled again.
- Provide a separate **Delete generated video qualities** action with a
  destructive confirmation and the amount of storage that will be reclaimed.

This separation ensures that a settings toggle never unexpectedly deletes
data, while admins who opt out can still reclaim all duplicated storage.

Additional operational controls:

- Maximum simultaneous transcodes
- Process existing videos
- Delete generated video qualities

Environment variables define deployment availability and safety caps.
Database-backed admin settings may operate only within those caps.

Suggested environment defaults:

```text
VIDEO_STREAMING_AVAILABLE=true
VIDEO_TRANSCODE_CONCURRENCY_CAP=1
VIDEO_TRANSCODE_TIMEOUT_SECONDS=21600
VIDEO_TRANSCODE_MIN_FREE_BYTES=1073741824
VIDEO_PLAYBACK_TOKEN_TTL_SECONDS=7200
```

Do not reuse upload-size environment variables for video processing settings.
`VIDEO_STREAMING_AVAILABLE` controls whether the deployment supports the
feature; it does not enable the database-backed admin toggle. If it is `false`,
the toggle is disabled with a deployment-configuration explanation.

## Existing Videos

Existing videos must be supported.

Provide an admin backfill action that:

1. lists videos without ready renditions;
2. displays estimated video count, processing work, and additional storage;
3. queues missing jobs without creating duplicates; and
4. allows failed jobs to be retried.

Enabling adaptive playback does not invoke this action automatically. The
admin must separately select and confirm existing-video processing.

The initial rollout should process a small sample before the entire library.
Backfilling should be rate-limited to avoid exhausting VPS CPU or disk.

## Storage and Capacity

Renditions trade storage and encoding time for lower playback bandwidth.
Before enabling a full backfill:

- measure output size for representative short and long videos;
- reserve space for originals, completed renditions, and temporary output;
- prevent a job from starting when free space is below a safety threshold; and
- expose total rendition storage in system information.

Temporary data should be cleaned after successful promotion, failures, and
stale jobs.

## Observability

Record:

- queue wait and processing duration;
- processing failures by FFmpeg error category;
- source and rendition sizes;
- selected quality and automatic quality switches;
- playback startup time;
- buffering events and buffered duration;
- stream response status and bytes sent; and
- fallback-to-original events.

Do not log playback tokens, passwords, or complete signed URLs.

## Rollout Plan

### Phase 0: Diagnose direct playback

- Verify byte ranges through the production proxy chain.
- Measure source bitrates and VPS outbound throughput.
- Add MP4 fast-start remuxing where compatible.

### Phase 1: Processing foundation

- Add migrations, job state, rendition metadata, storage service, and worker.
- Add the default-off admin setting and storage estimate.
- Generate applicable 1080p and 720p HLS renditions.
- Skip transcoding when the source is below 720p.
- Add cleanup, retry, and processing-status APIs.

### Phase 2: Protected playback

- Add scoped playback tokens and HLS file endpoints.
- Add the shared frontend player with `Auto` and manual quality selection.
- Preserve original playback fallback.

### Phase 3: Existing-video backfill and settings

- Add backfill controls.
- Add operational streaming and transcode settings.
- Process existing videos gradually.

### Phase 4: Optimize

- Evaluate authenticated Nginx internal delivery.
- Evaluate object storage and a CDN if audience size or geography requires it.

## Acceptance Criteria

- Adaptive video playback is off by default for upgraded and new installations.
- Uploading videos while it is off creates no rendition jobs or additional
  video files.
- An admin must explicitly enable the feature before new uploads are processed.
- Enabling the feature does not automatically backfill existing videos.
- The settings UI explains storage growth and shows an estimate before
  processing existing videos.
- A viewer can play an eligible video using `Auto`.
- A viewer can explicitly select the uploaded file through its visible
  resolution label without seeing `Original` or `Source` in the UI.
- The player lists only unique resolutions available from the uploaded source
  and generated renditions.
- Manual quality changes continue from approximately the current playback time.
- A source below a target resolution is never upscaled.
- A source below 720p is not transcoded and plays only through its detected
  resolution.
- A source from 720p through 1079p receives only a 720p rendition.
- A source at 1080p or higher receives 1080p and 720p renditions.
- Originals remain unchanged and downloadable.
- The quality selector uses a gear icon, shows `4K`/`HD` indicators, and never
  contains duplicate resolution entries.
- New uploads return successfully without waiting for transcoding.
- Existing videos can be queued and played while awaiting processing.
- Failed and interrupted jobs can be retried safely.
- Unauthorized users cannot fetch manifests or segments.
- Password and collection access rules apply to streaming.
- Deleting the last video reference removes all associated renditions.
- Disabling the feature cancels pending work, requests safe cancellation of
  active work, and returns playback to the uploaded source.
- Disabling the feature does not delete completed renditions.
- An admin can explicitly delete completed renditions and see reclaimed bytes.
- Images and image uploads are unaffected.
- Production tests confirm byte-range behavior and improved startup/buffering
  for representative large videos.

## Test Plan

### Backend

- Default-off database and API behavior
- Feature-toggle authorization, enable, disable, and deployment-cap behavior
- No job creation while disabled
- Pending and active job cancellation with temporary-file cleanup
- Rendition deletion and reclaimed-storage calculation
- Storage estimates for each eligible rendition
- Rendition selection for 4K, 1080p, intermediate, 720p, sub-720p, portrait,
  rotated, and unusual aspect-ratio inputs
- Job idempotency, claiming, timeout recovery, retry, and failure cleanup
- Atomic promotion and preservation of an existing working stream on failure
- Playback-token scope, expiration, tampering, and cross-album denial
- Admin, public share, password share, and collection authorization
- Correct manifest rewriting, MIME types, cache headers, and safe paths
- Rendition deletion when the underlying video is deleted

### Frontend

- Default-off toggle copy, storage example, confirmation, and disabled state
- Existing-video estimate and explicit backfill confirmation
- Generated-rendition deletion confirmation and reclaimed-storage display
- Native HLS and `hls.js` selection
- Automatic and fixed quality choices
- Player cleanup during lightbox navigation
- Processing and failed states
- Original-file fallback
- Admin, album-share, and collection contexts

### End-to-end

- Upload while disabled and confirm only the uploaded source exists.
- Enable the feature and confirm only subsequent eligible uploads are queued.
- Disable during processing and confirm cancellation and temporary cleanup.
- Delete generated qualities and confirm source playback still works.
- Upload a high-bitrate video, wait for processing, and play every quality.
- Seek repeatedly and confirm segment requests remain authorized.
- Throttle the browser network and confirm `Auto` switches down.
- Revoke or expire access and confirm subsequent stream requests fail.
- Restart the worker during a job and confirm recovery.

## References

- Apple HLS overview and examples:
  <https://developer.apple.com/streaming/examples/>
- Apple multivariant playlist documentation:
  <https://developer.apple.com/documentation/http-live-streaming/example-playlists-for-http-live-streaming>
- FFmpeg HLS muxer documentation:
  <https://ffmpeg.org/ffmpeg-formats.html#hls-2>
- `hls.js` browser support and integration:
  <https://github.com/video-dev/hls.js/>
