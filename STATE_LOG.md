# STATE_LOG — ytTranscript

## 2026-07-07 — ytTranscript — chore/update-favicons: favicon + Apple touch icon + whitelisted asset handler

- **Co:** Dodano favicons i Apple touch icon z paczki `favicon_pack_portfolio_projects_v2/yttranscript/` do repo root (10 plików obok root `index.html`): `favicon.ico`, `favicon-light.svg`, `favicon-dark.svg`, `apple-touch-icon.png`, `favicon-{16,32,48,64,192,512}.png`. W `index.html` wstawione tagi `<link rel="icon">` z media-query dark/light oraz fallback `.ico` i `<link rel="apple-touch-icon">`. W `server.js` dodany whitelist handler routujący wyłącznie 10 nazw assetów przez `res.sendFile` z `__dirname` (obrona: `FAVICON_ASSETS` Set re-check wewnątrz handlera dla defence-in-depth).
- **Plik:** `favicon.ico`, `favicon-light.svg`, `favicon-dark.svg`, `apple-touch-icon.png`, `favicon-{16,32,48,64,192,512}.png` (nowe, root repo), `index.html` (modified, `<head>` dodane tagi), `server.js` (modified, dodany whitelist middleware po `app.use(cors(...))`, przed `/assets` static).
- **Build:** brak — root `index.html` serwowany bezpośrednio, brak bundler. Express serwuje assety z `__dirname` po zaktualizowanym handlerze.
- **Preview:** `node server.js` lokalnie na `127.0.0.1:4002`, każda z 10 nazw zwróciła `HTTP 200` z poprawnym `Content-Type` i rozmiarem odpowiadającym paczce.
- **Ryzyko:** Whitelist jest zamknięta — żadna inna ścieżka nie jest serwowana przez ten handler. Ścieżka `app.use((req, res) => { ... 404 })` na końcu pliku nadal łapie wszystko inne, więc żaden path traversal nie jest możliwy.
- **Dell:** Po deploy na Lenovo Server wymagany jest tylko `node server.js` (process zarządzany ręcznie). `client/dist/` jest nienaruszony; nie ma żadnych zmian bundler-side. Wpływ na lenovo runtime: restart Node, by zaczytać nowy `server.js`.
- **Raport:** `reports/yt-transcript-favicons-2026-07-07.md` (do utworzenia, jeśli potrzebny).

## 2026-06-25 — ytTranscript — cleanup phase 1: Lenovo runtime imported to Mac audit branch

- **Co:** Utworzono branch `audit/import-lenovo-production-20260625` i zaimportowano produkcyjne pliki Lenovo do Mac working tree: `server.js`, root `index.html`, `package.json`, `package-lock.json`, `.env.example`, `DEPLOYMENT_LENOVO_LINUX.md`. Surowy snapshot Lenovo zapisano pod `.audit/lenovo-snapshot-20260625/`. Nie czyszczono jeszcze produkcji; nie kasowano backupów.
- **Plik:** `server.js`, `index.html`, `package.json`, `package-lock.json`, `.env.example`, `DEPLOYMENT_LENOVO_LINUX.md`, `.audit/lenovo-snapshot-20260625/*`, `METRICUS_YTTRANSCRIPT_REPO_RUNTIME_DRIFT_AUDIT_20260625.md`
- **Build:** `node --check server.js` OK; `npm --prefix client run test:summary-parser` OK; `npm --prefix client run test:pdf-pagination` OK; `npm run build` OK (Vite build 1.32s, chunk warning only).
- **Preview:** Local audit preview `PORT=4500 node server.js`: `GET /` 200, `GET /api/health` 200, TTS `type:"reconstruction"` → `audioUrl`, `GET /api/audio/...wav` → 200 57900 B `audio/wav`. Lenovo production untouched and remains running PID 4054067.
- **Raport:** `METRICUS_YTTRANSCRIPT_REPO_RUNTIME_DRIFT_AUDIT_20260625.md`

## 2026-06-25 — ytTranscript — repo/runtime drift audit Mac vs Lenovo

