# ytTranscript

YouTube Transcript Extractor + AI Reconstruction — fetch captions from any YouTube video and reconstruct fragmented auto-generated transcripts into readable text using a local LLM.

## What it does

1. **Paste a YouTube URL** → the backend fetches available captions via `youtube-transcript`.
2. **Review raw segments** → timestamped transcript panels with hover/click highlighting.
3. **AI Reconstruct** → sends the fragmented snippets to LM Studio (`qwen3.6-35b-a3b-mlx-nvfp4`) which merges broken-up sentences back into proper paragraphs.
4. **Export** → download as TXT or SRT subtitle files.

## Architecture

```
┌─────────────────┐         ┌──────────────────┐         ┌───────────────┐
│  Browser        │ HTTP    │  Express Server   │ TCP     │  LM Studio    │
│  React + Vite   │◄───────►│  Port 4000       │────────►│  Port 1234    │
│  :3000          │         │                  │         │  qwen3.6-35b  │
└─────────────────┘         └──────────────────┘         └───────────────┘
                                │
                                ▼
                         youtube-transcript
                         (npm package)
```

| Layer | Stack |
|---|---|
| Frontend | React 18 + Vite 5, dark theme CSS |
| Backend | Node.js + Express 4, `youtube-transcript` npm package |
| LLM | LM Studio local server (`localhost:1234`), model `qwen3.6-35b-a3b-mlx-nvfp4` |
| Launch | `manage.sh` (macOS LaunchAgents) or `start.sh` (foreground) |

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
| GET | `/api/health` | Health check — returns `{ status: "ok" }` |
| GET | `/api/transcript?url=<youtube-url>` | Fetch captions for a video |
| POST | `/api/reconstruct` | Reconstruct fragmented text (body: `{ snippets: [...] }`) |

### URLs

| Service | Local | Tailscale |
|---|---|---|
| Frontend (Vite) | `http://localhost:3000` | `http://100.127.3.65:3000` |
| Backend (Express) | `http://localhost:4000` | `http://100.127.3.65:4000` |

## Project structure

```
yt-transcript/
├── server.js                    # Express backend: transcript fetch + LM Studio proxy
├── manage.sh                    # macOS LaunchAgent lifecycle (start/stop/restart/status)
├── start.sh                     # Foreground dev launcher (kills old, starts both)
├── package.json                 # Root: Express + youtube-transcript deps
│
└── client/                      # React frontend (Vite)
    ├── index.html
    ├── vite.config.js           # Dev server :3000, proxy /api → :4000
    ├── package.json
    └── src/
        ├── api.js               # fetchTranscript, exportToTXT/SRT helpers
        ├── App.jsx              # Main app: URL input → transcript → reconstruct → export
        └── components/
            ├── Header.jsx       # Logo + subtitle
            ├── UrlInput.jsx     # URL text field + fetch button
            ├── TranscriptPanel.jsx  # Timestamped segments with highlight
            ├── ReconstructedPanel.jsx # AI-reconstructed text + copy button
            └── ExportButtons.jsx    # TXT / SRT download buttons
```

## Known Issues & TODO

### Critical — must fix

- **[ ] `youtube-transcript` package is unmaintained / broken** — the npm package has known issues with YouTube's updated API. Many videos return "transcript not available" even when captions exist. **Fix needed:** switch to a maintained alternative (e.g., `youtubei.js`, `ytdl-core` with transcript parsing, or a direct YouTube IFrame API approach).
- **[ ] LM Studio dependency is fragile** — the `/api/reconstruct` endpoint hardcodes `localhost:1234`. If LM Studio is not running or the model is unloaded, reconstruction fails silently. **Fix needed:** add a health check before reconstruct, show a clear error in the UI, and make the LM Studio URL configurable (env var or settings).
- **[ ] `qwen3.6-35b` reasoning output cleanup is hacky** — the `cleanReasoningOutput()` function strips thinking-process markers via regex, but this is brittle. Different model versions output different formats. **Fix needed:** use a structured response format (e.g., JSON with explicit `output` field) or switch to a model that doesn't use extended thinking for this task.

### High priority

- **[ ] No caching** — every transcript fetch hits YouTube fresh. Add in-memory or file-based caching by video ID.
- **[ ] No rate-limit handling** — repeated requests to YouTube or LM Studio can get throttled. Add retry logic with exponential backoff.
- **[ ] Build script doesn't work** — `npm run build` in the root runs `cd client && npm install && npm run build` but doesn't serve the built assets. **Fix needed:** either a static-file server in Express or a proper deployment target (Vercel, Netlify, etc.).
- **[ ] No environment configuration** — LM Studio URL, port, and API keys are hardcoded. **Fix needed:** `.env` file support via `dotenv`.
- **[ ] No error boundaries** — React errors crash the whole app. Add `ErrorBoundary` component.

### Medium priority

- **[ ] SRT export uses start+duration instead of start→end** — the `formatSRTTime` call for end time uses `start + duration`, but if segments overlap this can produce incorrect timestamps.
- **[ ] No video thumbnail / metadata display** — only the title is shown. Add thumbnail, duration, view count.
- **[ ] No copy-all for raw transcript** — only the reconstructed text has a copy button.
- **[ ] CSS has duplicate rules** — `.reset-button`, `.export-bar`, `.empty-state`, `.video-info` are defined twice in `main.css`.
- **[ ] No loading state for reconstruction** — the button shows a spinner but no intermediate feedback (e.g., "Analyzing fragments…").
- **[ ] No keyboard shortcuts** — e.g., Enter to submit URL, Escape to reset.

### Low priority / nice-to-have

- **[ ] Dark/light theme toggle** — currently dark-only.
- **[ ] Multi-language support** — UI is English-only; transcript segments don't show detected language.
- **[ ] Shareable links** — generate a URL that pre-fills the YouTube link and auto-fetches.
- **[ ] History / recent searches** — localStorage-based history of fetched videos.
- **[ ] Mobile responsive improvements** — works on mobile but layout is desktop-first.

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
