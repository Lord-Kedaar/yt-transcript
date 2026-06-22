# STATE_LOG — ytTranscript

## 2026-06-22 · LLM error messaging + retry fix (3.4.9)

### Root cause diagnosis
- Groq returned HTTP **529 Too Many Requests** (over capacity) on Summarize.
- 529 was NOT in `RETRYABLE_STATUS_CODES` → retry loop skipped immediately.
- `isRetryableError` matched `'network'` and `'fetch failed'` in the `withRetry` wrapper
  message (`"Groq chat failed...retrying...network"`) → second attempt on a non-retryable
  error → finally threw `"fetch failed"` as the error message to UI.
- Mistral endpoint was `/chat/completions` instead of `/v1/chat/completions` (would have
  failed anyway since MISTRAL_API_KEY is empty on Lenovo).
- `LLM_PROVIDER_FALLBACK=` was empty on Lenovo → no fallback chain at all.

### Fixes applied
- Added `529` to `RETRYABLE_STATUS_CODES`.
- Removed `'network'` and `'fetch failed'` from `isRetryableError` pattern matching.
- Fixed Mistral chat endpoint to explicit `/v1/chat/completions`.
- Frontend now shows `data?.error || data?.message || \`LLM provider error (HTTP ${res.status}).\``
  instead of generic `'Model returned an error.'`.

### Files changed
- `server.js` — RETRYABLE_STATUS_CODES, isRetryableError, Mistral endpoint
- `index.html` — frontend error message

### Deployment
- Pushed to remote. Lenovo `/srv` is not a git worktree — server.js copied via scp,
  server restarted (PID 3406669 on port 4002).

## 2026-06-21 · Preserve Summary + Reconstruction together (3.4.5)

### Decyzje
- `S.summaryText` i `S.reconstructedText` są teraz niezależnymi wynikami AI dla tego samego transcriptu.
- `doTransform('reconstruct')` ustawia tylko `S.reconstructedText` i `S.lastReconstructionMeta`; nie kasuje `S.summaryText`.
- `doTransform('summarize')` ustawia tylko `S.summaryText` i `S.lastAiMeta`; nie kasuje `S.reconstructedText`.
- Nowy transcript fetch oraz `New transcript` nadal czyszczą oba wyniki — to są granice nowej sesji treści.

### Pliki zmienione
- `index.html` — usunięte wzajemne czyszczenie wyników w `doTransform()`; dodane komentarze kontraktu stanu.
- `CHANGELOG.md` — wpis 3.4.5.
- `STATE_LOG.md` — ten wpis.

### Weryfikacja
- Static: `doTransform()` nie zawiera cross-clearów (`S.summaryText = ''` w branchu reconstruct ani `S.reconstructedText = ''` w branchu summarize).
- Guard: `doFetch()` i `resetBtn` nadal czyszczą oba wyniki.
- Runtime: realny flow w browserze na `dQw4w9WgXcQ`: Fetch transcript → Summary → Reconstruction → click `AI Summary`; Summary pozostało widoczne, `AI Reconstruction` pozostał dostępny.
- `/api/health`: `ok connected`, features `{reconstruct:true, summarize:true}`.

### Rollback
```bash
git revert <commit-3.4.5>
```

### Ryzyka / ograniczenia
- Brak zmiany backend/API; zmiana dotyczy tylko front-end state retention.
- Eksport Markdown/PDF może teraz naturalnie zawierać oba wyniki, jeśli oba są wygenerowane — zgodne z nowym kontraktem.

---

## 2026-06-21 · Remove redundant internal transcript buttons (3.4.4)

### Decyzje
- Usunięto zaznaczony na screenshotcie wewnętrzny `Raw / AI reconstruction` segmented control z nagłówka `#transcriptCard`.
- Jako jedyny mechanizm przełączania widoków zostaje top-level `#viewSwitcher`: `Transcript / AI Reconstruction / AI Summary`.
- Funkcje `showRaw()` i `showReconstructed()` zostają, ale bez sterowania usuniętymi buttonami; nadal są używane przez `setActiveView()`.

### Pliki zmienione
- `index.html` — usunięte: DOM `#transcriptModeControl`, CSS `.seg-control/.seg-btn`, JS refs/listeners `modeRaw/modeAI`.
- `CHANGELOG.md` — wpis 3.4.4.
- `STATE_LOG.md` — ten wpis.

