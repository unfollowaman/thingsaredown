# Things Are Down

Things Are Down is a website prototype for downloading content from YouTube, X/Twitter, Telegram, and Instagram.

## Instagram downloader implementation plan

1. **Backend API**
   - Add a server route that receives Instagram download requests.
   - Validate JSON input and return structured JSON errors.
   - Keep static app hosting and API hosting on the same origin so the browser can call `/api/download/instagram`.

2. **Instagram URL normalization**
   - Accept only Instagram hosts.
   - Normalize supported URL shapes for posts, Reels, videos, and stories.
   - Return clear user-facing errors for profile URLs, unsupported paths, invalid URLs, and missing media identifiers.

3. **Media metadata extraction**
   - Connect the API to a compliant Instagram media extraction provider or first-party ingestion service.
   - Resolve canonical metadata such as media type, title/caption, thumbnail, duration, and available formats.
   - Handle multi-item carousel posts before exposing download choices.

4. **Frontend integration**
   - Replace the prototype-only download animation with a real API request.
   - Show states for preparing, extractor setup needed, ready, failed, and complete.
   - Send the selected quality with each download request.

5. **Download delivery**
   - Return a temporary download URL when extraction can safely expose one, or stream the file through the backend.
   - Set download filenames and content types.
   - Add expiry and rate-limit protections before exposing generated files.

6. **Error handling**
   - Handle private posts, login-required stories, removed media, bad URLs, provider failures, and rate limits.
   - Keep errors specific enough for users without exposing backend internals.

7. **Tests**
   - Cover URL parser success/failure cases.
   - Cover API success/failure responses.
   - Add integration tests around the browser flow once a real extractor is connected.

## Current Instagram status

The repository now has the first implementation layer for Instagram downloads:

- `/api/download/instagram` accepts validated Instagram requests and returns normalized pending metadata.
- The browser download button calls the API for Instagram URLs instead of only running a local fake completion.
- URL normalization and API behavior have automated Node tests.

The real extractor and file delivery pieces are still intentionally pending because they require choosing and configuring a compliant media extraction provider or first-party ingestion strategy.

## X/Twitter downloader implementation plan

1. **URL detection and normalization**
   - Accept direct `x.com` and `twitter.com` status URLs.
   - Normalize legacy Twitter hosts to canonical `https://x.com/{user}/status/{id}` URLs.
   - Reject profiles, search/explore pages, invalid hosts, and missing or non-numeric status IDs.

2. **Backend API**
   - Add `/api/download/x` so the browser can prepare X/Twitter downloads without passing through the Instagram-only endpoint.
   - Return structured JSON errors for invalid input and pending metadata while extractor setup is incomplete.

3. **Frontend integration**
   - Detect valid X/Twitter status URLs with the same parser used by the backend.
   - Dispatch each supported platform to its own API endpoint.
   - Keep unsupported platforms, such as YouTube and Telegram, in clear setup-needed states instead of sending them to the wrong endpoint.
   - Render preparing, extractor setup required, ready, failed, and complete states from API payloads.

4. **Media metadata extraction**
   - Connect `/api/download/x` to a compliant X/Twitter media extraction provider or first-party ingestion service.
   - Resolve tweet text/title, thumbnail, duration, variants, dimensions, bitrate, and media type.
   - Handle tweets with multiple media items before exposing format choices.

5. **Download delivery**
   - Return a temporary download URL when provider terms and media permissions allow it, or stream the selected variant through the backend.
   - Add safe filenames, content types, expiry, rate limiting, and provider-failure handling.

6. **Tests**
   - Cover parser success and failure cases for `x.com` and `twitter.com`.
   - Cover API success and failure responses.
   - Add browser-flow tests once a real extractor is connected.

## Current X/Twitter status

The repository now has the first implementation layer for X/Twitter downloads:

- `/api/download/x` accepts validated X/Twitter status requests and returns normalized pending metadata.
- The browser download button routes X/Twitter links to the X/Twitter endpoint instead of failing through the Instagram-only path.
- URL normalization and API behavior have automated Node tests.

The real extractor and file delivery pieces are still intentionally pending because they require choosing and configuring a compliant X/Twitter media extraction provider or first-party ingestion strategy.
