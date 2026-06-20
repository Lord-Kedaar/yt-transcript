# STATE_LOG — ytTranscript

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
