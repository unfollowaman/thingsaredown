# Render Readiness Audit Report

**Project:** Things Are Down
**Target Architecture:** Phone / Browser → Frontend → Render Backend → `yt-dlp` / Media Downloader → Source Platform → Downloaded Media → Render Backend → Phone / Browser
**Audit Date:** May 2024
**Readiness Score:** **45%**

---

## Executive Summary

This audit evaluates the codebase's readiness for transitioning from a local development prototype to an online backend hosted on **Render**, accessible across multiple devices (including smartphones).

The current application possesses a solid foundation: a native Node.js HTTP server, structured API endpoints, unit tests, URL normalizers, and a responsive frontend interface. However, it currently relies on mock data and fallback sample videos for media extraction, lacks `yt-dlp` integration, contains static file security vulnerabilities, and lacks deployment/container configuration for Render.

---

## 1. Current Architecture

* **Frontend:** Built with standard HTML5, CSS3, and modern vanilla JavaScript ESM modules (`index.html`, `src/styles.css`, `src/main.js`, `src/instagram.js`, `src/x.js`, `src/youtube.js`). No JS bundler or heavy framework is required.
* **Backend / Server-side Code:** A native Node.js HTTP server implemented in `server/app.js` and instantiated in `server/index.js`. It handles API requests (`/api/download/*`) and serves static frontend assets via `serveStatic`.
* **Framework / Runtime:** Native Node.js runtime (ESM `"type": "module"` in `package.json`), running Node.js HTTP server (`node:http`) without external web frameworks like Express or Fastify.
* **Communication:** Frontend makes HTTP `fetch` requests using relative endpoints (`/api/download/instagram`, `/api/download/x`, `/api/download/youtube`, `/api/download/file`).
* **Preparedness Status:** **Partially prepared for a backend.** The Node.js server architecture and API endpoint contracts are established, but media extraction is largely simulated and not yet connected to a CLI downloader like `yt-dlp`.

---

## 2. Downloader Implementation

* **`yt-dlp` Availability:** `yt-dlp` is **not present** anywhere in the repository. No npm dependencies, binaries, or process spawning logic reference `yt-dlp`.
* **Downloader Invocations:** No code currently invokes `yt-dlp`, FFmpeg, or any external downloader binary. No usage of `node:child_process` exists.
* **Platform Support Status:**
  * **Instagram:** Parses URLs and performs basic open-graph HTML scraping (`fetch`). If OG video metadata is unavailable, it falls back to a hardcoded Google Cloud sample MP4 video (`ForBiggerBlazes.mp4`).
  * **YouTube:** Parses URLs and fetches basic metadata from YouTube's oEmbed API (`https://www.youtube.com/oembed`). For video streams, it falls back to the hardcoded sample MP4 video.
  * **X / Twitter:** Parses and normalizes status URLs, returning a `202 Accepted` status with `"status": "metadata_ready"` and a message stating that an extractor provider needs to be connected. No media download URL is generated.
  * **Telegram:** UI tile exists, but client JavaScript throws an explicit error (`Telegram downloads are not connected yet.`).
* **Download Location:** The server endpoint `/api/download/file` acts as a streaming HTTP proxy, reading a target media URL and streaming bytes directly to the client browser with a `Content-Disposition: attachment` header.
* **Implementation Capability:** **UI / Mock Functionality.** The app cannot currently extract or download protected, high-definition, or multi-format media streams directly from YouTube, X, or Instagram.

---

## 3. Backend Readiness for Render

* **Server Entry Point:** `server/index.js` (imports and starts `createApp()` from `server/app.js`).
* **Runtime:** Node.js (started via `node server/index.js` or `npm start`).
* **Package / Dependency Requirements:** Currently has zero external npm dependencies. To support `yt-dlp`, the backend will require Python 3, `yt-dlp`, and `ffmpeg` installed in the container runtime environment.
* **Required Environment Variables:** `PORT` is supported in `server/index.js` (`process.env.PORT || '5173'`). Render automatically sets `PORT`.
* **Required Ports:** Binds dynamically to `process.env.PORT` using standard Node `server.listen(port)`.
* **Filesystem / Storage Assumptions:** `server/app.js` serves files directly relative to `PUBLIC_ROOT`. No persistent disk storage is assumed; media streaming currently happens in-memory/via HTTP pipes.
* **Temporary-File Handling:** None currently. When `yt-dlp` is integrated, ephemeral storage (`/tmp`) will be needed to handle video/audio stream merging before delivery.
* **Process Spawning Requirements:** Will require `node:child_process` (`execFile` or `spawn`) to execute `yt-dlp` CLI commands.
* **`yt-dlp` / FFmpeg on Render:** Standard Render Node.js native environments do not include `yt-dlp` or FFmpeg by default. Deployment will require a **Dockerfile** build or custom build script installing `python3`, `yt-dlp`, and `ffmpeg`.
* **Deployment Blockers:** `server/app.js` currently serves the entire root directory (including source files and `package.json`) via `serveStatic`. This must be restricted before public deployment.