- **Co:** Utworzono audyt rozjazdu między Mac git repo (`main`, `ded7006`) a Lenovo production (`/srv/storage/AI_Projects/yt-transcript`). Ustalenia: Lenovo production nie jest git repo; serwuje root `index.html`; Mac `main` serwuje `client/dist/index.html`; Lenovo `server.js` ma +409/-46 względem Mac i zawiera `/api/ai-limit-status`, `aiDailyLimitGuard`, `ALLOWED_TTS_TYPES` oraz aktywny TTS prep. Raport zawiera klasyfikację bałaganu i bezpieczny 4-fazowy cleanup plan.
- **Plik:** `METRICUS_YTTRANSCRIPT_REPO_RUNTIME_DRIFT_AUDIT_20260625.md`
- **Build:** N/A (audyt dokumentacyjny; brak zmian w runtime/code)
- **Preview:** Lenovo `GET /api/health` 200, `GET /` 200; aktywny proces `node server.js` PID 4054067 cwd `/srv/storage/AI_Projects/yt-transcript`.
- **Raport:** `METRICUS_YTTRANSCRIPT_REPO_RUNTIME_DRIFT_AUDIT_20260625.md`

## 2026-06-20 · Finalna konfiguracja providerów (po testach manualnych)

### Decyzja
- **LLM_PROVIDER=groq** (primary)
- **LLM_PROVIDER_FALLBACK=mistral** (fallback)
- **GROQ_MODEL=meta-llama/llama-4-scout-17b-16e-instruct** (pinned, nie rotuje na compound)
- Mistral small / Groq llama-4-scout / FreeLLMAPI — wszystkie trzy skonfigurowane w `.env`, aktywne 2.

### Dlaczego llama-4-scout a nie groq/compound
- `groq/compound` to Compound AI System Groq — wewnętrznie rotuje na modele (np. `openai/gpt-oss-120b`), co powodowało "Rate limit 8000 TPM" przy dłuższych promptach systemowych (`/api/transform summarize`).
- `meta-llama/llama-4-scout-17b-16e-instruct` to pinned model z `context_window:131072`, prompt ~187 tokenów, mieści się komfortowo w limicie 8000 TPM konta.
- Czas odpowiedzi: ~0.7-1s dla transform (vs 2-3s dla Mistral).
- Output jakościowo porównywalny do Mistral (thematic sections z bold headers, poprawna struktura).

### FreeLLMAPI status (po testach)
- `GET /v1/models` → 200 natychmiast
- `POST /v1/chat/completions` z `model:"auto"` → 8-30s (cold-start rotacja na darmowe modele openrouter)
- Mimo działającego Scrutator (Hermes profil) **nie został wpięty do chain** — rotacja cold-start powodowałaby timeouty 8s dla ytTranscript UI.
- FreeLLMAPI env vars nietknięte w `.env` — dostępne jako opcja na przyszłość.

### Znalezione side-issue (pre-existing, poza scope)
- `/api/transform` zwraca `"reconstructed"` z doklejonym prompt suffixem `"Use paragraphs. Keep every meaning intact."` na końcu. Parser nie obcina tej części. Do zbadania w następnym przebiegu.

---

## 2026-06-20 · Mistral + Groq Providers + Health Cache + Fallback Chain

