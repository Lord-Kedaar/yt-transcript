# Changelog

## 3.3.0 — 2026-06-20

### Providerzy LLM

- **Mistral** — nowy provider, OpenAI-compatible, klucz `MISTRAL_API_KEY`, domyślny model `mistral-small-2603`.
- **Groq** — nowy provider, OpenAI-compatible, klucz `GROQ_API_KEY`, domyślny model `meta-llama/llama-4-scout-17b-16e-instruct` (pinned — `groq/compound` rotuje wewnętrznie i powodował TPM 8000 rate limit). Obsługuje reasoning models (`reasoning_content` fallback gdy `content` puste).
- **Fallback chain** — `LLM_PROVIDER_FALLBACK=mistral` automatycznie przełącza na następnego providera z listy gdy primary ma `health().ok=false`. Aktywny provider jest sticky dopóki sam nie zwróci unhealthy.

### Stabilność

- **Health cache** — `HEALTH_CACHE_TTL_MS=3000` eliminuje flakiness `/api/lm-status` z cold-start dużych modeli (przed: 30% timeoutów przy probe z `model:"auto"`; po: 10/10 ≤ 0.3s).
- **Express-side guard** w `/api/lm-status` — 2s timeout jako defense-in-depth dla cold-start edge cases.
- **`/api/transform` provider-agnostic** — hardcoded `"oMLX is unreachable."` zastąpiony szablonem `${llmProvider.name} is unreachable: ${error}` (poprawka po migracji 2026-06-17, w której zostawiono residualny ref).
- **`build.js` wersja** — czyta `version` z `package.json` zamiast hardcoded `'3.2.0'` (eliminuje drift build-info vs package.json).

### Konfiguracja

- `.env.example` zaktualizowany — sekcje Mistral, Groq, fallback chain, health cache TTL, komentarze z linkami do konsol API.
- FreeLLMAPI env vars nietknięte (z poprzedniej migracji 3.2.1) — dostępne jako opcja, ale **nie w active chain** (cold-start rotacja 8-30s).

---

## 3.2.1 — 2026-06-18

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
- **Phase 2: CORS env-driven** — `CORS_ORIGIN` env var (default `*` dev,
  `https://transcript.radoslaw-pleskot.com` when `NODE_ENV=production`).
- **Phase 2: Rate limiting** — `/api/transform`: 10 req/min per IP;
  `/api/tts`: 5 req/min per IP (new `express-rate-limit` dep).
- **Phase 2: Input length guards** — max 200k chars on `/api/transform`,
  max 50k chars on `/api/tts` (413 on breach).
- **Phase 2: Vite dev-surface tightened** — `host` defaults to
  `localhost`; `allowedHosts` defaults to `false`; both opt-in to `0.0.0.0`
  via `VITE_EXPOSE=1` env var.
- **Phase 2: Vite upgraded** — `5.x → 6.4.3` (patches high-severity esbuild advisory).
- **Phase 3: PDF XSS fixed** — `innerHTML` now uses `escapeHtml`
  (HTML-encodes `<`, `>`, `&`, `"`) before markdown transforms.
- **Phase 3: ESLint + Prettier added** — `eslint@8` + `prettier`,
  `npm run lint` / `npm run format` / `npm run format:check`.
  React Hooks exhaustive-deps warnings remain (require larger refactor).
- **Phase 3: CI added** — `.github/workflows/ci.yml`: lint, format check,
  client tests, build on every push/PR to master.
- **Phase 3: Repo cleanup** — removed `docs/legacy-server-pre-memory-fallback.js.bak`,
  `.env.backup-*` files; `.eslintrc.cjs`, `.prettierrc`, `.prettierignore`,
  `.eslintignore` added to `.gitignore`.

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
