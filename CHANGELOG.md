# Changelog

All notable changes to this project are documented here.

## [Updated] — Backend infrastructure rewrite + frontend fixes

### Changed

- **Replaced `youtube-transcript` with `youtube-transcript-plus`** — addresses broken API compatibility that caused "transcript not available" on many videos.
- **Added `.env` configuration** — `PORT`, `LM_STUDIO_URL`, `LM_STUDIO_MODEL`, `CACHE_TTL_MINUTES` all configurable via environment variables.
- **Added `LM Studio health check`** — `/api/lm-status` endpoint; `/api/health` now includes LM Studio connection status and model name.
- **Added in-memory cache** — transcript fetches and reconstructions cached with TTL (default 60 min), keyed by video ID and snippet hash.
- **Replaced `cleanReasoningOutput()` regex hack** — structured JSON output (`{"output": "..."}`) from LM Studio; removed 35 lines of brittle regex.
- **Added production static serving** — Express now serves `client/dist/` and handles SPA routing in production.
- **Improved error handling** — 503 if LM Studio unreachable; 502 on LM error; `AbortSignal.timeout(120s)` on reconstruction fetch.
- **Fixed SRT end timestamps** — uses next segment start instead of `start + duration` to prevent overlap.
- **Deduplicated CSS** — removed duplicate rules for `.reset-button`, `.export-bar`, `.empty-state`, `.video-info`.
- **Fixed timestamp field mapping** — `youtube-transcript-plus` returns `offset` not `start` in segment objects.

### Fixed

- Core transcription pipeline now works reliably with `youtube-transcript-plus` v2.
- LM Studio integration is observable and debuggable.
- Production build output is now served by Express.

### Known Issues (remaining)

- No `.gitignore` present — `.env` and `node_modules` should be ignored.
- No error boundaries in React.
- No video thumbnail / metadata beyond title.

---

## [Unreleased] — Initial development

### Added

- **YouTube transcript extraction** — `/api/transcript` endpoint using `youtube-transcript` npm package; parses video URL (watch, embed, shorts formats), returns snippets with timestamps and full text.
- **AI reconstruction endpoint** — `/api/reconstruct` POST sends fragmented transcript snippets to LM Studio (`qwen3.6-35b-a3b-mlx-nvfp4`) for merging into readable paragraphs.
- **`cleanReasoningOutput()`** — strips thinking-process markers from qwen's `reasoning_content` output (regex-based cleanup of numbered steps, bullet points, partial sentences).
- **React frontend** — dark-themed UI with URL input, timestamped transcript panel (hover/click highlight), AI-reconstructed text panel (with copy button and paragraph/character counts), export buttons (TXT, SRT).
- **Export to TXT / SRT** — client-side blob download for plain text and subtitle formats.
- **macOS LaunchAgent management** — `manage.sh` for start/stop/restart/status via `launchctl`; `start.sh` for foreground development.
- **Tailcale networking** — server binds to `0.0.0.0`, accessible at `100.127.3.65:4000` (API) and `100.127.3.65:3000` (frontend).

### Changed

- None — initial project scaffold.

### Fixed

- None — initial project scaffold.

---

## What didn't work (and needs fixing)

### 1. `youtube-transcript` package is broken for many videos

The npm package `youtube-transcript` (v1.2.1) is unmaintained and fails against YouTube's current API. Videos with working captions often return "transcript not available" or throw errors. This is the **single biggest blocker** — without reliable transcript fetching, the rest of the pipeline is useless.

**What needs to happen:**
- Replace with a maintained library (`youtubei.js` / `ytpl`-style approach, or parse YouTube's `captions.ttml` endpoint directly).
- Add fallback: if the primary library fails, try an alternative method (e.g., scraping the captions URL from page source).
- Add a video-level "test" — check if captions are available before attempting to fetch.

### 2. LM Studio integration is fragile and opaque

The `/api/reconstruct` endpoint assumes:
- LM Studio is running at exactly `localhost:1234`.
- The model `qwen3.6-35b-a3b-mlx-nvfp4` is loaded.
- The model outputs to `reasoning_content` (not `content`).

If any of these assumptions fail, the user sees a generic 502 error with no guidance on what went wrong.

**What needs to happen:**
- Add `/api/health` for LM Studio (or a new endpoint) so the frontend can show "LM Studio connected" / "LM Studio not reachable".
- Make `LM_STUDIO_URL` configurable via `.env`.
- Improve error messages — distinguish between "LM Studio not running", "model not loaded", and "response empty".
- Add a timeout to prevent hanging requests.

### 3. `cleanReasoningOutput()` is a regex hack

The cleanup function uses brittle regex patterns to strip thinking-process markers from qwen's output. Different model versions, different temperatures, and even different prompts produce different output formats. This approach will break as soon as the model changes its thinking format.

**What needs to happen:**
- Use a structured response: ask the model to output JSON with an explicit `output` field.
- Or switch to a non-reasoning model variant for this task (reasoning is unnecessary for text reconstruction).
- Or use a dedicated prompt format that avoids thinking entirely (e.g., system prompt with `Do not think aloud, output only the result`).

### 4. No caching — every request hits YouTube fresh

There is no caching layer. The same video URL fetched twice triggers two full transcript extractions, two LLM calls (if reconstructed), and two title fetches.

**What needs to happen:**
- Add in-memory cache (Map by video ID) with TTL (e.g., 1 hour).
- Or file-based cache under `.cache/` for persistence across restarts.

### 5. Build output is not served

`npm run build` in the client directory produces a `dist/` folder, but the Express server does not serve it. There is no production mode — only `npm start` which runs the API server without the frontend.

**What needs to happen:**
- Add `app.use(express.static(path.join(__dirname, 'client/dist')))` in production.
- Add a catch-all route for SPA routing: `app.get('*', (req, res) => res.sendFile(...))`.
- Or configure a proper deployment target (Vercel, Railway, etc.).

### 6. No environment configuration

All configuration is hardcoded in `server.js`:
- `PORT = 4000`
- `LM_STUDIO_URL = 'http://localhost:1234'`
- Model name `qwen3.6-35b-a3b-mlx-nvfp4`
- LM Studio port hardcoded in the frontend proxy config

**What needs to happen:**
- Add `.env` support via `dotenv`.
- Move all magic strings to env vars or a config object.

### 7. CSS has duplicate rules

`client/src/styles/main.css` contains duplicate definitions for `.reset-button`, `.export-bar`, `.empty-state`, and `.video-info`. The second definitions override the first, but this is accidental and confusing.

**What needs to happen:**
- Deduplicate the CSS file — remove the first set of definitions for each duplicated class.

---

## Priority summary (what to tackle next)

| Priority | Issue | Impact |
|---|---|---|
| **P0** | Replace `youtube-transcript` with working alternative | Core functionality broken for many videos |
| **P0** | Add LM Studio health check + better errors | User can't diagnose failures |
| **P1** | Fix `cleanReasoningOutput()` — use structured output or non-reasoning model | Fragile regex will break on model update |
| **P1** | Add caching (in-memory or file-based) | Prevents redundant API calls, saves LLM tokens |
| **P2** | Serve built frontend in production | `npm run build` produces dead output |
| **P2** | Add `.env` configuration | Hardcoded values block deployment |
| **P3** | Deduplicate CSS | Code quality |
