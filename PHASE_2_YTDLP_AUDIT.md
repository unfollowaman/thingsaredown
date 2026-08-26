# Phase 2 yt-dlp & FFmpeg Downloader Hardening Audit Report

## 1. Architecture Implemented
Phase 2 introduces a real media extraction and downloading backend built on `yt-dlp` and `FFmpeg` executed asynchronously via Node.js subprocess calls (`child_process.execFile`).

**Architecture Diagram:**
```
Browser / Frontend (src/main.js)
       │
       ▼ (HTTP POST /api/download/[platform])
Node.js API Server (server/app.js)
       │
       ▼
Downloader Service (server/downloader.js)
       │
       ├────► child_process.execFile("yt-dlp", ["--dump-json", targetUrl])  ─► Extract Metadata
       │
       └────► child_process.execFile("yt-dlp", ["-f", formatSpec, "-o", tempTemplate, targetUrl]) ─► Download Media
                 │
                 ▼ (if format stream merging required)
              FFmpeg (/tmp/bin/ffmpeg or system PATH)
                 │
                 ▼
       Temporary Local File Storage (/tmp/things-are-down-downloads/[token]-media.mp4)
                 │
                 ▼ (GET /api/download/file?token=[token]&filename=[name])
       Streamed Response to Browser & Immediate Post-Delivery Cleanup
```

## 2. Files Created
- `server/downloader.js` — Core media extraction and downloading service. Manages binary path resolution (`yt-dlp` & `ffmpeg`), child process spawn execution using `execFile`, output formatting, format selection, and temporary file token registration/cleanup.
- `test/downloader.test.js` — Dedicated test suite verifying binary location resolution, temporary file registration, expiration TTL cleanup, metadata extraction, and error handling.
- `PHASE_2_YTDLP_AUDIT.md` — Phase 2 audit and setup documentation.

## 3. Files Modified
- `server/app.js` — Updated `/api/download/instagram`, `/api/download/x`, and `/api/download/youtube` endpoints to execute real extraction/downloads via `server/downloader.js`. Updated `/api/download/file` to serve temporary downloaded files via cryptographically random tokens (`token`) with automatic file unlinking on completion/close.
- `src/youtube.js` — Connected YouTube extractor to `server/downloader.js`, removing mock fallbacks.
- `src/instagram.js` — Connected Instagram extractor to `server/downloader.js`, removing mock fallbacks.
- `src/x.js` — Connected X/Twitter extractor to `server/downloader.js`, removing mock/pending fallbacks.
- `src/main.js` — Updated frontend UI logic to render real extracted titles, durations, thumbnails, and available format lists from backend responses, and trigger file downloads via the secure file token API.
- `test/server.test.js` — Updated API tests for secure token delivery, rate limiting, and security boundaries.

## 4. yt-dlp Installation / Setup Requirements
- **Runtime Requirement:** Python 3 (v3.8+) or standalone `yt-dlp` executable.
- **Local Dev Installation Command:**
  ```bash
  pip install yt-dlp
  # or
  pip3 install yt-dlp
  # or static binary:
  curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /tmp/bin/yt-dlp && chmod +x /tmp/bin/yt-dlp
  ```
- **Binary Resolution in Application:** The backend searches for `yt-dlp` in `process.env.YTDLP_PATH`, standard system `PATH`, `/tmp/bin`, `/usr/local/bin`, `/usr/bin`, and `/bin`.

## 5. FFmpeg Setup Requirements
- **Requirement:** `ffmpeg` binary for merging high-definition video and audio streams into single MP4 files or re-encoding audio formats.
- **Local Dev Installation Command:**
  ```bash
  # Debian/Ubuntu system:
  apt-get install -y ffmpeg
  # Or standalone static build:
  mkdir -p /tmp/bin
  curl -L https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz -o /tmp/bin/ffmpeg.tar.xz
  tar -xJf /tmp/bin/ffmpeg.tar.xz -C /tmp/bin --strip-components=1
  ```
- **Binary Resolution in Application:** The backend searches for `ffmpeg` in `process.env.FFMPEG_PATH`, system `PATH`, and `/tmp/bin`. Automatically passes `--ffmpeg-location` to `yt-dlp` invocations when detected.

## 6. API Changes
- `POST /api/download/youtube`: Returns `{ status, platform, type, videoId, canonicalUrl, requestedQuality, title, thumbnail, duration, filename, formats, downloadUrl }`.
- `POST /api/download/instagram`: Returns real metadata and temporary file download token link.
- `POST /api/download/x`: Returns real metadata and temporary file download token link.
- `GET /api/download/file?token=[token]&filename=[name]`: Validates token against active temporary file registry, streams content to client with `Content-Disposition: attachment`, and unlinks the local file immediately after stream completion or error.

