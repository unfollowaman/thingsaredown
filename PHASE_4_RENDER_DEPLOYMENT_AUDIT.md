# Phase 4 Audit Report — Docker + Render Deployment

**Status:** READY FOR RENDER DEPLOYMENT
**Date:** August 26, 2026
**Target Architecture:** Phone/Browser → Render Web Service → Node.js Native HTTP API → Async Download Job → yt-dlp → FFmpeg → Temporary File Storage → Secure File Delivery

---

## 1. Docker Environment & Architecture

### Dockerfile Architecture
- **Base Image:** `node:20-bookworm-slim` (Debian Bookworm)
- **Installed Runtimes & Dependencies:**
  - **Node.js:** `v20.20.2`
  - **Python 3:** `3.11.2`
  - **Deno (yt-dlp EJS JS Challenge Solver):** `2.9.5` (installed at `/usr/local/bin/deno`)
  - **FFmpeg:** `5.1.9-0`
  - **yt-dlp:** `2026.08.19` (standalone binary downloaded from official releases at `/usr/local/bin/yt-dlp`)
  - **System utilities:** `ca-certificates`, `curl`, `unzip`
- **Exposed Port:** `5173` (supports process environment override via `PORT`)
- **Container Entrypoint:** `npm start` (`node server/index.js`)

### `.dockerignore` Configuration
The `.dockerignore` excludes non-production artifacts from entering the build context and image:
- `node_modules`
- `.git`
- `.env` & `.env.*`
- Local `.md` files (except `README.md`)
- Build target (`dist`)
- Local temporary files (`/tmp/*`)
- Log files (`*.log`)

---

## 2. Environment Variables & Server Configuration

### Server Host Binding
- Modified `server/index.js` to bind to `0.0.0.0` rather than `localhost` or `127.0.0.1`.
- Enables Render and external network interfaces (mobile devices/desktops) to connect to the Node.js HTTP server on container port `process.env.PORT || 5173`.

### Supported Environment Variables
| Variable Name | Purpose | Production Default / Render Behavior |
| --- | --- | --- |
| `PORT` | HTTP server port | Dynamically assigned by Render (defaults to `5173` locally) |
| `NODE_ENV` | Application environment | Set to `production` |
| `ALLOWED_ORIGINS` | CORS access control | Optional CSV list of allowed origins (e.g. custom domain) |
| `YTDLP_PATH` | Path override for `yt-dlp` | Discovered automatically from `PATH` (`/usr/local/bin/yt-dlp`) |
| `FFMPEG_PATH` | Path override for `ffmpeg` | Discovered automatically from `PATH` (`/usr/bin/ffmpeg`) |

---

## 3. Automated Test Suite Results Inside Docker

The test suite was executed inside the isolated Docker container via `docker run --rm things-are-down npm test`:

```text
TAP version 13
1..32
# tests 32
# pass 32
# fail 0
# cancelled 0
# skipped 0
# duration_ms 11504.43843
```

All **32/32 tests passed** without modifications or weakening of test conditions:
1. `getBinaryPaths` detects `yt-dlp` and `ffmpeg` binaries.
2. `registerTempFile` and `removeTempFile` manage tokens safely.
3. `cleanupExpiredTempFiles` purges expired files.
4. `extractMediaInfo` metadata extraction handling.
5. `extractMediaInfo` invalid/unsupported URL rejection.
6. Instagram reel URL normalization.
7. Instagram reels path canonicalization.
8. Non-Instagram URL rejection.
9. Job Manager lifecycle (creation, retrieval, progress update, TTL cleanup).
10. Job Cancellation (active job termination and status update).
11. `parseProgressLine` yt-dlp progress and FFmpeg post-processing parser.
12. API endpoints: HTTP 202 job creation, GET job status, cancel endpoint.
13. `GET /api/download/file` serves temp file by token and cleans up after response.
14. `GET /api/download/file` returns 404 for invalid token or path traversal attempt.
15. `POST /api/download/youtube` rejects unsupported URLs.
16. `POST /api/download/instagram` rejects unsupported URLs.
17. `POST /api/download/x` rejects unsupported URLs.
18. Static file serving isolates public frontend assets (`index.html`, `src/*`) and blocks internal project files.
19. SSRF prevention blocks loopback, private IP, and arbitrary domain targets.
20. URL validation rejects non-HTTP/HTTPS protocols across endpoints.
21. Payload size limit enforcement (413 Payload Too Large).
22. Rate limiting enforcement (429 Too Many Requests).
23. CORS enforcement via `ALLOWED_ORIGINS`.
24–27. X/Twitter URL normalization, canonicalization, and validation.
28–32. YouTube URL normalization, shorts parsing, and validation.

