# Changelog

## [2026-05-21] — Summary intro paragraph + markdown emphasis + multi-format save

### Added

- **Wstępny akapit w podsumowaniu** — każdy summary zaczyna się 3-5 zdaniowym wprowadzeniem identyfikującym autora/speaker i temat wideo.
- **Menu eksportu Save** — dropdown z 3 opcjami: 💾 TXT, 📝 MD, 📄 PDF.
- **PDF export** — renderowanie panelu (reconstructed/summary) do canvas via `html2canvas`, potem do PDF via `jspdf`.
- **Markdown emphasis natively rendered** — frontend `parseInlineMarkdown()` konwertuje `**text**` → `<strong>`, `*text*` → `<em>`.
- **CSS `.summary-intro`** — wyróżniony wstęp akapitu kolorowym lewym borderem.

### Changed

- **Prompt summarize** — wymusza wstępny akapit + bullet points z markdown.
- **Prompt reconstruct** — userSuffix wymaga identyfikacji speakera + wprowadzenia.
- **SummaryPanel** — rozdziela intro od bullets, renderuje osobno.
- **ReconstructedPanel + SummaryPanel Save** — dropdown menu zamiast bezpośredniego downloadu.

### Dependencies

- `jspdf` + `html2canvas` — generowanie PDF z frontendu.

---

## [2026-05-21] — Model swap to qwen3.5-9b-mlx-lm-nvfp4 + markdown rendering + Polish enforcement

### Changed

- **Model:** `bielik-11b-v3.0-mlx` → `qwen3.5-9b-mlx-lm-nvfp4` (faster, cleaner output, better prompt obedience).
- **Prompts now allow markdown** — system prompt encourages `**bold**` and `*italic*` for emphasis.
- **SummaryPanel renders markdown inline** — `parseInlineMarkdown()` converts `**text**` → `<strong>`, `*text*` → `<em>`.
- **Smaller button fonts** — `.reconstruct-button` / `.summarize-button` reduced from `0.875rem` → `0.8rem`, mobile breakpoint `0.85rem` → `0.75rem`.
- **Stronger Polish translation enforcement** — `summarize` system prompt explicitly states `ALL output MUST be in Polish`. Reconstruct adds tail instruction when translate mode is active.

### Fixed

- **Inconsistent Polish output from bielik** — qwen translates reliably in both reconstruct and summarize modes.
- **Markdown bold appearing as plain text** — now rendered as styled `<strong>` / `<em>` in the UI.

---

All notable changes to this project are documented here.

## [2026-05-19] — LLM prompt echo + markdown cleanup in summaries

### Fixed

- **LLM echo prompt in summary output** — model reproduced fragments of the system prompt as bullets. Shortened system prompt from 17 lines to 7 lines and moved format constraints (`"each bullet starts with - "`) to `userPrompt` tail for stronger anchoring.
- **Markdown bold leaking into UI** — model wrapped bullet titles in `**text**`. Added prompt rule `"Do NOT use markdown bold (**) or headers"`.
- **Defensive frontend strip** — `SummaryPanel.jsx` now strips `**bold**` and `## headers` via regex post-processing as safety net.

### Changed

- Summarize prompt structure: system → short role definition, userPrompt → raw text + explicit format tail.

---

## [2026-05-19] — Single-port deployment: Express serves SPA + API on :4000

### Changed

- **Eliminated dual-port development setup** — previously frontend ran on Vite dev server (`:3000`) proxying to Express backend (`:4000`). Now Express on `:4000` serves both the static SPA (`client/dist/`) and the API.
- **Rewrote `manage.sh`** — simplified from dual-process (backend + frontend) to single-process launcher. No PID tracking for two services.
- **Rewrote `start.sh`** — builds `client/dist/` via `npm run build`, then launches Express in foreground.
- **Updated `server.js` console output** — removed hardcoded `:3000` references from startup log.
- **Updated `README.md`** — single-port architecture diagram, unified "Development vs Production" section, removed all references to port `:3000`.

### Removed

- **Vite dev server (`:3000`)** no longer used. After any frontend change, run `cd client && npm run build`, then refresh the browser.
- **Dual-process `manage.sh`** complexity eliminated.

---

## [2026-05-19] — API refactor: unified /api/transform endpoint

### Changed