### Co
- **Nowe providery**: `buildMistralProvider()` (https://api.mistral.ai/v1) i `buildGroqProvider()` (https://api.groq.com/openai/v1). Oba OpenAI-compatible, ten sam `chat()/health()` interface co `buildOmlxProvider` / `buildFreeLLMAPIProvider`.
- **Groq reasoning fallback**: `openai/gpt-oss-20b` zwraca reasoning w `reasoning_content` — parser preferuje `content`, fallback do `reasoning_content` gdy `content` pusty.
- **Health cache** (`HEALTH_CACHE_TTL_MS=3000`): `buildProviderChain()` cache'uje wynik `health()` na 3s żeby `/api/transform` i `/api/lm-status` nie płaciły za cold-start probe przy każdym requeście. Stickiness — jeśli resolved provider jest w cache TTL, NIE robi nowego probe'a.
- **Fallback chain** (`LLM_PROVIDER_FALLBACK=groq`): automatycznie przełącza na następny provider z listy gdy primary ma `health().ok=false`. Aktywny provider jest "sticky" dopóki sam nie zwróci unhealthy.
- **Express-side guard** w `/api/lm-status`: setTimeout 2s jako defense-in-depth dla cold-start edge cases.
- **`build.js` wersja**: czyta `version` z `package.json` zamiast hardcoded `'3.2.0'` (eliminuje drift build-info vs package.json).
- **Fix `/api/transform`**: hardcoded `"oMLX is unreachable."` → template `${llmProvider.name} is unreachable: ${lmStatus.error}` — provider-agnostic.

### Pliki zmienione
- `server.js` — nowe env vars, factory dispatch, provider chain, Mistral/Groq providers, /api/transform fix, /api/lm-status guard, /api/health activeModel switch
- `scripts/build.js` — wersja z package.json
- `.env.example` — sekcje Mistral, Groq, fallback chain, health cache TTL

### Akceptacja ✓
- [x] `LLM_PROVIDER=mistral` + `LLM_PROVIDER_FALLBACK=groq` w `.env`
- [x] `/api/health` → `provider:"Mistral", providerState:"connected", model:"mistral-small-2603", chain:["Mistral","Groq"]`
- [x] `/api/lm-status` × 10 → 10/10 HTTP 200, max 0.27s (przed: 30% timeout)
- [x] `/api/transform` reconstruct → HTTP 200 w 0.95s z `model:"mistral-small-2603"`
- [x] Mistral `/v1/models` direct → HTTP 200, 16 modeli widocznych
- [x] Groq `/openai/v1/models` direct → HTTP 200, modele widoczne
- [x] `buildVersion` w `/api/health` → odświeża się co `npm start` z aktualnym timestampem

### Weryfikacja
```bash
curl -s http://localhost:4000/api/health | jq .
curl -s -X POST http://localhost:4000/api/transform \
  -H "Content-Type: application/json" \
  -d '{"snippets":[{"text":"Hello world test."}],"type":"reconstruct","mode":"original"}' | jq .
```

### Znalezione side-issue (pre-existing, poza scope)
- `/api/transform` zwraca `"reconstructed"` z doklejonym prompt suffixem `"Use paragraphs. Keep every meaning intact."` na końcu. Parser nie obcina tej części. Do zbadania w następnym przebiegu.

### Uwagi
- Health cache TTL=3s: dla single-provider mode transparentne. Dla fallback chain — provider jest sticky przez 3s, potem re-probe.
- Fallback chain loguje `[llm] Switched active provider: X → Y` przy przełączeniu (w `console.log`).
- Rollback: `cp server.js.backup-20260620-190115-before-mistral-groq-providers server.js && ./manage.sh restart`

---

## 2026-06-17 · LLM Provider Abstraction + FreeLLMAPI Migration

### Co
- **Provider abstraction layer** w `server.js` — `llmProvider` singleton z `chat()` i `health()` interface
- **Dwa providery**: `buildOmlxProvider()` (domyślny, backwards-compatible) i `buildFreeLLMAPIProvider()`
- **Env-driven switch**: `LLM_PROVIDER=omlx|freellmapi` — zero edycji kodu przy zmianie providera
- **FreeLLMAPI podłączony**: `http://127.0.0.1:3001`, model `auto` (automatyczna rotacja: deepseek-v4-flash, openrouter/owl-alpha)
- `/api/health` i `/api/lm-status` — dynamiczny provider name
- `/api/transform` — przepisany na `llmProvider.chat()`, wyniki pokazują `provider: "FreeLLMAPI"` + faktyczny model

### Pliki zmienione
- `server.js` — provider factory, `llmProvider` singleton, przepisany `/api/transform`
- `.env` — dodane `LLM_PROVIDER=freellmapi`, `FREELLMAPI_*`
- `.env.example` — zaktualizowany z dokumentacją obu providerów
- Backup: `server.js.backup-20260617-<timestamp>-before-freellmapi`

### Akceptacja ✓
- [x] Provider config: `LLM_PROVIDER=freellmapi` → `FREELLMAPI_URL=http://127.0.0.1:3001`
- [x] Model: `auto`
- [x] API key: `freellmapi-745a48317f4c96e7f2da0f1c59fd1757905a3e8eb5815134`
- [x] `/api/health` → `"provider":"FreeLLMAPI","state":"connected"`
- [x] `/api/transform` (reconstruct) → `"model":"deepseek-v4-flash","provider":"FreeLLMAPI"`
- [x] `/api/transform` (summarize) → `"model":"openrouter/owl-alpha","provider":"FreeLLMAPI"` (rotacja działa)
- [x] Brak residualnych ref do oMLX w server.js (poza legacy comments i backwards compat config)

### Weryfikacja
```bash
curl http://127.0.0.1:4000/api/health
# {"status":"ok","provider":"FreeLLMAPI","providerState":"connected"...}
```

### Uwagi
- FreeLLMAPI działa tylko lokalnie na Mac Studio (port 3001 na 127.0.0.1)
- Na Lenovo-Serwer: trzeba wystawić przez Tailscale (TODO: osobne zadanie)
- `buildOmlxProvider()` zachowuje pełną logikę fallback models (nie zmieniona)
- Dla nowego providera: wystarczy dodać `build<Xxx>Provider()` i dopisać do `buildLlmProvider()`

---

## 2026-06-25 — ytTranscript — reconciliation: import Lenovo runtime + cleanup of staging artifacts

- **Co:** Na branchu `reconciliation/lenovo-runtime-20260625` zatwierdzono kanoniczne commity: (1) `feat(import)` — `server.js`, root `index.html`, `package*.json`, `.env.example` z Lenovo production; (2) `docs` — `README.md`, `docs/LOCAL_SETUP.md`, `DEPLOYMENT_LENOVO_LINUX.md` dopasowane do produkcyjnej architektury (port 4002, NFS path, root `index.html`, single-file UI), plus `.gitignore` dla `backups/`, `.audit/`, `METRICUS_*_REPORT.md`, `YTTRANSCRIPT_*_REPORT.md`; (3) `chore(archive)` — raporty operacyjne i snapshot `2026-06-21-before-task1` przeniesione do `docs/archive/` (z `docs/archive/*/.gitignore` chroniącym `.env`); (4) `docs(audit)` — kanoniczny raport z audytu.
- **Plik:** `server.js`, `index.html`, `package.json`, `package-lock.json`, `.env.example`, `README.md`, `docs/LOCAL_SETUP.md`, `DEPLOYMENT_LENOVO_LINUX.md`, `.gitignore`, `docs/archive/**`, `METRICUS_YTTRANSCRIPT_REPO_RUNTIME_DRIFT_AUDIT_20260625.md`
- **Build:** `node --check server.js` OK; `npm --prefix client run test:summary-parser` OK; `npm --prefix client run test:pdf-pagination` OK; `npm run build` OK (Vite build 1.32s, chunk warning only — Vite jest pomostowo, runtime root `index.html` samodzielny).
- **Preview:** Local `PORT=4500 node server.js` po imporcie: `GET /` 200, `GET /api/health` 200, TTS `type:"reconstruction"` → `audioUrl`, audio GET 200 `audio/wav`. Lenovo production `/api/health` 200, `/` 200, PID 4054067 nadal działa (serwer czyta pliki per-request, runtime root wyczyszczony).
- **Raport:** `METRICUS_YTTRANSCRIPT_REPO_RUNTIME_DRIFT_AUDIT_20260625.md`

### Lenovo production cleanup (B)
- **Co:** Przeniesiono poza runtime root do `/srv/storage/AI_Projects/_archive/yt-transcript/<UTC-ts>-cleanup/` wszystkie `*.bak-*`, `*.backup-*`, `.env.backup-*`, `.write-test`, `server.log`, `manage.sh.bak.*`, `start-frontend.sh.bak.*` oraz katalog `client/` (Vite fallback assets).
- **Backup:** `/srv/storage/AI_Projects/_archive/yt-transcript/20260625T105940Z/yt-transcript-runtime.tgz` (450 KB)
- **W runtime root zostały:** `CHANGELOG.md`, `DEPLOYMENT_LENOVO_LINUX.md`, `.env`, `.env.example`, `index.html`, `manage.sh`, `package.json`, `package-lock.json`, `server.js`, `start-frontend.sh`, `node_modules/`, `.gitignore`.
- **Walidacja:** `GET /api/health` 200, `GET /` 200 po cleanupie; proces `node server.js` PID 4054067 ciągle aktywny.
