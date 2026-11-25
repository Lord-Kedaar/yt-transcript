# FreeLLMAPI model rotation before the oMLX fallback — 2026-11-25

**Typ:** fix / reliability
**Status:** DONE_VERIFIED
**Commit:** `7b8e0b4` (merge `18f2649`), repo `Lord-Kedaar/yt-transcript`

## Problem

Dwa podsumowania z rzędu (2026-11-25 15:25:50 UTC i 15:34:14 UTC, czas lokalny
16:25 i 16:34) skończyły się na oMLX `gemma-4-26B-A4B-it-QAT-MLX-4bit`:

| czas (UTC) | błąd FreeLLMAPI | czas do odpowiedzi Gemmy |
|---|---|---|
| 15:25:50 | `ovh/gpt-oss-20b: rate_limited` + `cloudflare/@cf/openai/gpt-oss-20b: auth` | 33,3 s |
| 15:34:14 | `cloudflare/@cf/openai/gpt-oss-20b: auth` (1 próba) | 26,6 s |
| 15:34:49 | `All models exhausted: 3 routes (2 rate-limited, 1 prompt too large)`, 4 modele pominięte | 15,4 s |

Przyczyna: nazwa modelu (`openai/gpt-oss-20b`) to **grupa platform** w routerze,
nie jeden upstream. Grupa była pusta w praktyce:

- `cloudflare` (klucz #9) → 401 `Authentication error` od 2026-10-03 (13 wystąpień,
  4 różne modele) — token jest `active` na `/accounts/{id}/tokens/verify`, ale nie
  ma uprawnienia do Workers AI, więc health-check uznawał go za zdrowy;
- `ovh` → limit 2 req/min, po dwóch żądaniach 429;
- `groq` → `tpm_limit = 8000`, a realny transkrypt to ~6,3k tokenów promptu plus
  `max_tokens` — router odrzucał go jako „prompt too large”.

Router był jednocześnie zdrowy dla **innych nazw modeli**. Aplikacja nie miała
jak z tego skorzystać: po pierwszym błędzie providera przechodziła od razu do
oMLX, czyli do ładowania 26B na Macu (15–33 s).

## Zmiana

`server.js` — w `buildFreeLLMAPIProvider()` oba warianty (`chat()` i `chatStream()`)
chodzą po liście nazw modeli i dopiero po jej wyczerpaniu zgłaszają błąd do state
machine providerów:

```js
const FREELLMAPI_CANDIDATE_MODELS = [
  FREELLMAPI_MODEL,                                  // pin: openai/gpt-oss-20b
  ...FREELLMAPI_FALLBACK_MODELS,                     // domyślnie: gpt-oss-120b, gemini-2.5-flash-lite
];
```

- rotacja zatrzymuje się przed pierwszym delta (`hasEmitted()`) i przy abortcie klienta,
- budżet całej rotacji: `FREELLMAPI_ROTATION_BUDGET_MS` (domyślnie 75 s) — musi zmieścić się w ~100 s okna Cloudflare,
- każde przejście emituje `provider.model.rotation` (level `warn`) z `fromModel`, `toModel`, `errorClassification`, `technicalCause`,
- retry tej samej nazwy (`attempts:2`) zastąpiony jedną próbą na nazwę — powtórka tej samej nazwy trafia w ten sam martwy członek grupy.

## Dobór modeli (pomiar, prompt ~25k tokenów)

| model | routed via | TTFB | total | uwaga |
|---|---|---|---|---|
| `openai/gpt-oss-20b` | groq / ovh / cloudflare | — | 502 (429/auth) | grupa niestabilna przy dużym promptcie |
| `openai/gpt-oss-120b` | ovh | 1,6 s | 8,4 s | ✔ |
| `gemini-2.5-flash-lite` | google | 3,7 s | 3,8 s | ✔ 1M kontekstu, 250k TPM |
| `qwen3.8-27b` | ovh | — | 502 (context_too_large) | ✘ |
| `glm-4.5-flash`, `glm-4.7-flash`, `gemma-4-26b-a4b-it`, `agnes-2.5-flash`, `gemini-3.1-flash-lite` | — | — | 502/503 | niedostępne w chwili pomiaru |

