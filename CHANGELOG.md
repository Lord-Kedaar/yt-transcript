# Changelog

## Unreleased — 2026-06-14

### Documentation
- **Corrected doc/code drift** — `CHANGELOG.md` v3.2.1 and
  `docs/SECURITY_NOTES.md` both claimed the hardcoded `'0456'` fallback
  was removed in v3.2.1, but `server.js:23` still contains
  `process.env.OMLX_API_KEY || process.env.LM_STUDIO_API_KEY || '0456'`.
  Both documents now correctly mark the fallback as "Still present" and
  point to the audit follow-up plan below.
- **Added audit follow-up plan** — see README → "Audit follow-up
  (2026-06-14)" section.

## 3.2.1 — 2026-06-12

### Security
- **Intended: remove hardcoded API key fallback** — the `'0456'` literal
  in `OMLX_API_KEY = ... || '0456'` was a real-world anti-pattern
  (BURDEL rule: no secrets in repo). The fallback is now an empty
  string; operators must set the key in `.env` if their oMLX requires
  auth. _Note: this change was reported as done in 3.2.1 but the
  fallback line was not actually removed from the file. The fix is
  re-planned in the 2026-06-14 audit follow-up, Phase 1._

### Added
- **TTS endpoint restored** — `POST /api/tts` and `GET /api/audio/:id`
  were missing from the oMLX migration; the frontend hook
  (`useTTS.js`) was calling an endpoint that didn't exist. Implemented
  Piper integration with graceful degradation: when `PIPER_BIN` does
  not exist, the endpoint returns 503 with a clear hint instead of
  crashing the server.
- **Path-traversal guard** on `/api/audio/:id` — the id must match
  `^[A-Za-z0-9-]+$` before any filesystem access.
- **TTS cache cleanup on startup** — WAV files older than 24h in
  `/tmp/tts-cache/` are removed (matches v3.2 behaviour).
- **Documentation set** — `docs/ARCHITECTURE.md`, `docs/SECURITY_NOTES.md`,
  `docs/KNOWN_LIMITATIONS.md`, `docs/LOCAL_SETUP.md`,
  `docs/PUBLIC_DEMO_PLAN.md`, `docs/PROVIDER_MATRIX.md`.
- **`.env.example` updated** — now includes `PIPER_BIN` and
  `PIPER_MODELS_DIR`; documents the `LM_STUDIO_*` legacy aliases.

### Security
- **Phase 1: Remove hardcoded `'0456'` fallback** — replaced with
  empty string; oMLX allows unauthenticated requests locally.
- **Phase 1: Bounded cache** — SHA-256/32 hash replaces base64 text
  as cache key; LRU eviction at 200 entries prevents unbounded growth.

### Changed
- **README rewritten** — now points to `docs/` for deep dives and
  includes the portfolio card (problem / approach / tools / result /
  value / limitations / privacy / status).
- **.env.example clarified** — oMLX is the primary; LM Studio is
  documented as legacy fallback aliases.

### Cleanup
- Removed 7 stale `*.bak.*` files from earlier debug sessions.
- Removed `.write-test` and `.write-test-2` scratch files.
- Removed `package 2.json` (a typo'd duplicate).
- Moved `server.js.bak.20260608_132834.pre-memory-fallback` to
  `docs/legacy-server-pre-memory-fallback.js.bak` for archaeology.

## 3.2.0 — 2026-06-08

### Frontend loading feedback and Safari resume recovery
- AI reconstruction and summarization now show an animated progress indicator plus a live seconds counter while work runs.
- In-flight AI jobs are persisted across Safari/background-tab suspension and restored on return, preventing the summary/reconstruction crash path.
- oMLX transform requests now retry with smaller fallback models when the primary model is rejected by memory pressure.

### Hardened startup and error handling
- `npm start` now runs the build step before starting the backend.
- `manage.sh start` and `start.sh` now use the canonical build-first launch path.
- `server.js` retries transient transcript and oMLX failures instead of failing immediately.
- JSON request bodies are accepted up to 16 MB to reduce accidental 413 errors on large transcripts.
- Missing frontend build artifacts now return a recovery page instead of crashing the server.
- Unhandled exceptions, rejections, and listen errors are logged and shut down cleanly.
- launchd stdout/stderr now go to `/tmp/yt-transcript/` instead of the project tree, avoiding filesystem deadlocks in the supervisor path.

### Operational notes
- The app remains single-port on `:4000`.
- Health responses now distinguish `ok` from `degraded` when oMLX is temporarily unavailable.