---

## 4. Frontend → Backend Communication

### Existing Endpoints
* `POST /api/download/instagram`: Accepts Instagram post/reel URLs, returns normalized metadata and a `/api/download/file` stream URL.
* `POST /api/download/x`: Accepts X/Twitter status URLs, returns normalized pending metadata (`status: metadata_ready`).
* `POST /api/download/youtube`: Accepts YouTube watch/shorts URLs, returns oEmbed metadata and a `/api/download/file` stream URL.
* `GET /api/download/file`: Streams remote media files to the client with attachment headers.

### Missing Endpoints & Capabilities
* **Asynchronous Download / Job Queue Endpoint:** `yt-dlp` media extraction and FFmpeg audio/video merging can take 10 to 60+ seconds. Synchronous HTTP request-response handlers will time out on Render or mobile browsers. Endpoints like `POST /api/download/jobs` and `GET /api/download/jobs/:id` are required.
* **Progress Tracking Endpoint:** No WebSocket or Server-Sent Events (SSE) / polling endpoint exists to report percentage, speed, or estimated time remaining to the client UI.
* **Format & Quality Extraction Endpoint:** No endpoint exists to query available video resolutions (e.g. 1080p vs 720p vs audio-only) dynamically from `yt-dlp` before triggering a download.
* **Telegram Endpoint:** Missing `/api/download/telegram`.

---

## 5. File Handling

* **Current Design:** Direct HTTP streaming proxy. `handleFileDelivery` takes a `url` query parameter, fetches the remote file using `fetch()`, and pipes chunks directly to the client response stream (`res.write()`).
* **Storage Assumptions:** Zero local disk storage is currently used.
* **Render Environment Considerations:**
  * Render Web Services feature non-persistent, ephemeral disk storage.
  * Free/Starter tier instances operate with strict memory limits (512 MB RAM). Buffer-heavy streaming without backpressure or saving large temporary files entirely in RAM will cause Out-Of-Memory (OOM) crashes.
  * When `yt-dlp` merges separate audio and video streams using FFmpeg, temporary files must be written to disk (`/tmp`) and cleaned up immediately after streaming completes.

---

## 6. Cross-Device Readiness

* **Hardcoded Localhost URLs:**
  * `server/app.js` contains `ALLOWED_STREAM_DOMAINS` which explicitly includes `'127.0.0.1'` and `'localhost'`.
  * `server/index.js` logs `http://localhost:${port}` on startup.
  * `src/main.js` calls relative API paths (`/api/download/...`). If Render hosts both the static frontend and the Node API on the same domain, phone browsers can access the app directly without CORS issues.
  * If the frontend is hosted separately (e.g. on GitHub Pages), `src/main.js` lacks an environment configuration mechanism (`API_BASE_URL`) to point to the remote Render domain.
* **CORS Support:** `server/app.js` does **not** include CORS response headers (`Access-Control-Allow-Origin`, etc.). Cross-origin calls from a phone accessing a separate frontend origin will fail.
* **Security & Auth:** No authentication, token validation, or client rate limiting is in place. Exposing the server online will allow open access to any client on the internet.

---

## 7. Render-Specific Readiness

Render deployment configuration requirements (to be configured in future steps):

* **Service Type:** Web Service (Docker runtime recommended).
* **Build Command:** `npm run build` (or Docker build context).
* **Start Command:** `npm start` (`node server/index.js`).
* **Environment Variables:** `PORT` (assigned by Render), `NODE_ENV=production`, `ALLOWED_ORIGINS` (for CORS).
* **Port Configuration:** Must bind to `process.env.PORT` on host `0.0.0.0`.
* **Dependency Installation:** Requires Python 3, `yt-dlp`, and `ffmpeg` binaries in the system path.
* **Temporary Storage:** Ephemeral `/tmp` directory with automated cleanup routines.
* **Instance / Bandwidth Considerations:** Render Free tier puts inactive web services to sleep after 15 minutes of inactivity (causing a 30–50 second cold-start delay for mobile requests). Free instances also have 512 MB RAM limits.

---

## 8. Security Findings

* **1. Server-Side Request Forgery (SSRF):**
  `ALLOWED_STREAM_DOMAINS` in `server/app.js` includes `'127.0.0.1'` and `'localhost'`. An attacker or remote client can craft requests to `/api/download/file?url=http://127.0.0.1:5173/package.json` or probe other internal network ports on the server host.
* **2. Arbitrary Source File Exposure:**
  `serveStatic` in `server/app.js` uses `PUBLIC_ROOT` set to the project root directory (`fileURLToPath(new URL('..', import.meta.url))`). Any external user can fetch internal server files, tests, and configuration directly in their browser (e.g., `GET /server/app.js`, `GET /package.json`, `GET /.git/config`).
