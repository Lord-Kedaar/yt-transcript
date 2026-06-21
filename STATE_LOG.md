# STATE_LOG — ytTranscript

## 2026-06-21 · Rhea UI redesign + multi-lang translate (3.4.0)

### Decyzje
- **UI**: jednoplikowy `index.html` (60 KB) w repo root, shadcn/Rhea tokens (zinc + violet #8b5cf6 + lime #84cc16), EN microcopy, provider label "AI" (nie oMLX, nie lokalnie leakuj nazwy providera do usera).
- **Language dialog**: 3 opcje zamiast 2 — Keep / Translate to German / Translate to Polish. Frontend wysyła `targetLang` w body `/api/transform`.
- **Diagnostics Sheet usunięty** — poza scope portfolio (backstage tool, nie user-facing).
- **Motion**: jeden easing family (`cubic-bezier(0.2, 0, 0, 1)`), 3 timing tiers (0.12s/0.18s/0.6s), reduced-motion fallback.
- **A11y**: focus-visible wszędzie, aria-busy na ładowaniu, skip-link, role="status" na spinnerach.

### Conflict z MERGE_BRIEF.md (rozwiązany)
- Brief kazał wgrać redesign do `./index.html` (root). Tymczasem server.js czytał `client/dist/index.html` (React SPA z 2026-06-14).
- Decyzja: zmieniono `INDEX_HTML_PATH` na root `./index.html` (zgodne z intencją briefu „no build pipeline needed for UI"). React SPA pozostawiona w `client/dist/` jako archaeology, `/assets/*` static handler nieaktywny (orphan, do usunięcia w follow-up).
- Backup starej wersji: `client/dist/index.html.backup-20260621-before-rhea-redesign` (614 B, ostatni built React SPA).

### Backend contract — `/api/transform`
- **Nowe pole**: `targetLang: 'de' | 'pl' | 'en'` (opcjonalne, default 'pl').
- **Backward compat**: bez `targetLang` = Polish (stare zachowanie).
- **Cache key**: `type:mode:targetLang:hashKey` (zapobiega PL↔DE cross-contamination).

### Pliki zmienione
- `index.html` — kompletny redesign (60 543 B, single-file, self-contained)
- `server.js` — `INDEX_HTML_PATH` → root; `/api/transform` linia 978-1000 (targetLang handling); linia 1030 (cache key z targetLang)
- `CHANGELOG.md` — 3.4.0 entry
- `STATE_LOG.md` — ten wpis
- Backupy: `server.js.backup-20260621-before-dynamic-targetlang`, `client/dist/index.html.backup-20260621-before-rhea-redesign`

### Weryfikacja (2026-06-21 03:29)
```bash
# 1. Health
curl -s http://localhost:4000/api/health | jq .
# → status:ok, provider:"Groq", providerState:"connected"

# 2. Translate to Polish (backward compat)
curl -s -X POST http://localhost:4000/api/transform \
  -H "Content-Type: application/json" \
  -d '{"snippets":[{"text":"Hello world test."}],"type":"summarize","mode":"translate"}' | jq .
# → summary w Polish (Groq llama-4-scout)

# 3. Translate to German (nowy)
curl -s -X POST http://localhost:4000/api/transform \
  -H "Content-Type: application/json" \
  -d '{"snippets":[{"text":"Hello world test."}],"type":"summarize","mode":"translate","targetLang":"de"}' | jq .
# → summary w German

# 4. Reconstruct to German (nowy)
curl -s -X POST http://localhost:4000/api/transform \
  -H "Content-Type: application/json" \
  -d '{"snippets":[{"text":"The quick brown fox."}],"type":"reconstruct","mode":"translate","targetLang":"de"}' | jq .
# → reconstructed w German

# 5. targetLang=en noop (keep original via translate)
curl -s -X POST http://localhost:4000/api/transform \
  -H "Content-Type: application/json" \
  -d '{"snippets":[{"text":"Hello world test."}],"type":"summarize","mode":"translate","targetLang":"en"}' | jq .
# → summary w English (no translate suffix)

# 6. UI smoke: HTTP 200 + 60 543 B + SHA matches source
curl -s http://localhost:4000/ | shasum -a 256
```

### Akceptacja ✓
- [x] UI: serwuje z root `./index.html` (HTTP 200, 60 543 B, SHA zgodny ze źródłem)
- [x] `/api/transform` z `mode:'translate'` bez `targetLang` → Polish output (Groq, llama-4-scout)
- [x] `/api/transform` z `mode:'translate', targetLang:'de'` → German output
- [x] `/api/transform` z `mode:'translate', targetLang:'pl'` → Polish output
- [x] `/api/transform` z `mode:'translate', targetLang:'en'` → English noop
- [x] Cache key rozróżnia targetLang (PL → DE → PL zwraca różne wyniki, nie cross-contamination)
- [x] Brak regresji w `/api/transcript` (Rick Astley, 61 snippets) i `/api/tts` (503 Piper missing — pre-existing, nie regresja)
- [ ] UI smoke manualny: Fetch → Reconstruct → Language dialog → 3 buttony (wymaga przeglądarki — poza scope workera)
- [ ] Toast po Copy/Export (wymaga UI smoke manual)
- [ ] prefers-reduced-motion (wymaga OS settings — manual)

### Rollback
```bash
cp server.js.backup-20260621-before-dynamic-targetlang server.js
cp index.html client/dist/index.html  # jeśli chcesz przywrócić React SPA
./manage.sh restart
```

### Znalezione side-issues (poza scope v3.4.0)
- `client/dist/` zawiera starą React SPA + `/assets/*` static handler w server.js:122-128 jest orphanem. Do usunięcia w v3.4.1 lub v3.5.0.
- DESIGN.md ma unstaged changes (prawdopodobnie redesign-era edits) — out of scope, nietknięte.
- Vite build step w `scripts/build.js` (`npm --prefix client run build`) nadal działa przy `npm start` ale jego output jest ignorowany. Wastes ~5-10s na restart. Do wyłączenia w v3.4.1.

---

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
