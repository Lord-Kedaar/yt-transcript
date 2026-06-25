# ytTranscript — Local Setup

> Prereqs, install, run, test, troubleshoot. Dotyczy uruchomienia lokalnego na Macu (port 4000) oraz produkcyjnego na Lenovo (port 4002, ścieżka `/srv/storage/AI_Projects/yt-transcript/`). Szczegóły produkcji w `DEPLOYMENT_LENOVO_LINUX.md`.

## Requirements

| Tool      | Version                         | Why                                        |
| --------- | ------------------------------- | ------------------------------------------ |
| macOS     | 13+ (Apple Silicon recommended) | oMLX is Apple-Silicon-only                 |
| Node.js   | ≥ 20                            | ESM, native `fetch`, `AbortSignal.timeout` |
| oMLX      | latest dev                      | LLM provider (port 8585)                   |
| Piper TTS | optional                        | only needed for `/api/tts`                 |

## Architektura runtime

| Powierzchnia | Ścieżka | Co serwuje |
|---|---|---|
| Mac dev | `/Users/radek/Documents/Projects/yt-transcript/` | root `index.html` (po `npm run build`) — single-file frontend |
| Lenovo production | `/srv/storage/AI_Projects/yt-transcript/` | root `index.html` — single-file frontend (self-contained) |
| Frontend UI | `index.html` (root) | aktywny UI |
| `client/` | Mac only (legacy) | Vite scaffold z innej gałęzi; **NIE** jest używany przez runtime |

Wzorzec `node server.js` serwuje root `index.html` na obu środowiskach. `client/dist/assets/*` to fallback statyczny dla potencjalnych przyszłych refaktorów Vite — dziś nie jest używany przez aktywny UI.

## One-time setup

```bash
# 1. Klonuj lub przejdź do projektu
cd "/Users/radek/Documents/Projects/yt-transcript"

# 2. Zainstaluj zależności root
npm install

# 3. (Opcjonalnie) Zainstaluj zależności klienta Vite — tylko jeśli planujesz prace nad `client/`
cd client && npm install && cd ..

# 4. Utwórz .env
cp .env.example .env
# Edytuj .env jeśli Twój oMLX URL lub model się różni

# 5. Zweryfikuj oMLX (opcjonalne, jeśli używasz lokalnego LLM)
curl -sS "http://127.0.0.1:8585/v1/models" | head -50
```

## Run

```bash
# Preferowany launcher
./manage.sh start

# Alternatywnie
npm start

# Zatrzymaj
./manage.sh stop

# Status
./manage.sh status
```

Po uruchomieniu:

- Otwórz <http://localhost:4000>
- Health check: <http://localhost:4000/api/health>

## Test

```bash
# Testy klienta (summary parser + PDF pagination)
cd client && npm test
# Oczekiwane: 2 passed, 0 failed

# Test kontraktu TTS (po deployment)
curl -s -X POST http://localhost:4000/api/tts \
  -H 'Content-Type: application/json' \
  -d '{"type":"reconstruction","language":"pl","text":"To jest test audio."}'
# Oczekiwane: {"audioUrl":"/api/audio/...wav", "language":"pl"}
```

Manual smoke:

1. Wklej `https://www.youtube.com/watch?v=dQw4w9WgXcQ` (lub inny publiczny film z napisami).
2. Kliknij „Extract Transcript" — poczekaj na surowe segmenty.
3. Kliknij „Reconstruct with AI" — wybierz „Reconstruct" (English) lub „Translate" (Polish).
4. Kliknij „Summarize with AI" — ten sam modal.
5. Eksportuj TXT / SRT / PDF / MD przez przyciski panelu.
6. Kliknij „Generate audio" w panelu Rekonstrukcji lub Streszczenia — powinien się pojawić player audio.

## TTS setup (opcjonalny)

```bash
# Instalacja Piper do hermes venv (lub innego venv)
pip install piper-tts

# Zweryfikuj ścieżkę binarki
ls -la /Users/radek/.hermes/hermes-agent/venv/bin/piper

# Zaktualizuj .env jeśli Twoja ścieżka się różni
PIPER_BIN=/absolute/path/to/piper
PIPER_MODELS_DIR=/Users/radek/.hermes/piper-models
```

Modele Piper (PL/EN/DE) są w `/Users/radek/.hermes/piper-models/`. Na produkcji (Lenovo) instaluje się do `/opt/yt-transcript/piper-models/` (szczegóły: `DEPLOYMENT_LENOVO_LINUX.md`).

## Konfiguracja

Wszystko env-driven; zobacz `.env.example`.

- `LLM_PROVIDER` — `groq` | `mistral` | `omlx` | `freellmapi`
- `LLM_PROVIDER_FALLBACK` — comma-separated fallback chain
- `PORT` — default `4000` (Mac), `4002` (Lenovo production)
- `CACHE_TTL_MINUTES` — default 60
- `PIPER_BIN`, `PIPER_MODELS_DIR` (opcjonalne)

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Port 4000 already in use | Another instance is running | `./manage.sh stop` |
| `/api/health` returns `degraded` | oMLX is down or unreachable | Start oMLX; check `OMLX_URL` in `.env` |
| `404` on `/api/transcript` | The video has no captions | Try another video |
| `413 Payload Too Large` | Transcript exceeded 16 MB | Raise the limit in `server.js` |
| `502` on `/api/transform` | LLM provider rejected the request | Check provider logs; cascade may have tried 3 models |
| Build recovery page shows | `client/dist/` is empty | `npm run build` then restart |
| `/api/tts` returns 503 | Piper binary not installed | Install Piper or ignore — TTS is optional |
| `/api/tts` returns `Invalid audio source...` | Frontend sends wrong `type` enum | Build does not match server `ALLOWED_TTS_TYPES` — verify both reference the same enum |
| `Error: Cannot find module` | `node_modules` out of sync | `npm install` in both root and `client/` |
