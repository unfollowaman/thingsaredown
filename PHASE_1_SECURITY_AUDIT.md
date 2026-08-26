# Phase 1 — Security Audit & Hardening Report

**Project:** Things Are Down
**Phase:** Phase 1 — Security Hardening
**Date:** May 2024
**Status:** Completed

---

## 1. Security Problems Found

During the initial audit and code review of the pre-production application, the following security vulnerabilities and production-readiness issues were identified:

1. **Arbitrary Internal File Exposure via `serveStatic`:**
   The HTTP server served files directly from the project root directory (`PUBLIC_ROOT = ROOT`). External users could request sensitive internal server source code (`/server/app.js`), configuration (`/package.json`), unit tests (`/test/server.test.js`), and repository history (`/.git/config`).
2. **Server-Side Request Forgery (SSRF) in `/api/download/file`:**
   The domain allowlist (`ALLOWED_STREAM_DOMAINS`) explicitly included `127.0.0.1` and `localhost`. External clients could supply internal server or loopback URLs (`/api/download/file?url=http://127.0.0.1:5173/package.json`), exposing local services and internal ports.
3. **Incomplete URL Input Validation:**
   API endpoints (`/api/download/instagram`, `/api/download/youtube`, `/api/download/x`) validated hostnames but did not strictly enforce scheme restrictions (`http:` / `https:`), allowing dangerous pseudo-protocols (e.g. `file://`, `javascript:`).
4. **Unrestricted Resource Consumption / Abuse Risks:**
   The server lacked request body size limits, IP-based rate limiting, and request concurrency limits, exposing the server to denial-of-service (DoS) attacks and resource exhaustion.
5. **Missing Configurable CORS Controls:**
   The server lacked configurable Cross-Origin Resource Sharing (CORS) header controls for scenarios where frontend and backend are deployed across distinct subdomains or origins.

---

## 2. Changes Made

1. **Restricted Static File Serving (`server/app.js`):**
   Isolated static file serving so that `serveStatic` only delivers intentionally designated public frontend assets (`index.html` at root and files strictly within the `src/` directory). Blocked access to `/server/`, `/test/`, `/package.json`, `/.git/`, and all non-frontend files with HTTP `403 Forbidden`.
2. **Remediated SSRF Vulnerability (`server/app.js`):**
   Removed `127.0.0.1` and `localhost` from `ALLOWED_STREAM_DOMAINS`. Added explicit checks rejecting IP literal hostnames (`^(\d{1,3}\.){3}\d{1,3}$`), IPv6 brackets, and `localhost` hostnames, restricting proxy file streaming solely to permitted external media domains.
3. **Strict URL Input Validation (`src/instagram.js`, `src/youtube.js`, `src/x.js`):**
   Added protocol validation ensuring only `http:` and `https:` schemes are accepted across all media URL normalizers. Rejected non-HTTP schemes (such as `file:`, `javascript:`, `ftp:`) with HTTP `400 Bad Request`.
4. **Basic Request & DoS Protections (`server/app.js`):**
   - **Payload Limits:** Added a 64 KB maximum body limit in `readJson()`. Payload size violations return HTTP `413 Payload Too Large`.
   - **IP Rate Limiting:** Implemented a lightweight, zero-dependency sliding window rate limiter (max 60 requests per minute per IP address). Requests exceeding the limit receive HTTP `429 Too Many Requests` with a `Retry-After: 60` header.
   - **Concurrency Control:** Added active request tracking limiting concurrent active API requests to 15 max. Excess requests receive HTTP `503 Service Unavailable`.
5. **Configurable CORS Middleware (`server/app.js`):**
   Added optional CORS origin matching via the `ALLOWED_ORIGINS` environment variable. Defaults to strict same-origin handling when unset, avoiding broad `Access-Control-Allow-Origin: *` wildcard exposure.

---

## 3. Files Modified

- `server/app.js`: Restricted `serveStatic`, remediated SSRF in `isAllowedUrl`, added IP rate limiting, body size enforcement (64 KB limit), concurrency tracking, and `ALLOWED_ORIGINS` CORS headers.
- `src/instagram.js`: Added scheme validation (`http:`/`https:`) in `normalizeInstagramUrl`.
- `src/youtube.js`: Added scheme validation (`http:`/`https:`) in `normalizeYoutubeUrl`.
- `src/x.js`: Added scheme validation (`http:`/`https:`) in `normalizeXUrl`.
- `test/server.test.js`: Updated existing proxy test and added new tests for static isolation, SSRF prevention, URL validation, body payload limits, rate limiting, and CORS.

---

## 4. Tests Added/Changed

- Updated `GET /api/download/file proxies media stream with content-disposition header for permitted domain` to test against a permitted external domain URL.
- Added `Static file serving isolates public frontend assets and blocks internal project files`: Verifies `/index.html` and `/src/styles.css` return 200, while `/server/app.js`, `/package.json`, `/test/server.test.js`, `/.git/config`, and path traversal attempts (`/src/../server/app.js`) return 403.
- Added `SSRF prevention blocks internal loopback, private IP, and arbitrary domain targets`: Verifies `localhost`, `127.0.0.1`, AWS metadata IP (`169.254.169.254`), `ftp://` scheme, and arbitrary external domains return 403.
- Added `URL validation rejects non-HTTP/HTTPS protocols across endpoints`: Verifies `file://` and `javascript:` URLs return 400.
- Added `Rejects oversized request body payloads with 413 Payload Too Large`: Verifies > 64 KB JSON body payloads return 413.
- Added `Enforces rate limiting on API endpoints with 429 Too Many Requests`: Verifies 60 allowed requests per IP, followed by 429 on request 61.
- Added `Enforces CORS when ALLOWED_ORIGINS environment variable is set`: Verifies matching origins receive CORS headers and preflight `OPTIONS` returns 204.

---

## 5. Test Results

Ran native Node test runner (`npm test`):
```text
TAP version 13
# tests 28
# pass 28
# fail 0
# cancelled 0
# skipped 0
# todo 0
```
All 28 unit and integration tests passed cleanly.

---

## 6. Any Remaining Security Risks

- **In-Memory Rate Limiting:** Rate limiting state is currently stored in Node process memory (`Map`). In a multi-instance production deployment, rate limits will be per-instance rather than global. (Can be upgraded to Redis in future if necessary).
- **Mock/Sample File Proxy Streaming:** Media URLs currently point to static sample media files. When real `yt-dlp` extraction is connected, stream size and extraction timeouts will require careful job management.

---

## 7. Anything That Should Wait for the yt-dlp/Render Phase

- Integrating `yt-dlp` binary execution via `child_process.execFile` or `spawn`.
- FFmpeg binary integration for audio/video stream merging.
- Asynchronous extraction job queues (`/api/download/jobs`) and progress tracking for long downloads.
- Creating the `Dockerfile` and configuring container build/environment settings on Render.

---

## 8. Confirmation That Render Was NOT Configured or Deployed

- **Confirmed:** Render was **NOT** configured, created, or deployed in this phase. No Render service or environment was altered.

---

## 9. Confirmation That yt-dlp and FFmpeg Were NOT Integrated in This Phase

- **Confirmed:** Neither `yt-dlp` nor `FFmpeg` was installed, referenced, spawned, or integrated in this phase.
