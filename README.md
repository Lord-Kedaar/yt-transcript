# ytTranscript

YouTube Transcript Extractor + AI Reconstruction — fetch captions from any YouTube video and reconstruct fragmented auto-generated transcripts into readable text using a local LLM.

## What it does

1. **Paste a YouTube URL** → the backend fetches available captions via `youtube-transcript-plus`.
2. **Review raw segments** → timestamped transcript panels with hover/click highlighting.
3. **AI Reconstruct** → sends the fragmented snippets to LM Studio which merges broken-up sentences back into readable paragraphs.
4. **AI Summarize** — generates structured sections with **bold headers** and paragraphs, covering all major themes with styled markdown emphasis (bold / italic) rendered natively.
5. **Export** — download as TXT, MD, or paginated PDF. PDF export renders one white A4 page canvas per PDF page to avoid page-boundary clipping/duplication while preserving Polish glyphs.

## Architecture

```
┌─────────────────┐         ┌──────────────────┐         ┌───────────────┐
│  Browser        │ HTTP    │  Express Server  │ TCP     │  LM Studio    │
│  React + Vite   │  ◄──►   │  Port 4000       │  ───►   │  Port 1234    │
│  (SPA served    │         │  Serves client/  │         │  bielik-11b      │
│   by Express)   │         │  dist/ + API     │         │  via LM Studio   │
└─────────────────┘         └──────────────────┘         └───────────────┘
                                │
                                ▼
                         youtube-transcript-plus
```

| Layer | Stack |
|---|---|
| Frontend | React 18 + Vite 5 (build → static assets), dark theme CSS |
| Backend | Node.js + Express 4, `youtube-transcript-plus` npm package |
| LLM     | LM Studio local server (`localhost:1234`), configurable model via `.env` (default: `bielik-11b-v3.0-mlx`) |
| Cache | In-memory Map with TTL |
| Launch | `manage.sh` (nohup-based start/stop/restart/status); Vite dev on `:3000` is disabled |

## Quickstart

### Prerequisites

- **Node.js** 18+ (nvm recommended)
- **LM Studio** running locally with a model loaded at `http://localhost:1234`

### Install & Run

```bash
cd /Users/radek/yt-transcript

# Install dependencies
npm install          # root (Express server)
cd client && npm install   # frontend (Vite + React)

# Build frontend (required — Express serves dist/, not Vite dev server)
cd .. && npm run build --prefix client

# Start / restart the single-port app
chmod +x manage.sh
./manage.sh restart
```

Access the app at **http://localhost:4000**.

> `npm run dev`, `npm run dev:client`, and `start-frontend.sh` intentionally do **not** start Vite. Port `:3000` is disabled to prevent stale Vite/HMR output diverging from the production `:4000` build.

### Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Health check + LM Studio connection status |
| GET | `/api/lm-status` | LM Studio model list and load status |
| GET | `/api/build-version` | Current frontend build timestamp/SHA served by Express |
| GET | `/api/transcript?url=<youtube-url>` | Fetch captions for a video (cached) |
| POST | `/api/transform` | Reconstruct or summarize transcript snippets via local LLM |

**`/api/transform` request body:**
```json
{
  "snippets": [{"text":"...","start":0,"duration":5}, ...],
  "type": "reconstruct" | "summarize",
  "mode": "original" | "translate"
}
```

**`/api/transform` response:**
```json
{
  "reconstructed": "..." // when type = "reconstruct"
  // or "summary": "..." when type = "summarize"
}
```

### URLs

| Service | Address |
|---|---|
| App (SPA + API) | `http://localhost:4000` |
| Tailscale | `http://100.127.3.65:4000` |

## Project structure

```
yt-transcript/
├── server.js                    # Express backend: transcript fetch + LM Studio proxy + static SPA serving
├── manage.sh                    # nohup-based service manager (start/stop/restart/status)
├── start.sh                     # Foreground launcher (kills old, builds, starts Express)
├── start-frontend.sh            # Disabled: prints single-port workflow warning, does not start Vite :3000
├── package.json                 # Root: Express + youtube-transcript deps
│
└── client/                      # React frontend (Vite → build → dist/)
    ├── index.html
    ├── vite.config.js           # Development only; production uses static build
    ├── package.json
    ├── scripts/
    │   ├── dev-disabled.mjs          # Blocks accidental Vite dev server usage
    │   ├── test-summary-parser.mjs   # Regression tests for Bielik summary parsing
    │   └── test-pdf-pagination.mjs   # Regression tests for block-level PDF pagination
    └── src/
        ├── api.js               # fetchTranscript, exportToTXT/SRT helpers
        ├── buildInfo.js         # Stable BUILD_INFO accessor; Vite injects values from vite.config.js
        ├── utils/summaryParser.js # Parses Bielik section formats into intro + sections
        ├── utils/pdfExport.js   # Paginated PDF export: one white A4 canvas per page
        ├── App.jsx              # Main app: URL input → transcript → AI transform → export
        └── components/
            ├── Header.jsx       # Logo + subtitle
            ├── UrlInput.jsx     # URL text field + fetch button
            ├── TranscriptPanel.jsx  # Timestamped segments with highlight
            ├── ReconstructedPanel.jsx # AI-reconstructed text + copy button
            └── ExportButtons.jsx    # TXT / SRT download buttons
```

