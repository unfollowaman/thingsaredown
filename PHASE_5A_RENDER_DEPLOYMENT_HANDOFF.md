# Render Deployment Handoff Report — Phase 5A

**Project:** Things Are Down (Cross-Platform Media Downloader)
**Date:** August 26, 2026
**Status:** Repository Ready for Manual Render Deployment
**Target Architecture:** Single Render Web Service (Docker Runtime) serving Frontend + Node.js Native HTTP Backend + Async Job Downloader (`yt-dlp` / `FFmpeg` / `Deno`)

---

## 1. Current Deployment Readiness

The codebase is 100% prepared for production deployment.
- **Architecture:** Monolithic native Node.js HTTP server (`server/app.js` and `server/index.js`) serving static frontend assets (`index.html` and `/src/*`) while exposing RESTful JSON API endpoints for asynchronous media downloading.
- **Async Job Workflow:** Media extraction and downloading run in background jobs managed in-memory with status polling and job cancellation.
- **Test Suite:** 32/32 automated tests passing (`npm test`).
- **Required Code Changes Prior to Deployment:** **0 (None)**. The repository is ready as-is.

---

## 2. Docker Verification

The Docker container setup (`Dockerfile`) has been verified and confirmed suitable for deployment on Render:
- **Base Image:** `node:20-bookworm-slim` (Debian Bookworm base providing glibc and modern toolchain).
- **Installed Runtimes & Dependencies:**
  - **Node.js:** `v20.x`
  - **Python 3:** `python3`, `python3-pip` (required by `yt-dlp`)
  - **FFmpeg:** Installed via `apt-get` (for audio extraction and video stream merging)
  - **Deno:** Installed to `/usr/local/bin/deno` with executable permissions (required by `yt-dlp` EJS JavaScript challenge solving)
  - **yt-dlp:** Standalone binary downloaded to `/usr/local/bin/yt-dlp` with executable permissions
- **Executable Path Auto-Discovery:** `server/downloader.js` automatically searches system PATH (`/usr/local/bin`, `/usr/bin`, `/bin`) and env vars (`YTDLP_PATH`, `FFMPEG_PATH`), resolving system binaries seamlessly.
- **Network & Host Binding:** `server/index.js` listens on `0.0.0.0` across all interfaces and dynamically respects `process.env.PORT`.
- **Temporary File Storage:** Downloaded media fragments and completed files are written to `/tmp/things-are-down-downloads` with UUID tokens and 15-minute TTL cleanup.
- **.dockerignore:** Properly excludes `node_modules`, `.git`, `.env`, build artifacts, and local temporary files.

---

## 3. Render Service Type

- **Service Type:** **Web Service**
- *Reasoning:* The application serves HTTP traffic (both static assets and API requests) continuously on a public URL.

---

## 4. Render Runtime

- **Runtime Environment:** **Docker**
- *Reasoning:* The service requires system binaries (`yt-dlp`, `ffmpeg`, `deno`, `python3`) alongside Node.js. Running the Docker image guarantees all dependencies are pre-installed.

---

## 5. Root Directory

- **Root Directory:** `.` (or leave blank for root of repository)

---

## 6. Dockerfile Path

- **Dockerfile Path:** `./Dockerfile` (or `Dockerfile`)

---

## 7. Port Configuration

- **Port Handling:** Render automatically assigns a dynamic port (e.g. `10000`) and injects it into the container via the `PORT` environment variable.
- `server/index.js` reads `process.env.PORT` (falling back to `5173` locally) and binds to `0.0.0.0`.
- No hardcoded ports need to be configured on Render.

---

## 8. Health-Check Path

- **Health Check Path:** `/`
- *Reasoning:* `GET /` returns `HTTP 200 OK` with `index.html`. It validates that the Node.js HTTP server is active and serving requests.

---

## 9. Required Environment Variables

None of the required environment variables need secrets or complex setup.

| Variable Name | Required? | Value to Enter | Why |
| --- | --- | --- | --- |
| `NODE_ENV` | Yes | `production` | Sets Node.js environment mode for optimal performance. |

---

## 10. Optional Environment Variables

| Variable Name | Required? | Value to Enter | Why |
| --- | --- | --- | --- |
| `ALLOWED_ORIGINS` | Optional | `https://your-custom-domain.com` | CSV list of origins if frontend is hosted on a separate external domain. Not needed for single-service setup. |

---

## 11. Variables That Should NOT Be Manually Configured

The following environment variables should **NOT** be created in the Render dashboard:

- `PORT`: Automatically managed and injected by Render.
- `YTDLP_PATH`: Handled inside Docker image (`/usr/local/bin/yt-dlp`).
- `FFMPEG_PATH`: Handled inside Docker image (`/usr/bin/ffmpeg`).

---

## 12. Render Dashboard Setup Steps

Follow these exact steps in your Render Dashboard:

