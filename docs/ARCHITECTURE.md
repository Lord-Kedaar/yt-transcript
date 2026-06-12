# ytTranscript — Architecture

> Single-page web app for extracting YouTube transcripts, reconstructing
> fragmented subtitle text via local LLM, and summarising through the same
> backend.

## High-level diagram

```
┌────────────────────────────────────────────────────────────────┐
│                      Browser (SPA, :4000)                      │
│  React 18 + Vite                                               │
│  - UrlInput                                                    │
│  - TranscriptPanel (raw segments)                              │
│  - ReconstructedPanel (LLM-cleaned paragraphs)                 │
│  - SummaryPanel (LLM bullet summary)                           │
│  - ExportButtons (TXT/SRT)                                     │
│  - useTTS hook (Read Aloud via /api/tts)                       │
└────────────────────────────────────────────────────────────────┘
                              │ HTTP
                              ▼
┌────────────────────────────────────────────────────────────────┐
│               Express server (server.js, :4000)                │
│                                                                │
│  GET  /api/health           - oMLX provider state + limits     │
│  GET  /api/build-version    - release metadata                 │
│  GET  /api/transcript       - YouTube transcript fetch         │
│  POST /api/transform        - LLM reconstruct / summarize      │
│  POST /api/tts              - Piper TTS (optional, graceful)   │
│  GET  /api/audio/:id        - Serve generated WAV              │
│  GET  /                     - SPA recovery / index.html       │
│                                                                │
│  Helpers:                                                      │
│  - withRetry (transient network)                               │
│  - withTimeout (per request)                                   │
│  - isOmlxMemoryPressureError (fallback model cascade)          │
│  - In-memory cache (TTL via CACHE_TTL_MINUTES)                 │
│  - Recovery HTML when build artifacts missing                  │
└────────────────────────────────────────────────────────────────┘
                  │                         │
                  │ fetch                   │ (optional)
                  ▼                         ▼
┌──────────────────────────┐    ┌────────────────────────────┐
│  oMLX (:8585)            │    │  Piper TTS (PIPER_BIN)     │
│  OpenAI-compatible API   │    │  Models in PIPER_MODELS_DIR │
│  gemma-4-12b-it-nvfp4    │    │  pl/en/de voices            │
└──────────────────────────┘    └────────────────────────────┘
```

## Key design decisions

### Single-port (no Vite dev in production)

The app serves the React SPA from the same Express process on port 4000.
Vite dev is intentionally disabled (`scripts/dev-disabled.mjs`).
Rationale: the production-readiness story is simpler when there is exactly
one port to expose via Cloudflare Tunnel.

### oMLX as the default LLM provider

We use oMLX (an Apple-Silicon-native MLX server) instead of LM Studio.
The change happened in v3.x and the legacy `LM_STUDIO_URL` /
`LM_STUDIO_MODEL` / `LM_STUDIO_API_KEY` env vars remain as fallbacks for
backwards compatibility.

### Resilience guardrails (v3.2)

- `npm start` runs `npm run build` first to refresh `build-info.json`.
- `/api/transcript` retries transient network failures (3 attempts).
- `/api/transform` retries transient oMLX failures (2 attempts) and
  cascades to a smaller fallback model on memory pressure.
- `express.json({ limit: '16mb' })` — large transcripts are common.
- If `client/dist/index.html` is missing, the server returns a recovery
  page instead of crashing.
- `process.on('unhandledRejection' | 'uncaughtException')` logs and
  shuts down so the supervisor can restart the process cleanly.

### TTS is optional, not blocking

`/api/tts` returns 503 with a clear hint when the Piper binary is missing.
The frontend `useTTS` hook surfaces the error in console without
breaking the rest of the UI.

## File layout

```
yt-transcript/
├── server.js                  # Express + all API endpoints
├── package.json               # root deps + scripts
├── .env.example               # env template (committed)
├── .gitignore
├── README.md
├── CHANGELOG.md
├── manage.sh                  # start/stop/status (uses /tmp/yt-transcript)
├── start.sh                   # alias for npm start
├── start-frontend.sh          # placeholder; dev mode is disabled
├── scripts/
│   ├── build.js               # writes client/dist/build-info.json
│   └── dev-disabled.mjs       # explicit error when dev is invoked
├── client/                    # React + Vite SPA
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   ├── scripts/
│   │   ├── dev-disabled.mjs
│   │   ├── test-runner.mjs
│   │   ├── test-summary-parser.mjs
│   │   └── test-pdf-pagination.mjs
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── api.js
│       ├── buildInfo.js
│       ├── components/        # Header, UrlInput, TranscriptPanel,
│       │                      # ReconstructedPanel, SummaryPanel,
│       │                      # ExportButtons
│       ├── hooks/             # useTTS
│       ├── utils/             # pdfExport, summaryParser
│       └── styles/main.css
├── docs/                      # this directory
│   ├── ARCHITECTURE.md
│   ├── SECURITY_NOTES.md
│   ├── KNOWN_LIMITATIONS.md
│   ├── LOCAL_SETUP.md
│   ├── PUBLIC_DEMO_PLAN.md
│   ├── PROVIDER_MATRIX.md
│   ├── legacy-server-pre-memory-fallback.js.bak
│   └── screenshots/
└── logs/                      # gitignored; supervisor logs only
```

## State and persistence

- In-memory `Map<string, {value, expires}>` for transcript + transform cache.
- `sessionStorage` for UI state (URL, last transcript, last summary,
  pending AI transform) — survives Safari backgrounding and bfcache.
- `client/dist/build-info.json` for release version + build timestamp.

No data is written to a database. No transcripts are stored on the
server after the response.
