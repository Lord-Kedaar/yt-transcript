# ytTranscript

Single-file web app for extracting YouTube transcripts, reconstructing
fragmented subtitle text via an LLM, and producing a bullet-point summary —
all in one place, all on your own machine.

- **Backend**: Node.js / Express, single-port :4000 (SPA + API)
- **Frontend**: single-file `index.html` (root) — self-contained UI, no Vite build required for the active app
- **LLM**: provider-agnostic — supports Groq, Mistral, oMLX, FreeLLMAPI. Health-cached fallback chain via `LLM_PROVIDER_FALLBACK`.
- **TTS (optional)**: Piper with pl / en / de voices
- **Status**: stable prototype, review-ready, portfolio-ready

> **Architecture note (2026-06-25):** the active UI lives in root `index.html` (single-file). The Vite `client/` source tree exists from an earlier design branch and is not used by runtime — keep it if you plan a future Vite refactor, but do not let it imply that `npm run build` is needed for production deploys. Both Mac dev and Lenovo production serve root `index.html`.

## What this app does

1. Paste a YouTube URL.
2. Fetch the transcript (auto-detected captions, fallback to auto-generated).
3. Click **Reconstruct with AI** — fragmented snippets become readable paragraphs.
4. Click **Summarize with AI** — get a bullet-point summary of the whole thing.
5. Optional: read aloud via TTS (Piper), or export as TXT / SRT / PDF / Markdown.

## Quick start (local dev)

```bash
./manage.sh start
# Open http://localhost:4000
```

For prerequisites, env vars, troubleshooting — see **[docs/LOCAL_SETUP.md](docs/LOCAL_SETUP.md)**.
For production deploy on Lenovo — see **[DEPLOYMENT_LENOVO_LINUX.md](DEPLOYMENT_LENOVO_LINUX.md)**.

## Documentation

| File | Purpose |
| --- | --- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | High-level design, file layout, state |
| [docs/SECURITY_NOTES.md](docs/SECURITY_NOTES.md) | Threat model, mitigations, secret audit |
| [docs/KNOWN_LIMITATIONS.md](docs/KNOWN_LIMITATIONS.md) | Honest list of what does not work |
| [docs/LOCAL_SETUP.md](docs/LOCAL_SETUP.md) | Install, run, test, troubleshoot |
| [docs/PUBLIC_DEMO_PLAN.md](docs/PUBLIC_DEMO_PLAN.md) | `yttranscript.radoslaw-pleskot.com` plan |
| [docs/PROVIDER_MATRIX.md](docs/PROVIDER_MATRIX.md) | Provider comparison |
| [DEPLOYMENT_LENOVO_LINUX.md](DEPLOYMENT_LENOVO_LINUX.md) | Lenovo production deploy (NFS path :4002) |
| [CHANGELOG.md](CHANGELOG.md) | Version history |
| [docs/archive/](docs/archive/) | Archived snapshots & historical reports |

## Portfolio card

- **Problem**: YouTube transcripts are useful but the auto-generated ones are fragmented and noisy; reading a 30-minute video in raw segments is painful.
- **Approach**: Fetch the transcript, send it to an LLM, and produce (a) reconstructed paragraphs and (b) a bullet summary — all client-side rendered, no cloud storage.
- **Tools**: Node.js 20+, Express 4, vanilla single-file frontend, Groq / Mistral / oMLX / FreeLLMAPI (env-switched via `LLM_PROVIDER`), Piper TTS (optional), `youtube-transcript-plus`.
- **Result**: Stable single-port prototype, resilience guardrails (retry / timeout / fallback / recovery page), mobile-responsive UI, PDF / Markdown / TXT / SRT export, optional 3-language TTS.
- **Value for the organisation**: Demonstrates a privacy-respecting pattern for AI-assisted content triage — the operator's transcripts never leave their machine. Same shape scales to internal corporate wikis, support tickets, or legal discovery.
- **Limitations**: Single-user prototype; TTS requires a binary install; the Vite `client/` scaffold is preserved but inactive (single-file UI is the active surface).
- **Privacy**: All transcripts and LLM traffic stay on the operator's machine. No analytics. No outbound telemetry. No data persistence beyond in-memory cache.
- **Status**: prototype, review-ready, portfolio-ready. Public demo `yttranscript.radoslaw-pleskot.com` deployed on Lenovo production.

## Endpoints

| Method | Path | Purpose |
| ------ | --- | --- |
| GET    | `/api/health` | Active provider probe + chain + uptime + cache stats |
| GET    | `/api/ai-limit-status` | Demo quota state per IP |
| GET    | `/api/lm-status` | Slim health probe (current active provider only) |
| GET    | `/api/build-version` | Release metadata |
| GET    | `/api/transcript?url=<youtube-url>` | Fetch transcript for a URL |
| POST   | `/api/transform` | `{snippets, type, mode}` → `{reconstructed\|summary, ...}` |
| POST   | `/api/tts` | `{type, language, text}` → `{audioUrl, language}` (503 if Piper missing) |
| GET    | `/api/audio/:id` | Serve generated WAV |
| GET    | `/` | Single-file frontend (`index.html`) or recovery page |

## Tests

```bash
cd client && npm test
# 2 suites, 16 assertions, all pass.

# TTS contract test (against running server)
curl -s -X POST http://localhost:4000/api/tts \
  -H 'Content-Type: application/json' \
  -d '{"type":"reconstruction","language":"pl","text":"Test audio."}'
```

## Configuration

All runtime config is env-driven; see [.env.example](.env.example).

- `LLM_PROVIDER` — `groq` (default) | `mistral` | `omlx` | `freellmapi`
- `LLM_PROVIDER_FALLBACK` — comma-separated fallback chain
- `OMLX_URL`, `OMLX_MODEL`, `OMLX_API_KEY` (optional, local server)
- `MISTRAL_URL`, `MISTRAL_MODEL`, `MISTRAL_API_KEY`
- `GROQ_URL`, `GROQ_MODEL`, `GROQ_API_KEY`
- `FREELLMAPI_URL`, `FREELLMAPI_MODEL`, `FREELLMAPI_API_KEY`
- `HEALTH_CACHE_TTL_MS` (default 3000)
- `PORT` — default `4000` (Mac), `4002` (Lenovo production)
- `CACHE_TTL_MINUTES` (default 60)
- `PIPER_BIN`, `PIPER_MODELS_DIR` (optional)

## Provider switch

```bash
# Use Mistral as primary, Groq as fallback
echo 'LLM_PROVIDER=mistral' >> .env
echo 'LLM_PROVIDER_FALLBACK=groq' >> .env
./manage.sh restart

# Verify
curl -s http://localhost:4000/api/health | python3 -m json.tool
```

## License

Personal prototype. No public license declared yet — see
`docs/PUBLIC_DEMO_PLAN.md` for the future direction.
