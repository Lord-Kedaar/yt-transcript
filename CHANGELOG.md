# Changelog

## 3.4.3 — 2026-06-21

### UI layout + AI text rendering fixes

- **Action toolbar moved above content** — `Reconstruct with AI`, `Summarize with AI`, `Export…` and `New transcript` were physically inside `#transcriptCard`, below the transcript body. Moved them into top-level `#toolbarShell` between the URL form/empty state and the `Transcript / AI Reconstruction / AI Summary` switcher, so the action buttons now sit above the transcript/summary panel.
- **URL field centering restored** — `.col` now has `align-self:center` and `justify-self:center`; browser geometry check: URL section center diff `0px` at 1470px viewport.
- **Post-result tabs centered** — `.view-switcher` now has `align-self:center` and `justify-self:center`; browser geometry check: tabs center diff `0px`.
- **LLM output rendered as prose** — summary and reconstruction containers now use `.prose` styles for headings, paragraphs, lists, links, inline code and code blocks. Browser computed-style check: `h2` 18.4px with bottom border, paragraph line-height 26.7px, code block background/padding present.

### Tested

- `/api/health` → `ok remote connected`, features `{ reconstruct:true, summarize:true }`.
- `node --check server.js` → OK.
- Static source checks → 7/7 PASS: toolbar order, top-level placement, URL centering CSS, tabs centering CSS, prose classes, toolbar toggle.
- Browser geometry check → toolbar sits between URL and content (`toolbarAboveTabsAndCard=true`), URL/toolbar/tabs/card center diff `0px`.

## 3.4.2 — 2026-06-21

### CSS layout fixes — toolbar centering + sticky footer

- **Toolbar centered** — guziki (Reconstruct / Summarize / Export…) były wąskim divem przyklejonym do lewej strony. Root cause: outer inline wrapper (linia 1224) bez `align-items:center`. Fix: `align-items:center` na outer wrapper + `justify-content:center` na `.toolbar`.
- **Stopka sticky bottom** — stopka zamiast być na dole ekranu, lądowała za treścią przy długich transkrypcjach. Root cause: `body { min-height:100dvh }` + `.footer { margin-top:auto }` działa tylko gdy treść < viewport; przy treści > viewport footer spada na dół dokumentu. Fix: `position: sticky; bottom: 0` na `.footer` — przykleja stopkę do dołu viewportu niezależnie od scrolla.

---

## 3.4.1 — 2026-06-21

### Surgical UI/state fix — single content panel + real AI status