### Weryfikacja
- Static source check: zero wystąpień `modeRaw`, `modeAI`, `transcriptModeControl`, `seg-control`, `seg-btn`.
- HTML parser: OK, 58 IDs, zero duplikatów.
- Served HTML `http://localhost:4000/?v=remove-internal-tabs`: usunięte kontrolki absent, top-level switcher present.
- Browser DOM after simulated reconstruction state: forbidden selectors count `0`; visible tabs remain `Transcript`, `AI Reconstruction`, `AI Summary`.
- `/api/health`: `ok connected`, features `{reconstruct:true, summarize:true}`.

### Rollback
```bash
git revert <commit-3.4.4>
```

### Ryzyka / ograniczenia
- Brak zmiany backend/API.
- Repo nadal ma wcześniejsze unstaged zmiany poza tym commitem; nie zostały dodane do stagingu.

---

## 2026-06-21 · UI layout corrections + prose renderer polish (3.4.3)

### Decyzje
- **Toolbar placement**: akcje AI/export/reset są top-level `#toolbarShell`, nie dzieckiem `#transcriptCard`. DOM order po poprawce: URL form → empty/toolbar slot → `#toolbarShell` → `#viewSwitcher` → `#transcriptCard` / `#summaryCard`.
- **Centrowanie URL**: `.col` dostał `align-self:center` + `justify-self:center`, bo samo `width: var(--col-w)` nie centruje elementu w grid/flex parent.
- **Centrowanie tabs**: `.view-switcher` dostał `align-self:center` + `justify-self:center`; wcześniejsze `align-self:flex-start` wymuszało wizualny drift w lewo.
- **Render LLM**: summary i reconstruction używają `.prose` — heading hierarchy, paragraph rhythm, list markers, link style, inline code i fenced code block styling. Markdown parser `md()` pozostał bez zmiany logiki sanitizacji.

### Pliki zmienione
- `index.html` — CSS centering, nowy `#toolbarShell`, `.prose`, JS toggle `toolbarShell.style.display`, prose classes on `#summaryBody` and `#transcriptReconstructed`.
- `CHANGELOG.md` — wpis 3.4.3.
- `STATE_LOG.md` — ten wpis.

### Weryfikacja
- Server: `curl http://localhost:4000/api/health` → `ok remote connected`, features `{reconstruct:true, summarize:true}`.
- Syntax: `node --check server.js` → OK.
- Static checks: 7/7 PASS — toolbar top-level before switcher/card, toolbar removed from transcript card body, URL centering CSS, switcher centering CSS, prose on summary/reconstruction, toolbar show/hide toggle.
- Browser DOM geometry at 1470px viewport: URL center diff `0px`; toolbar center diff `0px`; tabs center diff `0px`; card center diff `0px`; `toolbarAboveTabsAndCard=true`.
- Browser computed prose: `summary-body prose`, `transcript-reconstructed prose`, `h2` 18.4px + border, paragraph line-height 26.7px, code block background/padding present.

### Rollback
```bash
git revert <commit-3.4.3>
# albo precyzyjnie:
git checkout HEAD~1 -- index.html CHANGELOG.md STATE_LOG.md
```

### Ryzyka / ograniczenia
- Repo nadal ma wcześniejsze unstaged zmiany w `DESIGN.md`, `server.js`, `client/*` i `MERGE_BRIEF.md`; nie były częścią tej poprawki i nie zostały dodane do commita 3.4.3.
- Weryfikacja wizualna wykonana przez DOM/computed-style geometry, nie przez screenshot.

---

## 2026-06-21 · Surgical UI/state fix v3.4.1 (3.4.1)

