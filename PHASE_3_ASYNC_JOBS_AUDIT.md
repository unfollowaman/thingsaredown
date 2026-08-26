# Phase 3 Asynchronous Job-Based Download System Audit Report

## 1. Architecture Before Phase 3
In Phase 2, downloads were executed synchronously inside the HTTP request handlers (`POST /api/download/[platform]`).
The HTTP connection was held open while `yt-dlp` extracted media info, downloaded streams, and `FFmpeg` merged video/audio streams into an output MP4 file.

**Synchronous Flow:**
```
Browser / Phone
  └─► HTTP POST /api/download/youtube (Connection open for 30s-2min+)
        └─► yt-dlp / FFmpeg executes
              └─► Responds with HTTP 200 + token download URL
```
**Limitation:** Slow or large downloads caused browser / reverse-proxy HTTP connection timeouts.

## 2. Architecture After Phase 3
In Phase 3, media extraction and downloads run asynchronously in the background. Creation endpoints immediately acknowledge requests with an HTTP 202 status and a unique job ID. The client polls job status via a lightweight endpoint until the file is ready.

**Asynchronous Flow:**
```
Browser / Phone
  │
  ├─► HTTP POST /api/download/[platform]
  │     └─► Responds immediately with HTTP 202 Accepted + jobId
  │
  ├─► Background Job Runner
  │     ├─► Status: queued ──► extracting ──► downloading (with progress %) ──► processing (FFmpeg) ──► completed
  │     └─► Registers temporary download token
  │
  ├─► HTTP GET /api/download/jobs/:id (Polled every 1.5s)
  │     └─► Receives progress %, speed, ETA, status, and downloadUrl when completed
  │
  └─► Browser triggers direct file download via token link
```

## 3. Job Lifecycle / State Machine
Jobs advance through a deterministic state machine managed by `server/jobs.js`:

```
 [queued]
    │
    ▼
 [extracting] ──► (yt-dlp metadata query)
    │
    ▼
 [downloading] ──► (yt-dlp streams audio/video; updates progress %, speed, ETA)
    │
    ▼
 [processing]  ──► (FFmpeg merges formats / re-encodes audio)
    │
    ├───────────────┐
    ▼               ▼
 [completed]    [failed / cancelled]
```

- **queued**: Job registered in memory.
- **extracting**: Downloader is running `yt-dlp --dump-json` to gather title, duration, thumbnail, and format options.
- **downloading**: Downloader is fetching media fragments.
- **processing**: `yt-dlp` / `FFmpeg` is merging separate video and audio streams into the final MP4 output.
- **completed**: Output file exists on disk, registered in temporary file store, and ready for client delivery.
- **failed**: Extraction, download, process, or format error occurred; temporary partial files cleaned up.
- **cancelled**: User terminated job; subprocess killed and partial files unlinked.

## 4. API Changes
- **`POST /api/download/youtube`**: Returns `HTTP 202 Accepted` with payload `{ id, jobId, status: 'queued', statusUrl: '/api/download/jobs/:id', message }`.
- **`POST /api/download/instagram`**: Returns `HTTP 202 Accepted` with payload `{ id, jobId, status: 'queued', statusUrl: '/api/download/jobs/:id', message }`.
- **`POST /api/download/x`**: Returns `HTTP 202 Accepted` with payload `{ id, jobId, status: 'queued', statusUrl: '/api/download/jobs/:id', message }`.
- **`GET /api/download/jobs/:id`**: Returns `HTTP 200 OK` with payload `{ id, platform, url, quality, status, progress, downloadedBytes, totalBytes, speed, eta, filename, downloadUrl, title, thumbnail, duration, formats, error, createdAt, updatedAt }` (or `HTTP 404` if job not found).
- **`POST /api/download/jobs/:id/cancel`**: Terminates active background `yt-dlp`/`FFmpeg` subprocess and sets job status to `cancelled`.
- **`GET /api/download/file?token=[token]&filename=[filename]`**: Serves temporary file content with `Content-Disposition: attachment` and unlinks file immediately upon completion.

## 5. Downloader Changes
- `server/downloader.js` was updated to use `child_process.spawn` (with `shell: false`) instead of `execFileAsync` for downloading.
- Passes `--newline` and `--progress-template "ytdljob:%(progress.status)s|%(progress._percent_str)s|%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress._speed_str)s|%(progress._eta_str)s"` to `yt-dlp`.
- Streams stdout/stderr line by line to feed progress updates (`progress`, `speed`, `eta`, `downloadedBytes`, `totalBytes`) back to `server/jobs.js`.
- Cleans up partial files automatically upon failure or cancellation.

## 6. Progress Implementation
- Structured line parsing parses `yt-dlp` output into numeric progress percentages (capped at 99% until fully finished and registered).
- Fallback regex parses standard `[download] XX.X% of ... at ... ETA ...` lines if output format varies.
- Merging/FFmpeg events (`[Merger]`, `[ExtractAudio]`, `[FixupM3u8]`) explicitly transition state to `processing` with 99% progress.