- **Merged `/api/reconstruct` + `/api/summarize` into `/api/transform`** — single unified `POST /api/transform` endpoint accepting `{snippets, type, mode}` where `type` is `"reconstruct" | "summarize"`.
- **De-duplicated backend code** — replaced two near-identical 180-line handlers with one configurable handler + shared prompt library (`TRANSFORM_PROMPTS`).
- **De-duplicated frontend state** — replaced `reconstructing/summarizing`, `reconstructProgress/summaryProgress`, `reconstructedText/summaryText`, and separate `handleReconstruct`/`handleSummarize` functions with unified `aiLoading`, `aiProgress`, `handleTransform()`, and derived `isReconstructing`/`isSummarizing` flags.
- **Shared reasoning cleanup** — extracted regex strip patterns into `REASONING_STRIP_PATTERNS` constant array; applied to both reconstruct and summarize output.
- **Cache key unified** — single `${type}:base64hash` pattern instead of separate `reconstruct:` / `summarize:` prefixes.

### Removed

- **Old endpoints** — `/api/reconstruct` and `/api/summarize` removed. Single-user project; backward compatibility broken intentionally. All frontend traffic now routes to `/api/transform`.
- **88 lines net deleted** (243 removed, 155 added) across `server.js` + `App.jsx`.

---

## [2026-05-19] — UI fixes: New Transcript position + AI button font size

### Fixed

- **"New Transcript" button moved from panels to top-level** — previously hidden inside `ReconstructedPanel` and `SummaryPanel`, making it unreachable when those panels were not yet rendered. Now placed above the video title as a subtle `.reset-bar` with `.reset-app-button`.
- **Removed duplicate reset buttons from panels** — `ReconstructedPanel.jsx` and `SummaryPanel.jsx` no longer include `onReset` prop or the old `.reset-panel-button`. Clean state reset still handled by `App.jsx` `handleReset()` with `AbortController` cancellation.

### Changed

- **AI button font size reduced** — `.reconstruct-button` and `.summarize-button` changed from `font-size: 1rem` to `0.875rem` for visual consistency with surrounding UI.

---

## [2026-05-18] — Language Choice Modal + AbortController + New Transcript

### Added

- **Language Choice Modal** — clicking "Reconstruct with AI" or "Summarize with AI" now opens a modal with two options:
  - **"Keep original language"** — reconstruct/summarize in the transcript's native language.
  - **"Translate to Polish"** — reconstruct/summarize and translate output into Polish via LLM.
  - Backend endpoints `/api/reconstruct` and `/api/summarize` accept optional `mode` field (`'original' | 'translate'`).
  - Polish translation instruction appended to system prompt: "Translate the entire reconstructed text into Polish (język polski)."

- **AbortController for AI requests** — clicking "New Transcript" (formerly "New Search") now cancels any in-flight `reconstruct` or `summarize` HTTP requests, stops progress timers, and resets state cleanly.
  - Added `reconstructAbortRef` and `summarizeAbortRef` refs holding `AbortController` instances.
  - `handleReset()` now aborts pending requests and resets UI state to idle.
  - Both `reconstruct` and `summarize` handlers create new `AbortController` per call and detect `AbortError`.

### Changed

- **"New Search" → "New Transcript"** — renamed button title and label in `ReconstructedPanel` and `SummaryPanel`.
- **Grid fix** — `grid-template-columns: 1fr 1fr` → `minmax(0, 1fr) minmax(0, 1fr)` in `.action-buttons` to prevent button overflow.

---

## [2026-05-18] — Summarize endpoint + prompt v3.0

### Added

- **`/api/summarize` endpoint** — generates comprehensive, detailed bullet-point summaries from transcript snippets using LM Studio.
  - Model: `bielik-11b-v3.0-mlx` (32K context, local).
  - Prompt v3.0: comprehensive, detailed coverage of ALL major themes with substantive 2-3 sentence bullets (~30-50 words each).
  - `max_tokens: 32768`, `timeout: 1800s` for long transcripts.

### Changed

- **Summarize prompt v3.0** — removed rigid "Minimum 8 / Maximum 15" fake constraint (Bielik 11B did not respect it). Replaced with quality-first instruction: "Do NOT be brief or stop early — every significant thread deserves its own substantive bullet."
- **Summarize `max_tokens`** — `8192 → 32768` (full model capacity).
- **Summarize `timeout`** — `900000ms → 1800000ms` (30 min, scales linearly with token budget).

---

## [2026-05-18] — Emergency stability fixes

### Fixed

- **Reconstruct timeout for long videos** — `youtube-transcript-plus` returns ~700 snippets for 20-minute videos; sending all 700 to `qwen3.6-35b-a3b-mlx-nvfp4` in one prompt causes 30+ minute inference and `AbortSignal.timeout(120s)` error (`curl rc=28`).
  - Backend now caps snippets at **300** before sending to LM Studio (still covers ~10–15 min of speech).
  - Backend timeout bumped from **120s → 600s** (10 min) to accommodate slow local inference.
  - Result: URL `https://youtu.be/hGnn05ccwNc` (Hermes Agent) now reconstructs in ~156s instead of crashing.