- **Active view model** — `S.activeView = 'transcript' | 'reconstruction' | 'summary'`. ONE main content panel whose body swaps by view. Toolbar (Reconstruct / Summarize / Export…) lives **above** the transcript (was below). AI results replace the transcript instead of stacking under it.
- **View switcher** — 3-button segmented control above the cards (`role="group"`, `aria-pressed`, `aria-controls` pointing to existing cards). Disabled tabs get a `title` hint (`Generate AI reconstruction first` / `Generate AI summary first`). Hidden until a transcript is loaded.
- **Read aloud button removed** — `ttsToggleBtn` deleted from DOM. `<details id="ttsCollapsible">` element kept but hidden via `#ttsCollapsible { display: none !important; }`. Server-side `/api/tts` endpoint untouched — available for the future Piper run (out of v3.4.1 scope per brief).
- **AI status state machine (real, not fake)** — replaces fake `AI · offline` default. 4 states: `checking` (muted pulsing, on init and during probe), `online` (lime, both features available), `partial` (amber, exactly one feature), `offline` (red, backend reports degraded or unreachable). State derived from real `/api/health` response.
- **`/api/health` extended** — adds `mode` (local/remote/unavailable), `features: { reconstruct, summarize }` (derived from `Object.keys(TRANSFORM_PROMPTS)` — supports future partial state when one prompt key is removed), `latencyMs`, `checkedAt`. Backwards compatible: existing fields preserved.
- **Stale-probe protection** — monotonic `probeSeq` counter; every probe settlement path (fetch, parse, HTTP error, fetch reject) checks `mySeq === probeSeq` before mutating UI. Slower older probes can never overwrite newer state (Codex r5#1 finding).
- **Feature gating** — `reconstructBtn` / `summarizeBtn` disabled (with `title` tooltip) when backend reports the feature as unavailable. `dataset.disabledByHealth` flag prevents `setAiLoading` from re-enabling during a transform request.
- **Click-to-refresh** — provider status badge is now a real `<button>` (was `<div role="status">`); click or Enter/Space triggers a manual re-probe. 60s `setInterval` auto-probe with cleanup on `beforeunload`.
- **Tooltip on badge** — `title` attribute shows `provider · model · features · checked HH:MM` for online/partial/offline, `Checking AI backend…` for the transient state.
- **AI button dot+icon anti-pattern removed** — `.btn-ai::before` pseudo-element (lime dot) deleted. Buttons now have lime border + lime hover bg + lime focus-visible ring. One icon per button, no decorative dot.
- **`white-space: nowrap`** on `.btn` — labels stay on a single line at desktop widths.
- **`/api/transform` response extended** — adds `elapsedMs` (measured around the chat call) and `tokens` (from `result.raw?.usage?.total_tokens`, null when upstream omits). Used to populate the metadata badge.
- **Metadata badge = real data only** — replaced literal `Generated · model · time · tokens` placeholder. Builds dynamic text from real response fields. Shapes: `Generated · model · time · tokens` / `Generated · model · time` / `Generated · time` / `Generated · model`. Hidden entirely when only "Generated" remains.
- **Badge accent = lime** — both `#summaryMetaBadge` and new `#reconstructionMetaBadge` use `badge-accent` (lime) class instead of `badge-primary` (violet), per brief §17 (AI = lime, primary/brand = violet).
- **Safe markdown rendering** — replaced mini-parser `parseSummaryHtml` with `md()` function. Handles fenced code, `#` `##` `###` headings, `-`/`*`/`+` unordered lists, `1.` ordered lists, paragraphs, `**bold**` / `__bold__`, `*italic*` / `_italic_`, `` `inline code` ``, `[text](https://url)` links with `rel="noopener noreferrer"`. **HTML-escape-first** pipeline (no `dangerouslySetInnerHTML` without sanitization). Applies to both summary and reconstruction.
- **Contract uniformity** — `reconstruct` / `summarize` are the only valid `type` values in `/api/transform` request and response. View names (`reconstruction` / `summary`) are UI-only and never sent as payload. Backend already enforced (400 `Invalid type. Use reconstruct or summarize.`); frontend now consistent.
- **Accessibility** — `aria-pressed` (not `aria-selected`) on the view switcher group — toggle semantics, not tab semantics (Codex r3#2). `inert` + `aria-hidden` on hidden cards so keyboard tab order skips them. `role="region"` + `aria-labelledby` on visible card. `role="button"` on the now-clickable provider badge.

### Internal

- Server: `server.js` — `/api/health` extended, `/api/transform` extended. ~25 lines added. No breaking changes.
- Frontend: `index.html` — surgical CSS + DOM + JS, no full rewrite. 60,978 B → 78,320 B (+17 KB for view switcher, markdown, state machine, probe function).
- `client/src/*`, `client/dist/*` — unchanged (React SPA archaeology, not served).
- DESIGN.md — unchanged (out of scope; previous run left unstaged changes, intentionally not addressed).

## 3.4.0 — 2026-06-21

### UI redesign — Rhea design system

- **Single-file HTML** — replaced previous multi-file React structure with `index.html` (60 KB, self-contained, no client build needed). Server.js `INDEX_HTML_PATH` updated to serve from repo root instead of `client/dist/index.html`. React SPA in `client/dist/` retained but no longer served (kept for tests/archaeology).
- **shadcn/Rhea tokens** — zinc base, `--primary #8b5cf6` (violet-500, deeper than washed-out `#a78bfa`), `--accent #84cc16` (lime for AI activity indicators), Inter font, 1.5 line-height, hairline borders.
- **EN-only microcopy** — all UI strings in English (was mixed PL/EN).
- **Provider label** — generyczne "AI" with status ring (was hardcoded "oMLX" leaking provider name to end-user).
- **Language dialog** — 3 options: Keep original / Translate to German / Translate to Polish (was 2: keep / translate to Polish).
- **Diagnostics removed** — Diagnostics Sheet + diagnostics button + "Lokalne przetwarzanie" notice all removed from UI (out of portfolio scope).
- **Toast feedback** — bottom-right corner toast for copy/export actions (was inline `<span>Skopiowano!</span>` on button).
- **Motion system** — `cubic-bezier(0.2, 0, 0, 1)` everywhere, single timing tier (0.12s/0.18s/0.6s), `prefers-reduced-motion` fallback (animations off, transitions instant for motion).
- **A11y** — `:focus-visible` ring on all interactive, `aria-busy` on loading buttons, `role="status"` on spinners, `aria-live="polite"` on toast host, skip-link `#first-snapshot`.
- **`.btn-ai`** — dedicated class for AI actions with lime dot ring + lime border on hover (TTS, Reconstruct, Summarize).

### Backend — dynamic translate language

- **`/api/transform`** accepts `targetLang: 'de' | 'pl' | 'en'` (default `'pl'` for backward compat with old frontend).
- Prompt suffix dynamically built: "Translate into Polish" / "Translate into German" / noop (en).
- Cache key includes `targetLang` to prevent PL/DE cross-contamination.
- Validation commands in `STATE_LOG.md` 2026-06-21 entry.

---

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