## Development vs Production

| | Development | Production |
|---|---|---|
| **Port** | `:4000` only | `:4000` only |
| **Frontend** | Express serves `client/dist/` (static) | Express serves `client/dist/` (static) |
| **Hot reload** | Disabled; re-run `npm run build --prefix client` after changes | Same |
| **Vite dev server** | Disabled (`npm run dev` exits with instructions) | Not used |
| **Cache policy** | Express sends `no-store, no-cache` for SPA and assets | Same |
| **Build version** | Visible in UI footer and `/api/build-version` | Same |

> **Note:** Port `:3000` (Vite dev) is disabled. Always access the app via `:4000`. After any frontend change, run `npm run build --prefix client`, then `./manage.sh restart`, then refresh the browser.

## Known Issues & TODO

### Fixed in this update

- **[x] Unified AI endpoint** — merged `/api/reconstruct` + `/api/summarize` into single `/api/transform` with `{type, mode}` dispatch
- **[x] Single-port deployment** — Express on `:4000` serves both SPA (`client/dist/`) and API. Vite dev server on `:3000` is disabled in normal workflow.
- **[x] Stale Safari/Vite cache mitigation** — Express serves SPA/assets with `no-store, no-cache`; frontend build writes a visible build footer and `/api/build-version` artifact.
- **[x] Bielik numbered-section parser** — `summaryParser.js` converts `1) Header: paragraph 2) Header: paragraph`, `**Header:**`, and `1) **Header:**` output into semantic sections; covered by `npm run test:summary-parser --prefix client`.
- **[x] PDF page-boundary clipping/duplication** — `pdfExport.js` replaced the old one-tall-canvas/negative-offset algorithm with block-level pagination and one white A4 canvas per PDF page; covered by `npm run test:pdf-pagination --prefix client`.
- **[x] `youtube-transcript` package broken** → replaced with `youtube-transcript-plus` v2
- **[x] LM Studio dependency fragile** → health check endpoint, configurable URL/model via `.env`, timeout handling
- **[x] `cleanReasoningOutput()` regex hack** → replaced with structured output + shared `REASONING_STRIP_PATTERNS`
- **[x] No caching** → in-memory cache with TTL for transcripts and transformations
- **[x] Build output not served** → Express static serving for `client/dist` + SPA catch-all
- **[x] No environment configuration** → `.env` file support via `dotenv`
- **[x] SRT export timestamp overlap** → uses next segment start as end time
- **[x] CSS duplicate rules** — `.reset-button`, `.export-bar`, `.empty-state`, `.video-info` deduplicated
- **[x] Copy button fails on HTTP/Tailscale** → added `document.execCommand('copy')` fallback via invisible `<textarea>`
- **[x] Reconstruct progress indicator missing** → added live countdown timer
- **[x] "New Transcript" button hidden in panels** → moved to top-level `.reset-bar` above video title
- **[x] AI buttons oversized** → font-size reduced from `1rem` to `0.875rem`

### Still open

- **[ ] No error boundaries** — React errors crash the whole app. Add `ErrorBoundary` component.
- **[ ] No video thumbnail / metadata display** — only title is shown. Add thumbnail, duration, view count.
- **[ ] No copy-all for raw transcript** — only reconstructed/summary text has a copy button.
- **[ ] No keyboard shortcuts** — e.g. Escape to reset, Ctrl+Enter to submit URL.

### Low priority / nice-to-have (unchanged)

- **[ ] Dark/light theme toggle**
- **[ ] Multi-language support**
- **[ ] Shareable links**
- **[ ] History / recent searches**
- **[ ] Mobile responsive improvements**

## Troubleshooting

| Problem | Likely cause | Fix |
|---|---|---|
| "No transcript found" on a video that has captions | `youtube-transcript` package is broken for this video | Switch to alternative library (see Known Issues above) |
| "LM Studio returned an error" / 502 on transform | LM Studio not running or model unloaded | Start LM Studio, load desired model, retry |
| "Could not connect to LM Studio" | Wrong URL or port | Check `LM_STUDIO_URL` in `.env`, verify `localhost:1234` |
| Frontend doesn't load after code changes | Express serves stale `client/dist/` | Re-run `cd client && npm run build`, then refresh browser |
| PDF text is clipped or duplicated at page boundaries | Stale build or old one-canvas PDF algorithm still served | Run `npm run build --prefix client`, restart with `./manage.sh restart`, then verify `/api/build-version` changed |
| Port already in use | Previous instance still running | `lsof -ti:4000 | xargs kill` |

## License

Private / personal project.