- **Frontend error UX during reconstruct** — added live countdown timer (`AI reconstructing... (42s)`) so users know the process is running, not hung. Previous "Could not connect to LM Studio" error was stale from prior timeout, not actual LM failure.
- **Clear stale errors** — clicking "Reconstruct with AI" now clears old error banner before starting new request.
- **Reconstruct crashes on Unicode/emoji** — `btoa()` in cache key threw `InvalidCharacterError` when transcript text contained emojis (e.g. "🤯" in video title). This error was caught by `catch(err)` and replaced with misleading "Could not connect to LM Studio." message. Fixed by switching to `Buffer.from(text).toString('base64')` which handles UTF-8 correctly.
- **Reconstruct returns raw markdown code block** — LM Studio occasionally wraps JSON in ```json ... ``` markdown. Backend now strips code fence markers before `JSON.parse()`.
- **Reconstruct empty content from reasoning model** — when LM Studio returns empty `msg.content` but non-empty `msg.reasoning_content`, the backend now falls back to reasoning text and extracts JSON from it.

---

## [2026-05-18] — Copy button fix + reasoning cleanup

### Fixed

- **Copy button in Reconstructed Panel** — `navigator.clipboard.writeText()` fails on HTTP/Tailscale due to browser security requiring secure context (`navigator.clipboard` is `undefined` on insecure origins). Added `document.execCommand('copy')` fallback via invisible `<textarea>` element. Button now works across HTTP, Tailscale, and localhost.
- **Reconstruct output polluted with reasoning metadata** — model `qwen3.6-35b-mlx` in reasoning mode consumed entire `max_tokens: 8192` on internal monologue (8191/8192 = reasoning tokens), leaving ~1 token for output. Result was truncated raw reasoning text full of "*Paragraph N:*", "*Self-Correction:*", "Let's draft it carefully." instead of reconstructed transcript.
  - **Prompt simplification**: removed JSON wrapper from system prompt — model now outputs plain paragraphs directly (smaller reasoning footprint).
  - **Token increase**: `max_tokens: 8192 → 12000`.
  - **Post-processing**: aggressive regex stripping of reasoning meta-commentary ("Here's a thinking process:", "**Analyze User Input:**", "Paragraph N:", "Self-Correction", etc.).
  - **Result**: Hermes Agent video now reconstructs to 11,913 clean characters in ~211s, zero reasoning artifacts.

---

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

## What didn't work (historical — all resolved)

> This section documents the original pain points from the initial scaffold. All have been resolved in subsequent releases above.

### 1. `youtube-transcript` package broken — **RESOLVED**
- **Fix:** Replaced with `youtube-transcript-plus` v2.
- **Where:** See `[Updated] — Backend infrastructure rewrite`.

### 2. LM Studio integration fragile — **RESOLVED**
- **Fix:** Added `/api/health`, `/api/lm-status`, `.env` configuration (`LM_STUDIO_URL`, `LM_STUDIO_MODEL`), `AbortSignal.timeout()`.
- **Where:** See `[Updated] — Backend infrastructure rewrite`.

### 3. `cleanReasoningOutput()` regex hack — **RESOLVED**
- **Fix:** Switched to structured JSON output, then plain text with aggressive meta-commentary stripping.
- **Where:** See `[2026-05-18] — Copy button fix + reasoning cleanup`.

### 4. No caching — **RESOLVED**
- **Fix:** In-memory `Map` cache with TTL (default 60 min) for transcripts and reconstructions.
- **Where:** See `[Updated] — Backend infrastructure rewrite`.

### 5. Build output not served — **RESOLVED**
- **Fix:** `app.use(express.static(...))` + SPA catch-all route in production.
- **Where:** See `[Updated] — Backend infrastructure rewrite`.

### 6. No environment configuration — **RESOLVED**
- **Fix:** `.env` support via `dotenv`, all tunables (PORT, LM_STUDIO_URL, LM_STUDIO_MODEL, CACHE_TTL_MINUTES).
- **Where:** See `[Updated] — Backend infrastructure rewrite`.

### 7. CSS duplicate rules — **RESOLVED**
- **Fix:** Deduplicated `.reset-button`, `.export-bar`, `.empty-state`, `.video-info`.
- **Where:** See `[Updated] — Backend infrastructure rewrite`.

---

## Priority summary (remaining open items)

| Priority | Issue | Impact |
|---|---|---|
| **P2** | No error boundaries in React | App crash on component error |
| **P2** | No video thumbnail / metadata beyond title | Poor UX |
| **P2** | No copy-all for raw transcript | UX gap |
| **P2** | No loading state for reconstruction | User uncertainty |
| **P2** | No keyboard shortcuts | Accessibility |
| **P3** | Dark/light theme toggle | Nice-to-have |
| **P3** | Multi-language support | Nice-to-have |
| **P3** | Shareable links | Nice-to-have |