---

## 4. Real Containerized Media Download Execution

A full end-to-end media download was performed inside the container using `yt-dlp` and `FFmpeg`:

- **Media Extracted:** `Big Buck Bunny` (Public domain test media)
- **Progress Tracking:**
  - `downloading`: `0%` → `0.1%` → `6.8%` → `40.7%` → `94.9%`
  - `processing`: `99%` (FFmpeg post-processing and format conversion)
  - `completed`: `100%`
- **Temporary Storage File:** Registered at `/tmp/things-are-down-downloads/[fileId]-Big Buck Bunny.mp4`
- **File Delivery Token:** Created random UUID token linked to file path with 15-minute TTL.

---

## 5. Render Service Configuration Plan

### Target Architecture & Settings
- **Service Type:** Render Web Service (Docker Runtime)
- **Repository:** Single git repo containing frontend + backend
- **Docker Build Context:** `.`
- **Dockerfile Path:** `./Dockerfile`
- **Health Check Path:** `/` (returns HTTP 200 `index.html`)

### Render Production Environment Variables
- `NODE_ENV=production`
- `ALLOWED_ORIGINS` (Optional; set only if accessing from separate domain)
- Render automatically injects `PORT` (e.g., `10000`).

---

## 6. Security Verification

Production deployment was audited against critical security boundaries:

1. **Source File Exposure & Static Asset Isolation:**
   - Handled in `serveStatic()` in `server/app.js`.
   - Only `index.html` and `/src/*` are reachable. Attempting to access `/server/app.js`, `/package.json`, `/Dockerfile`, or `.git` returns **HTTP 403 Forbidden**.
2. **SSRF & Private IP Access:**
   - Handled in `isAllowedUrl()`.
   - Direct IP addresses, `localhost`, `127.0.0.1`, loopback, and private IPs are strictly rejected.
3. **Path Traversal & Shell Injection:**
   - Temp file tokens are random Crypto UUIDs.
   - External executables are invoked via `child_process.execFile` and `child_process.spawn` with array arguments without shell interpretation.
4. **Rate Limiting & Concurrency Controls:**
   - Rate limit: Max 60 requests per minute per IP (**HTTP 429 Too Many Requests**).
   - Concurrency limit: Max 15 concurrent active API requests (**HTTP 503 Server Busy**).
5. **Payload Size Limits:**
   - Maximum body size: 64 KB (**HTTP 413 Payload Too Large**).

---

## 7. Known Platform & Infrastructure Limitations

1. **YouTube Datacenter IP Restrictions (GVS PO Tokens / SABR):**
   - YouTube enforces GVS PO Tokens (Proof of Origin) or login cookies for direct video stream fragment downloads on non-residential (datacenter) IPs.
   - Metadata extraction (`title`, `thumbnail`, `duration`, `formats`) works cleanly.
   - Video fragment downloads on cloud/datacenter IPs (Render, AWS, DigitalOcean) may fail with `HTTP Error 403: Forbidden` unless YouTube cookies or PO token providers are configured.
2. **Instagram & X Public Access Limits:**
   - Instagram reels and X status posts marked private, age-restricted, or requiring login are rejected with HTTP 422 ("Media is private, restricted, or requires authentication").
3. **Render Free Tier Storage & Process Behavior:**
   - Temporary files stored in `/tmp/things-are-down-downloads` are lost when the Render service restarts or spins down due to inactivity.
   - In-memory job states reset upon service restart.

---

## 8. Final Readiness Assessment

**Final Status:** READY (Personal cross-device media downloader running on Render)

The application code, Docker container, environment variables, security protections, async job runner, yt-dlp/FFmpeg binaries, and automated test suite are fully validated and ready for production deployment on Render.
