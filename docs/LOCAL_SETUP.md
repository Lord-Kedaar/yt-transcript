# ytTranscript — Local Setup

> Prereqs, install, run, test, troubleshoot.

## Requirements

| Tool      | Version                         | Why                                        |
| --------- | ------------------------------- | ------------------------------------------ |
| macOS     | 13+ (Apple Silicon recommended) | oMLX is Apple-Silicon-only                 |
| Node.js   | ≥ 20                            | ESM, native `fetch`, `AbortSignal.timeout` |
| oMLX      | latest dev                      | LLM provider (port 8585)                   |
| Piper TTS | optional                        | only needed for `/api/tts`                 |

## One-time setup

```bash
# 1. Clone or navigate to the project
cd "/Users/radek/Documents/Projects/yt-transcript"

# 2. Install root deps
npm install

# 3. Install client deps
cd client && npm install && cd ..

# 4. Create your env file
cp .env.example .env
# Edit .env if your oMLX URL or model name differs

# 5. Verify oMLX is reachable
curl -sS "http://127.0.0.1:8585/v1/models" | head -50
# You should see a JSON list of loaded models.
```

## Run

```bash
# Preferred launcher
./manage.sh start

# Or directly
npm start

# Stop
./manage.sh stop

# Status
./manage.sh status
```

After start:

- Open <http://localhost:4000>
- Health check: <http://localhost:4000/api/health>

## Test

```bash
# Client unit tests (summary parser + PDF pagination)
cd client && npm test
# Expected: 2 passed, 0 failed (16 assertions across 2 suites)
```

Manual smoke:

1. Paste `https://www.youtube.com/watch?v=dQw4w9WgXcQ` (or any public video
   with captions) into the input.
2. Click "Extract Transcript" — wait for raw segments to load.
3. Click "Reconstruct with AI" — choose "Reconstruct" (English) or
   "Translate" (Polish).
4. Click "Summarize with AI" — same modal.
5. Export TXT / SRT / PDF / MD via the panel header buttons.

## TTS setup (optional)

```bash
# Install Piper into the hermes venv (or any venv)
pip install piper-tts

# Verify the binary path
ls -la /Users/radek/.hermes/hermes-agent/venv/bin/piper

# Update .env if your path differs
PIPER_BIN=/absolute/path/to/piper
PIPER_MODELS_DIR=/Users/radek/.hermes/piper-models
```

## Troubleshooting

| Symptom                          | Likely cause                | Fix                                                  |
| -------------------------------- | --------------------------- | ---------------------------------------------------- |
| Port 4000 already in use         | Another instance is running | `./manage.sh stop`                                   |
| `/api/health` returns `degraded` | oMLX is down or unreachable | Start oMLX; check `OMLX_URL` in `.env`               |
| `404` on `/api/transcript`       | The video has no captions   | Try another video                                    |
| `413 Payload Too Large`          | Transcript exceeded 16 MB   | Raise the limit in `server.js`                       |
| `502` on `/api/transform`        | oMLX rejected the request   | Check oMLX logs; the cascade may have tried 3 models |
| Build recovery page shows        | `client/dist/` is empty     | `npm run build` then restart                         |
| `/api/tts` returns 503           | Piper binary not installed  | Install Piper or ignore — TTS is optional            |
| `Error: Cannot find module`      | `node_modules` out of sync  | `npm install` in both root and `client/`             |