## 7. Frontend Changes
- `src/main.js` now populates media titles, duration indicators, thumbnail previews, and populates quality dropdown select options (`1080p`, `720p`, `Audio`) directly from backend extraction metadata.
- Erroneous or unsupported media extractions update the UI with descriptive error states.

## 8. Temporary-File Strategy
- Storage location: `/tmp/things-are-down-downloads/`
- Filename generation: `[random-hex-8]-%(title)s.%(ext)s` (derived output filename sanitization).
- Access control: Files are mapped to a cryptographically secure UUID token (`randomUUID()`) in `server/downloader.js`. Files cannot be accessed directly via path parameters.
- Cleanup triggers:
  1. Immediately upon completion of HTTP stream delivery (`res.on('finish')` / `res.on('close')`).
  2. On download or extraction failure cleanup loops.
  3. Automatic background TTL cleanup every 5 minutes purging files older than 15 minutes.
  4. Process termination handlers on `SIGINT` and `SIGTERM`.

## 9. Security Verification
- **Command Injection Prevention:** `child_process.execFile` is strictly used without shell option (`shell: false`). User URLs are passed strictly as array element arguments (`[targetUrl]`), preventing shell metacharacters (`;&|`) from executing arbitrary commands.
- **SSRF Protections:** Phase 1 URL domain validation remains enforced prior to invoking `yt-dlp`. Internal IPs, loopback, private ranges, metadata endpoints, and non-whitelisted domains are rejected.
- **Path Traversal Prevention:** Direct file paths are never accepted in query parameters. Only registered random tokens (`token`) are accepted by `/api/download/file`.
- **Static Asset Isolation & Limits:** Rate limiting (60 req/min/IP), concurrency cap (15 concurrent active requests), payload size limit (64 KB JSON body), and static asset directory isolation remain active and intact.

## 10. Tests Added
- `test/downloader.test.js`:
  - `getBinaryPaths detects yt-dlp and ffmpeg executables`
  - `registerTempFile and removeTempFile manage temp tokens safely`
  - `cleanupExpiredTempFiles purges files older than TTL`
  - `extractMediaInfo handles valid YouTube URL when yt-dlp is available`
  - `extractMediaInfo rejects invalid / unsupported URL`
- `test/server.test.js`:
  - `GET /api/download/file serves temp file by token and cleans up after response`
  - `GET /api/download/file returns 404 for invalid token or path traversal attempts`

## 11. Complete Test Results
Running `npm test` (`node --test`):
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
ok 9 - GET /api/download/file serves temp file by token and cleans up after response
ok 10 - GET /api/download/file returns 404 for invalid token or path traversal attempts
ok 11 - POST /api/download/youtube rejects unsupported URLs
ok 12 - POST /api/download/instagram rejects unsupported URLs
ok 13 - POST /api/download/x rejects unsupported URLs
ok 14 - Static file serving isolates public frontend assets and blocks internal project files
ok 15 - SSRF prevention blocks internal loopback, private IP, and arbitrary domain targets
ok 16 - URL validation rejects non-HTTP/HTTPS protocols across endpoints
ok 17 - Rejects oversized request body payloads with 413 Payload Too Large
ok 18 - Enforces rate limiting on API endpoints with 429 Too Many Requests
ok 19 - Enforces CORS when ALLOWED_ORIGINS environment variable is set
ok 20 - normalizes X status URLs
ok 21 - normalizes Twitter status URLs to X canonical URLs
ok 22 - rejects non-X/Twitter URLs
ok 23 - rejects X/Twitter URLs without status IDs
ok 24 - normalizes standard YouTube watch URLs
ok 25 - normalizes short YouTube (youtu.be) URLs
ok 26 - normalizes YouTube Shorts URLs
ok 27 - rejects non-YouTube URLs
ok 28 - rejects YouTube URLs without video ID
1..28
# tests 28
# suites 0
# pass 28
# fail 0
```

## 12. Known Limitations
- Social media anti-bot protections: Platforms like Instagram and X/Twitter frequently require cookies or updated user-agents to bypass rate limits or login walls for private posts.
- Long-running downloads: Downloads are processed synchronously in request handlers; very large files (e.g. multi-gigabyte videos) may exceed HTTP client connection timeouts if network bandwidth is limited.

## 13. What Remains for Production
- Background job queue architecture (Phase 3) for handling long-running downloads asynchronously with WebSocket or polling progress status updates.
- Persistent cookies / session rotation support for yt-dlp when accessing restricted platform content.

## 14. What Must Be Done Specifically for Render
- Create a multi-stage Dockerfile or custom Render build script (`apt-get update && apt-get install -y python3 ffmpeg && pip install yt-dlp`).
- Configure Render Web Service environment variables (`YTDLP_PATH`, `FFMPEG_PATH`, `ALLOWED_ORIGINS`, `PORT`).

## 15. Render Deployment Confirmation
**Render was NOT deployed or configured during Phase 2.** No Render services were created, no secrets committed, and no Dockerfile was generated.