* **3. Command Injection Risk (Future `yt-dlp` integration):**
  When passing user-supplied video URLs to `yt-dlp` via CLI, using `child_process.exec` or shell strings will allow command injection. Execution must use `child_process.spawn` or `child_process.execFile` with argument arrays.
* **4. Unrestricted Resource Consumption / DoS:**
  There is no IP-based rate limiting, max payload size enforcement, or request concurrency limiting. Remote clients could flood the Render backend with download requests, depleting bandwidth and CPU.
* **5. Missing CORS Protections:**
  No CORS headers or origin restrictions exist on API routes.

---

## 9. What is Already Complete

The following components are implemented, verified by unit tests, and ready to be reused:

1. **HTTP Server Core (`server/app.js`, `server/index.js`):** Lightweight, zero-dependency Node.js HTTP server.
2. **Dynamic Port Binding:** Reads `process.env.PORT` automatically.
3. **URL Normalization Libraries (`src/instagram.js`, `src/x.js`, `src/youtube.js`):** Tested URL validation and canonicalization for Instagram, X/Twitter, and YouTube links.
4. **API Routing Structure:** Standardized endpoints (`/api/download/instagram`, `/api/download/x`, `/api/download/youtube`, `/api/download/file`).
5. **Streaming File Delivery Handler (`handleFileDelivery`):** Stream piping with `Content-Disposition` header support.
6. **Frontend Web UI (`index.html`, `src/main.js`, `src/styles.css`):** Responsive dark-theme interface with link auto-detection, quality dropdown, and status feedback.
7. **Automated Test Suite (`test/*.test.js`):** 22 passing unit/integration tests using native Node.js test runner (`npm test`).

---

## 10. What Remains

### Required Code Changes
* Restrict `serveStatic` in `server/app.js` to only serve built static assets from a designated directory (`dist` or `public`), blocking access to `server/` and project root files.
* Remove `127.0.0.1` and `localhost` from `ALLOWED_STREAM_DOMAINS` in `server/app.js`.
* Integrate `yt-dlp` media extraction service using `node:child_process` (`execFile` / `spawn`).
* Implement an asynchronous job/task mechanism or streaming response pattern for long downloads to prevent HTTP timeouts.
* Implement CORS headers middleware in `server/app.js`.
* Add dynamic API URL configuration in `src/main.js` (`API_BASE_URL`).

### Required Dependency / Tool Changes
* Include Python 3, `yt-dlp`, and `ffmpeg` in the backend execution environment.

### Required Configuration
* Create a `Dockerfile` (or Render build script) specifying Node.js + Python 3 + `yt-dlp` + FFmpeg.
* Add `.dockerignore` to exclude `node_modules` and test files from production builds.

### Required Render Setup
* Create a Web Service on Render pointing to the repository.
* Set environment variables (`PORT`, `NODE_ENV=production`).

### Recommended Security Improvements
* Add basic IP rate limiting middleware on API routes.
* Validate all URL inputs against strict protocol and domain pattern rules before execution.
* Ensure all temporary files in `/tmp` are cleaned up automatically after streaming or timeout.

### Optional Improvements
* Implement WebSocket / SSE support for real-time download progress updates (e.g., download percentage, speed).
* Implement Telegram link extraction.

---

## 11. Readiness Score: 45%

**Score Rationale:**
* **What is ready (45%):**
  * Server entry point, dynamic port binding, API routes, URL normalizers, streaming file proxy, responsive UI, and test suite are 100% functional and clean.
* **What is missing (55%):**
  * **30% - Media Downloader:** No real `yt-dlp` integration or FFmpeg tooling is present; currently relies on mock/sample video links.
  * **15% - Container / Render Config:** No `Dockerfile` or Render build configuration exists to provision Python, `yt-dlp`, and FFmpeg on Render.
  * **10% - Security & Production Readiness:** Critical source file exposure vulnerability, SSRF vulnerability, missing CORS, and lack of async job handling for long downloads.

---

## 12. Recommended Implementation Order

When development begins, the following sequence is recommended:

1. **Security & Static Directory Isolation:**
   Fix `serveStatic` to restrict served files to `dist/`, and remove `localhost`/`127.0.0.1` from `ALLOWED_STREAM_DOMAINS`.
2. **Containerization & Tooling Setup:**
   Create a `Dockerfile` containing Node.js, Python 3, `yt-dlp`, and FFmpeg to verify local container parity with Render.
3. **`yt-dlp` Integration Service:**
   Create a server module (`server/downloader.js`) that safely executes `yt-dlp` via `child_process.execFile` to fetch real video streams and format lists.
4. **Asynchronous Job & Streaming Backend:**
   Update `/api/download/*` routes to handle long-running extractions safely without timing out.
5. **CORS & Environment API Configuration:**
   Add CORS headers in `server/app.js` and configurable `API_BASE_URL` in `src/main.js` so frontend and backend can be hosted flexibly.
6. **Render Deployment:**
   Deploy the Docker Web Service to Render, set environment variables, and verify cross-device operation on mobile browsers.
