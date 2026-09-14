# RCA: ytTranscript — „The string did not match the expected pattern."

**Data:** 2026-09-14
**Autor:** Metricus
**Status:** DONE_VERIFIED (fix wdrożony Mac + Lenovo, E2E potwierdzone)
**Zgłoszenie:** Radosław — błąd w UI przy próbie rekonstrukcji transkryptu (zrzut ekranu: YouTube link + „Fetch transcript" + czerwony komunikat)

---

## Objaw

Po wklejeniu linku YouTube i kliknięciu **Fetch transcript**, UI pokazywał w miejscu błędu:

```
The string did not match the expected pattern.
```

Transkrypt ładował się poprawnie (14 405 znaków widocznych w panelu), ale badge AI pokazywał **„AI · offline"**, a przyciski **Reconstruct with AI** / **Summarize with AI** zwracały ten sam błąd.

---

## Reprodukcja (twarda, nie zgadywanie)

Reprodukcja w **prawdziwym WebKit** (silnik Safari — ten sam, którego używa użytkownik), na **publicznej** stronie:

```
• [fetch] /api/transcript?url=... 200
• [aiBadge] AI · online online
• [fetch] /api/transform 502
• [fetch.body] <!DOCTYPE html> ... Cloudflare error page
• [urlError.changed] The string did not match the expected pattern. flex
```

Harness: `/tmp/wkrepro.swift` (WKWebView + przechwycenie `fetch`/`window.onerror`/`unhandledrejection`).

---

## Przyczyna źródłowa

### Warstwa 1 — skąd pochodzi komunikat (zidentyfikowane w systemie)

String znaleziony w `dyld_shared_cache_arm64e.01` → to **WebKit `DOMException`**, nie nasz kod:

```
SyntaxError
The string did not match the expected pattern.
```

### Warstwa 2 — co go wywołuje (zweryfikowane eksperymentalnie)

W WebKit operacja `Response.json()` na ciele, które **nie jest JSON-em**, rzuca `DOMException SyntaxError` z dokładnie tym komunikatem. Dowód (`/tmp/wkdecision.swift`):

```
Response(text/plain 'error code: 502').json()  ==>  name=SyntaxError | message="The string did not match the expected pattern."
Response(text/html Cloudflare).json()          ==>  name=SyntaxError | message="The string did not match the expected pattern."
JSON.parse('error code: 502')                  ==>  name=SyntaxError | message="JSON Parse error: Unexpected identifier \"error\""   ← INNY komunikat
```

**Kluczowe rozróżnienie:** `JSON.parse()` daje inny komunikat niż `Response.json()`. Skoro użytkownik widział wersję z „expected pattern", wywołanie musiało przejść przez `Response.json()` — czyli kod w `index.html`:

```js
const data = await res.json();          // ← rzuca DOMException przy nie-JSON ciele
if (!res.ok) throw new Error(data.error || 'Failed to fetch transcript.');
```

Gdy backend zwracał **Cloudflare 502** (`error code: 502`, `text/plain`), `res.json()` rzucało **przed** sprawdzeniem `res.ok`, a surowy komunikat DOMException trafiał do `setError()` i wyświetlał się użytkownikowi.

### Warstwa 3 — dlaczego backend zwracał 502 (przyczyna operacyjna)

1. **Mistral wyczerpany.** Konto Mistral zwraca `429 Rate limit exceeded` z nagłówkiem `x-ratelimit-limit-req-minute: 0` — limit minutowy wynosi **zero**. To nie chwilowy throttling, lecz stan konta/planu. Weryfikacja: `curl https://api.mistral.ai/v1/chat/completions` → `429` (zarówno z Maca, jak i z Lenovo, i po odczekaniu).

2. **Fallback oMLX był martwy.** Lenovo `.env` miał:
   ```
   OMLX_URL=http://127.0.0.1:8585     ← oMLX NIE działa na Lenovo
   LLM_PROVIDER_FALLBACK=omlx
   ```
   oMLX działa na **Macu** (`100.127.3.65:8585` via Tailscale), nie na Lenovo. Fallback wskazywał na własny, pusty port → `fetch failed` → `FALLBACK_OPEN` bez zdrowego providera → **503/502**.

3. **Wynik:** request do `/api/transform` kończył się błędem, a gdy Cloudflare/Tunnel zwracał nie-JSON stronę błędu, frontend pokazywał mylący komunikat WebKit.

---

## Dowód A/B (ten sam harness, stara vs nowa wersja)

| Wersja | Komunikat w UI | Wyciek surowego błędu parsera |
|---|---|---|
| **Stara** (`index.html` przed fixem) | `The string did not match the expected pattern.` | ✅ TAK (dokładnie błąd użytkownika) |
| **Nowa** (po fixie) | `AI service error (HTTP 502). Try again in a moment.` | ❌ NIE |

Harness: `/tmp/wkverify4.swift` (stara wersja na :4001, nowa na :4000), z przechwyceniem `/api/transform` → symulowany Cloudflare 502 `text/plain`.

---

## Fix

### 1. Frontend — bezpieczne czytanie odpowiedzi (`index.html`)

Dodano dwie funkcje pomocnicze:

```js
async function readJsonSafe(res) {
  const raw = await res.text().catch(() => '');
  try { return { data: raw ? JSON.parse(raw) : {}, parsed: true }; }
  catch (_) { return { data: null, parsed: false }; }
}

function failureMessage(res, data, parsed, kind) {
  if (parsed && data) {
    const msg = data.error || data.message;
    if (msg) return msg;
  }
  if (kind === 'transcript') return `Could not fetch the transcript (HTTP ${res.status}). Check the link and try again.`;
  if (kind === 'tts') return `Audio generation failed (HTTP ${res.status}). Try again in a moment.`;
  return `AI service error (HTTP ${res.status}). Try again in a moment.`;
}
```

Zastosowano we **wszystkich** miejscach, gdzie `res.json()` mógł wyciec jako komunikat UI:
- `/api/transcript` (`doFetch`)
- `/api/transform` (`doTransform`) — w tym gałąź 429
- `/api/tts` (`doTtsGenerate`)
- `/api/health` (`probeHealth`) — dodatkowo `!parsed` traktowane jak offline

### 2. Backend — naprawa martwego fallbacku (Lenovo `.env`)

```diff
- OMLX_URL=http://127.0.0.1:8585
+ OMLX_URL=http://100.127.3.65:8585
```

oMLX na Macu jest osiągalny z Lenovo przez Tailscale (zweryfikowane: `GET /v1/models` → 200, `POST /v1/chat/completions` → 200 w 8,7 s).

---

## Weryfikacja

### Backend (publiczny endpoint)
```
POST /api/transform (2 snippety)  → 200, provider=oMLX, t=11.3s / 1.3s / 3.2s
POST /api/transform (393 snippety, pełny transkrypt) → 200, t=63.9s, size=15049
GET  /api/health                  → 200, provider=oMLX, state=PRIMARY/FALLBACK
```

### Frontend (WebKit, silnik Safari)
```
LEAKED_RAW_PARSER_MSG: false
errorMessage: "AI service error (HTTP 502). Try again in a moment."
```

### Serwowanie fixu
```
https://yttranscript.radoslaw-pleskot.com/  → readJsonSafe × 5, failureMessage × 4
http://localhost:4000/                      → readJsonSafe × 5, failureMessage × 4
```

---

## Rollback

| Środowisko | Ścieżka rollbacku |
|---|---|
| Mac | `/Users/radek/Documents/Projects/yt-transcript/.backups/json-error-fix-20260914-052645/` (`index.html`, `server.js`) |
| Lenovo | `/srv/storage/AI_Projects/yt-transcript/.backups/json-error-fix-20260914-055204/` (`index.html`, `.env`) |
| Lenovo `.env` | `.env.backup-pre-omlx-tailscale-20260914-055506` |

---

## Ryzyka i działania następcze

1. **Mistral ma limit 0/min** — konto wymaga weryfikacji planu lub zmiany primary providera. Obecnie cały ruch idzie przez fallback oMLX (Mac via Tailscale). Jeśli Mac będzie wyłączony, usługa padnie.
   → **Zalecenie:** skonfigurować drugi niezależny fallback (np. Groq z kluczem API) albo podnieść plan Mistral.

2. **oMLX tylko na Macu** — pojedynczy punkt awarii dla publicznej usługi.
   → **Zalecenie:** rozważyć lokalny model na Lenovo albo provider chmurowy jako primary.

3. **`/api/health` na Lenovo raportował „ok"** mimo że transform zwracał 503. Health sprawdza tylko `/v1/models` Mistrala (który odpowiada 200), nie sprawdza realnej zdolności do czatu (limit 0/min).
   → **Zalecenie:** rozszerzyć health o realny probe czatu (lub o sprawdzenie nagłówka rate-limit).

---

## Artefakty

- `/tmp/wkrepro.swift` — harness reprodukcji na publicznej stronie
- `/tmp/wkdecision.swift` — izolacja mechanizmu (`Response.json()` vs `JSON.parse`)
- `/tmp/wkverify4.swift` — harness weryfikacji A/B (stara vs nowa)
- `/tmp/wkverify_pub.swift` — E2E na publicznej stronie (realny, bez przechwytywania)