1. Log into your **Render Account** (https://dashboard.render.com).
2. Click **New +** and select **Web Service**.
3. Choose **Build and deploy from a Git repository**.
4. Connect your GitHub account (if not already connected) and select the `Things Are Down` repository.
5. In the service configuration form:
   - **Name:** `things-are-down` (or your preferred service name)
   - **Language / Runtime:** `Docker`
   - **Region:** Choose the region closest to you (e.g. `Oregon (US West)` or `Frankfurt (EU)`).
   - **Branch:** `main` (or your active deployment branch)
   - **Root Directory:** `.` (leave default)
   - **Dockerfile Path:** `./Dockerfile` (leave default)
6. **Instance Type / Plan:** Select **Free** (or **Starter** for dedicated CPU/RAM).
7. Scroll to **Environment Variables** and click **Add Environment Variable**:
   - Key: `NODE_ENV`, Value: `production`
8. Under **Advanced** settings:
   - **Health Check Path:** `/`
9. Click **Create Web Service**.
10. Wait for the Docker image build to complete and the service status to show **Live**.

---

## 13. Plan & Instance Considerations

- **Free Tier:** Render Free Web Services automatically spin down after 15 minutes of inactivity and take ~30 seconds to wake on the next request. In-memory jobs and temp files in `/tmp` are wiped when the instance sleeps or restarts.
- **Starter Tier ($7/mo):** Keeps the container continuously running, preventing cold-start delays.

---

## 14. Post-Deployment Verification Checklist

Once Render provides your public URL (e.g., `https://things-are-down.onrender.com`), verify functionality across all categories:

### Basic Functionality
- [ ] Open the Render URL in a web browser; verify the page loads cleanly (`HTTP 200 OK`).
- [ ] Verify HTTPS is active and green lock icon is present.
- [ ] Inspect Developer Console (F12) network tab to confirm no `localhost` or development URLs are requested.
- [ ] Verify API endpoints are responsive.

### Downloader & Platforms
- [ ] **YouTube:** Paste a public YouTube video link; verify title, duration, and thumbnail preview appear.
- [ ] **Instagram:** Paste a public Instagram Reel link; verify media details load.
- [ ] **X / Twitter:** Paste a public X video post link; verify metadata loads.

### Async Download Jobs
- [ ] Click Download on a link; verify `HTTP 202 Accepted` response with a job ID.
- [ ] Observe progress bar update (`extracting` -> `downloading` -> `processing` -> `completed`).
- [ ] Click the generated download link; verify file saves cleanly to local device.
- [ ] Test cancelling an active download job; verify status updates to `cancelled`.

### Security Protections
- [ ] Attempt to access `https://<render-url>/server/app.js` -> Verify `HTTP 403 Forbidden`.
- [ ] Attempt to access `https://<render-url>/package.json` -> Verify `HTTP 403 Forbidden`.
- [ ] Attempt SSRF by passing `http://127.0.0.1` or `http://169.254.169.254` to API -> Verify request is blocked.
- [ ] Submit invalid URLs -> Verify safe `HTTP 400` / `422` JSON error responses.

### Mobile Device
- [ ] Open the Render URL on a mobile device (iOS Safari or Android Chrome).
- [ ] Submit a media URL and start download.
- [ ] Confirm file downloads into mobile browser / Downloads folder.

---

## 15. Known Risks & Platform Limitations

1. **In-Memory State & Ephemeral Disk:** Job state and `/tmp` files are held in RAM / local ephemeral disk. Service restarts or Render sleep cycles will clear active jobs.
2. **Instagram / X Rate Limits:** High volume requests from shared datacenter IP ranges may occasionally trigger platform rate limits or login challenges.
3. **YouTube Datacenter IP Restrictions (SABR / GVS PO Tokens):** Detailed in Section 16 below.

---

## 16. YouTube Datacenter IP Testing Instructions

YouTube actively blocks direct video stream fragment downloads coming from known datacenter IP ranges (AWS, Render, DigitalOcean, GCP) unless Proof-of-Origin (PO) tokens or cookies are supplied.

### How to Test After Deployment:
1. Paste a public YouTube URL (e.g. `https://www.youtube.com/watch?v=aqz-KE-bpKQ`) into the deployed Render website.
2. Observe metadata extraction:
   - If title, thumbnail, and duration load: **Metadata extraction works!**
3. Start the video download job:
   - If download completes successfully: **Render IP range is unblocked!**
   - If download fails at `0%` or returns `HTTP 403 Forbidden` from YouTube: **YouTube datacenter IP restriction is active.**

*Note:* Do NOT attempt to fix this preemptively with cookies or proxy services before verifying actual deployment behavior on Render. If 403 errors occur, we will diagnose it as a separate task.

---

## 17. Anything That Must Be Changed Before Deployment

**None.** No code, configuration, or environment changes are required before manual deployment to Render.

---

## 18. Agent Confirmation

**Confirmation:** Jules did **NOT** attempt to access, create, authenticate into, or modify any Render account. All Render setup actions must be executed manually by the human operator using the steps above.
