# ytTranscript

YouTube Transcript Extractor + AI Reconstruction — fetch captions from any YouTube video and reconstruct fragmented auto-generated transcripts into readable text using a local LLM.

## What it does

1. **Paste a YouTube URL** → the backend fetches available captions via `youtube-transcript-plus`.
2. **Review raw segments** → timestamped transcript panels with hover/click highlighting.
3. **AI Reconstruct** → sends the fragmented snippets to LM Studio which merges broken-up sentences back into readable paragraphs.
4. **AI Summarize** → generates comprehensive, detailed bullet-point summaries covering all major themes.
5. **Export** → download as TXT or SRT subtitle files.

## Architecture

```
┌─────────────────┐         ┌──────────────────┐         ┌───────────────┐
│  Browser        │ HTTP    │  Express Server   │ TCP     │  LM Studio    │
│  React + Vite   │◄───────►│  Port 4000       │────────►│  Port 1234    │
│  :3000          │         │                  │         │  bielik-11b    │
└─────────────────┘         └──────────────────┘         └───────────────┘
                                │
                                ▼
                         youtube-transcript
                         (npm package)
```

| Layer | Stack |
|---|---|---|
| Frontend | React 18 + Vite 5, dark theme CSS |
| Backend | Node.js + Express 4, `youtube-transcript-plus` npm package |
| LLM | LM Studio local server (`localhost:1234`), configurable model via `.env` (default: `bielik-11b-v3.0-mlx`) |
| Cache | In-memory Map with TTL |
| Launch | `manage.sh` (nohup-based start/stop/restart/status) or `start.sh` (foreground dev) |

## Quickstart

### Prerequisites

- **Node.js** 18+ (nvm recommended)
- **LM Studio** running locally with `qwen3.6-35b-a3b-mlx-nvfp4` loaded at `http://localhost:1234`

### Install & Run

```bash
cd /Users/radek/yt-transcript

# Install dependencies
npm install          # root (Express server)
cd client && npm install   # frontend (Vite + React)

# Option A: foreground (development)
cd .. && bash start.sh

# Option B: background via LaunchAgents
chmod +x manage.sh
./manage.sh start
```

### Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Health check + LM Studio connection status |
| GET | `/api/lm-status` | LM Studio model list and load status |
| GET | `/api/transcript?url=<youtube-url>` | Fetch captions for a video (cached) |
| POST | `/api/reconstruct` | Reconstruct fragmented text into readable paragraphs |
| POST | `/api/summarize` | Generate comprehensive bullet-point summary of the transcript |

### URLs

| Service | Local | Tailscale |
|---|---|---|
| Frontend (Vite) | `http://localhost:3000` | `http://100.127.3.65:3000` |
| Backend (Express) | `http://localhost:4000` | `http://100.127.3.65:4000` |

## Project structure

```
yt-transcript/
├── server.js                    # Express backend: transcript fetch + LM Studio proxy
├── manage.sh                    # nohup-based service manager (start/stop/restart/status)
├── start.sh                     # Foreground dev launcher (kills old, starts both)
├── package.json                 # Root: Express + youtube-transcript deps
│
└── client/                      # React frontend (Vite)
    ├── index.html
    ├── vite.config.js           # Dev server :3000, proxy /api → :4000
    ├── package.json
    └── src/
        ├── api.js               # fetchTranscript, exportToTXT/SRT helpers
        ├── App.jsx              # Main app: URL input → transcript → reconstruct → summarize → export
        └── components/
            ├── Header.jsx       # Logo + subtitle
            ├── UrlInput.jsx     # URL text field + fetch button
            ├── TranscriptPanel.jsx  # Timestamped segments with highlight
            ├── ReconstructedPanel.jsx # AI-reconstructed text + copy button
            └── ExportButtons.jsx    # TXT / SRT download buttons
```

## Known Issues & TODO

### Fixed in this update

- **[x] `youtube-transcript` package broken** → replaced with `youtube-transcript-plus` v2
- **[x] LM Studio dependency fragile** → health check endpoint, configurable URL/model, timeout handling
- **[x] `cleanReasoningOutput()` regex hack** → replaced with structured JSON output from LM Studio
- **[x] No caching** → in-memory cache with TTL for transcripts and reconstructions
- **[x] Build output not served** → Express static serving for `client/dist` + SPA catch-all
- **[x] No environment configuration** → `.env` file support via `dotenv`
- **[x] SRT export timestamp overlap** → uses next segment start as end time
- **[x] CSS duplicate rules** — `.reset-button`, `.export-bar`, `.empty-state`, `.video-info` deduplicated

### Still open

- **[ ] No error boundaries** — React errors crash the whole app. Add `ErrorBoundary` component.
- **[ ] No video thumbnail / metadata display** — only title is shown. Add thumbnail, duration, view count.
- **[ ] No copy-all for raw transcript** — only reconstructed text has a copy button.
- **[ ] No loading state for reconstruction** — only spinner, no intermediate feedback.
- **[ ] No keyboard shortcuts** — e.g. Enter to submit URL (partial: Enter works via form), Escape to reset.

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
| "LM Studio returned an error" / 502 on reconstruct | LM Studio not running or model unloaded | Start LM Studio, load `qwen3.6-35b-a3b-mlx-nvfp4`, retry |
| "Could not connect to LM Studio" | Wrong URL or port | Check `LM_STUDIO_URL` in `server.js`, verify `localhost:1234` |
| Frontend doesn't load after `npm run build` | Express doesn't serve static files | Add `app.use(express.static(path.join(__dirname, 'client/dist')))` to server.js |
| Port already in use | Previous instance still running | `lsof -ti:3000 | xargs kill` / `lsof -ti:4000 | xargs kill` |

## License

Private / personal project.