### Decyzje
- **Active view model**: `S.activeView = 'transcript' | 'reconstruction' | 'summary'`. Jeden content panel, view switcher z 3 buttonami (Transcript / AI Reconstruction / AI Summary). Tabs z `aria-pressed` + `aria-controls` na istniejące cards (nie nowy wrapper).
- **AI status state machine**: 4 states — `checking` (pulse, init/probe), `online` (lime, oba features), `partial` (amber, jeden feature), `offline` (red, backend unreachable). Bug z v3.4.0: stare `applyProviderStatus` czytał `data.state || data.status`, gdzie `/api/health` zwracał `"ok"` — zawsze lądowało na default `'AI · offline'`. Naprawione: `mapHealthToState()` używa `data.status === 'ok'` + `data.features`.
- **Stale-probe protection**: monotonic `probeSeq` counter, sprawdzany w KAŻDYM path (fetch, parse, HTTP error, reject). Codex r5#1 Critical finding.
- **/api/health extended**: nowe pola `mode`, `features.reconstruct/summarize`, `latencyMs`, `checkedAt`. Features derived from `Object.keys(TRANSFORM_PROMPTS)` — partial state staje się reachable gdy jeden prompt zostanie usunięty w przyszłości.
- **/api/transform extended**: nowe pola `elapsedMs` (mierzony wokół chat call) + `tokens` (z `result.raw.usage.total_tokens`). Zmiana schema response, ale backwards compatible (nowe pola dodane).
- **Contract uniformity**: type='reconstruct'|'summarize' to jedyni dozwoleni w payload. View names ('reconstruction', 'summary') tylko w UI. Backend validation (linia 1017) + frontend consistency.
- **Read aloud button usunięty** z Transcript toolbara (`ttsToggleBtn` HTML + listener). `<details id="ttsCollapsible">` zostawiony w DOM, ukryty CSS `#ttsCollapsible { display: none !important; }`. `/api/tts` endpoint nietknięty — dostępny dla przyszłego Piper run.
- **AI button dot+icon anti-pattern**: `.btn-ai::before` usunięty (był to lime 6px dot obok ikony SVG). Teraz: lime border, lime hover bg, lime focus-visible ring. Zero dekoracyjnych kropek.
- **white-space: nowrap** na `.btn` — przyciski nie łamią się na desktopie.
- **Metadata badge = real data**: usunięty literal "Generated · model · time · tokens" placeholder. Dynamic build z `model/elapsedMs/tokens` z response. 4 kształty. Ukryty gdy brak danych. Lime accent (badge-accent), NIE fiolet (primary), bo AI = lime per brief §17.
- **Markdown rendering**: `md()` function — escapeHtml first → block tokens (code fence, headings, lists, paragraphs) → inline transforms (code, bold, italic, links z URL validation). Zastępuje stary mini-parser `parseSummaryHtml`. Aplikowany do summary I reconstruction.
- **providerBadge** zmieniony z `<div>` na `<button type="button">` — poprawny button role, click/Enter/Space trigger probeHealth.

### Codex review iterations
- REV 1-6 (6 rund) plan review przed implementacją. Findings dotyczyły: extend /api/health instead of new endpoint, stale-probe protection, aria-pressed vs aria-selected, both-features-false edge case, real test plan with round-trip.
- Post-impl review: APPROVED z 1 Important + 1 Suggestion, oba zaaplikowane.

### Pliki zmienione
- `server.js` — `/api/health` extended (latencyMs/mode/features/checkedAt), `/api/transform` extended (elapsedMs/tokens). +25 linii.
- `index.html` — surgical CSS+DOM+JS. 60,978 B → 78,320 B (+17 KB).
- `CHANGELOG.md` — 3.4.1 entry.
- `STATE_LOG.md` — ten wpis.
- Backupy: `server.js.backup-20260621-before-v3.4.1-fix`, `index.html.backup-20260621-before-v3.4.1-fix`.

### Acceptance (18/18 pass)
- Toolbar buttons IDs present, no Read aloud, .btn-ai::before removed, white-space:nowrap, 3 view tabs, type='reconstruction' rejected (400), type='reconstruct' 200, type='summarize' 200, no static 'AI · offline' default, providerBadge is button, no 'model · time · tokens' placeholder, /api/health has new fields, /api/transform has elapsedMs+tokens, ::before pseudo gone, #ttsCollapsible hidden via CSS, activeView state field, probeHealth function, md() function.

### End-to-end smoke
- /api/health: status=ok, mode=remote, features={reconstruct:true, summarize:true}, latencyMs=494
- /api/lm-status: ok=true, state=connected
- /api/transcript: 61 snippets (Rick Astley)
- /api/transform reconstruct: 91ms, 121 tokens
- /api/transform summarize: 1980ms, 578 tokens
- UI: HTTP 200, 78,320 B

### Rollback
```bash
cp server.js.backup-20260621-before-v3.4.1-fix server.js
cp index.html.backup-20260621-before-v3.4.1-fix index.html
./manage.sh restart
```

### Znalezione side-issues (out of scope)
- DESIGN.md ma unstaged changes (pre-existing, nietknięte — patrz STATE_LOG v3.4.0).
- client/src/* React SPA archaeology — nietknięte (nieserwowane).
- /api/tts endpoint orphan (TTS button removed z UI, ale endpoint aktywny) — zostawiony dla przyszłego Piper run.
- STATE_LOG.md ma znacznik "PROMPT_YTTRANSCRIPT_UI_STATE_PLUS_AI_STATUS_FIX.md" w nazwie — to nazwa tego runa.

---

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