## 7. Temporary-File Lifecycle
- Temporary storage directory: `/tmp/things-are-down-downloads/`
- Output filename template: `[random-hex-8]-%(title)s.%(ext)s`
- Token mapping: Cryptographically random UUID (`randomUUID()`) registered upon download completion.
- Cleanup:
  1. On HTTP delivery finish/close (`res.on('finish')`, `res.on('close')`).
  2. On job failure or process cancellation.
  3. Automatic background TTL sweep every 5 minutes purging files older than 15 minutes.
  4. Process termination handlers on `SIGINT` and `SIGTERM`.

## 8. Cleanup Strategy
- In-memory job records in `server/jobs.js` expire and are removed after 15 minutes (matching temporary file TTL).
- Automatic TTL interval (`setInterval(cleanupExpiredJobs, 5 * 60 * 1000).unref()`) purges old job records to prevent unbounded memory growth.

## 9. Cancellation Support
- Implemented via `POST /api/download/jobs/:id/cancel`.
- Sends `SIGTERM` to the active `ChildProcess` handle stored on the job record.
- Cleans up partial files associated with the job's unique random ID.
- Updates job state to `cancelled`.

## 10. Security Verification
- **Job ID Unpredictability**: Uses cryptographic UUID v4 (`randomUUID()`).
- **No Direct Filesystem Access**: Clients cannot query or request direct file paths; only registered temporary tokens are accepted.
- **SSRF Protections**: Strict domain whitelist and protocol check (rejecting localhost, loopback, private IPs, metadata IPs) active on all URL validation.
- **No Shell Interpolation**: All subprocess calls use `spawn` and `execFile` with `shell: false` and explicit argument arrays.
- **Rate Limiting & Concurrency**: Rate limiter limits API requests to 60 req/min per IP. Concurrency cap (15 active HTTP requests) remains enforced.

## 11. Tests Added
- `test/jobs.test.js`:
  - `Job Manager lifecycle: creation, retrieval, updates, and TTL cleanup`
  - `Job Cancellation: cancels active job and marks status as cancelled`
  - `parseProgressLine parses structured yt-dlp progress and FFmpeg states`
  - `API endpoints: HTTP 202 job creation, GET job status, and cancel API`

## 12. Complete Test Results
Ran `npm test` (`node --test`):
```
TAP version 13
ok 1 - getBinaryPaths detects yt-dlp and ffmpeg executables
ok 2 - registerTempFile and removeTempFile manage temp tokens safely
ok 3 - cleanupExpiredTempFiles purges files older than TTL
ok 4 - extractMediaInfo handles valid YouTube URL when yt-dlp is available
ok 5 - extractMediaInfo rejects invalid / unsupported URL
ok 6 - normalizes Instagram reel URLs
ok 7 - canonicalizes reels plural path segment to reel
ok 8 - rejects non-Instagram URLs
ok 9 - Job Manager lifecycle: creation, retrieval, updates, and TTL cleanup
ok 10 - Job Cancellation: cancels active job and marks status as cancelled
ok 11 - parseProgressLine parses structured yt-dlp progress and FFmpeg states
ok 12 - API endpoints: HTTP 202 job creation, GET job status, and cancel API
ok 13 - GET /api/download/file serves temp file by token and cleans up after response
ok 14 - GET /api/download/file returns 404 for invalid token or path traversal attempts
ok 15 - POST /api/download/youtube rejects unsupported URLs
ok 16 - POST /api/download/instagram rejects unsupported URLs
ok 17 - POST /api/download/x rejects unsupported URLs
ok 18 - Static file serving isolates public frontend assets and blocks internal project files
ok 19 - SSRF prevention blocks internal loopback, private IP, and arbitrary domain targets
ok 20 - URL validation rejects non-HTTP/HTTPS protocols across endpoints
ok 21 - Rejects oversized request body payloads with 413 Payload Too Large
ok 22 - Enforces rate limiting on API endpoints with 429 Too Many Requests
ok 23 - Enforces CORS when ALLOWED_ORIGINS environment variable is set
ok 24 - normalizes X status URLs
ok 25 - normalizes Twitter status URLs to X canonical URLs
ok 26 - rejects non-X/Twitter URLs
ok 27 - rejects X/Twitter URLs without status IDs
ok 28 - normalizes standard YouTube watch URLs
ok 29 - normalizes short YouTube (youtu.be) URLs
ok 30 - normalizes YouTube Shorts URLs
ok 31 - rejects non-YouTube URLs
ok 32 - rejects YouTube URLs without video ID
1..32
# tests 32
# suites 0
# pass 32
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

## 13. Known Limitations
- In-memory registry: Job state is maintained in process memory (`Map`). Process restarts will clear active job states. This limitation is acceptable for the current architecture prior to Render deployment.
- Horizontal scaling: Multi-instance deployments would require persistent storage (e.g., Redis) to share job state across worker nodes.

## 14. What Remains Before Render Deployment
- Render build configuration / Dockerfile for installing Node.js, Python 3, `yt-dlp`, and `ffmpeg`.
- Production environment variable configuration (`PORT`, `ALLOWED_ORIGINS`, `YTDLP_PATH`, `FFMPEG_PATH`).

## 15. Confirmation Render Was NOT Configured/Deployed
**Render deployment was NOT performed in Phase 3.** No Render services were created, no secret environment variables committed, and no Render configuration files were generated.

## 16. Confirmation Docker Deployment Configuration Was NOT Added
**Docker deployment configuration was NOT added in Phase 3.** No `Dockerfile`, `.dockerignore`, or `docker-compose.yml` files were created or committed.