Na mniejszym promptcie (~6k) `openai/gpt-oss-20b` odpowiada w 1,2 s i jest
najszybszy, dlatego pin zostaje bez zmian.

## Dowód

### 1. Rotacja w izolacji (instancje testowe, porty 4011–4013)

- `freeLLMAPI_MODEL=definitely-not-a-model-xyz`, fallback `openai/gpt-oss-120b`
  → buffered: `model: openai/gpt-oss-120b`, 944 ms; streaming: 452 ms, 12 delt,
  `provider: FreeLLMAPI` (żadnego oMLX), event `provider.model.rotation` z `errorClassification: http_404`.
- Kontrola negatywna (oba modele nieistniejące) → `502` z komunikatem publicznym,
  `provider.chat.failed`, `fallbackAttempted: false` — błąd nie jest maskowany.

### 2. Produkcja (Lenovo, `:4002`, po deployu `18f2649`)

- prawdziwy transkrypt (286 snippetów, 18 145 znaków) → `provider: FreeLLMAPI`,
  `model: openai/gpt-oss-20b`, 1 294 ms, `outputLength: 3353`;
- duży payload (503 snippety, 110 585 znaków):
  - `15:48:17.077` rotation `openai/gpt-oss-20b → openai/gpt-oss-120b` (`http_429`)
  - `15:48:17.226` rotation `openai/gpt-oss-120b → gemini-2.5-flash-lite` (`http_429`)
  - `15:48:23.710` `transform.completed` — `model: gemini-2.5-flash-lite`, 6 721 ms
  - brak `provider.fallback.*`, brak oMLX, brak Gemmy.

### 3. Podgląd lokalny (Mac, `:4000`, `launchctl kickstart -k gui/501/com.radek.yttranscript`)

Ten sam duży payload → 6 789 ms, `model: gemini-2.5-flash-lite`, te same dwa
eventy rotacji, `tokens: 15 580`.

### 4. Publicznie

`https://yttranscript.radoslaw-pleskot.com/api/health` → 200, `provider: FreeLLMAPI`,
`chain: [FreeLLMAPI, oMLX, Mistral]`, uptime liczony od restartu nowego kodu.

### 5. Router

Klucz `cloudflare` #9 (`api_keys.id = 9`) wyłączony: `enabled = 1 → 0`
(status `healthy` pozostaje, bo to tylko flaga użycia). Kontener
`freellmapi-freellmapi-1` zrestartowany, `/v1/models` 200.

## Rollback

| warstwa | rollback |
|---|---|
| kod | `git revert 7b8e0b4` + `git pull --ff-only` na Lenovo + `systemctl --user restart yt-transcript` (lokalnie: `launchctl kickstart -k gui/501/com.radek.yttranscript`) |
| konfiguracja | usunąć `FREELLMAPI_FALLBACK_MODELS` z `.env` na obu hostach (bez tego wpisu kod używa wbudowanej domyślnej listy) |
| router | `update api_keys set enabled=1 where id=9` + `docker restart freellmapi-freellmapi-1` |
| backup produkcyjny | `/home/radek/yt-transcript-predeploy-20261125T164704/` (`.env`, `.env.example`, `chain-health.js`, `sse-stream.js`, `test/chain-health.test.js`) |

## Otwarte (poza zakresem tej zmiany)

- Klucz cloudflare pozostaje martwy (401 przy `ai/run`, 200 przy `tokens/verify`).
  Powrót do puli wymaga **nowego** tokena z uprawnieniem `Account → Workers AI → Read`
  — sama rotacja tokena o tym samym zakresie da to samo 401.
- `gemini-2.5-flash-lite` ma `rpd = 20`/dzień — przy wielu podsumowaniach dziennie
  kolejny w kolejce powinien być model z większym budżetem dziennym.
- Health-check FreeLLMAPI (`providers/cloudflare.js → validateKey`) uznaje token
  bez uprawnień Workers AI za zdrowy; to defekt upstreamu `v0.16.17`.
