# ytTranscript

Single-port web app for extracting YouTube transcripts, reconstructing
fragmented subtitle text via a local LLM, and producing a bullet-point
summary — all in one place, all on your own machine.

- **Backend**: Node.js / Express, single-port :4000 (SPA + API)
- **Frontend**: React 18 + Vite (built and served from the same port)
- **LLM**: oMLX (Apple-Silicon-native, OpenAI-compatible)
- **TTS (optional)**: Piper with pl / en / de voices
- **Status**: stable prototype, review-ready, portfolio-ready

## What this app does

1. Paste a YouTube URL.
2. Fetch the transcript (auto-detected captions, fallback to auto-generated).
3. Click **Reconstruct with AI** — fragmented snippets become readable paragraphs.
4. Click **Summarize with AI** — get a bullet-point summary of the whole thing.
5. Optional: read aloud via TTS (Piper), or export as TXT / SRT / PDF / Markdown.

## Quick start

```bash
./manage.sh start
# Open http://localhost:4000
```

For prerequisites, env vars, troubleshooting — see **[docs/LOCAL_SETUP.md](docs/LOCAL_SETUP.md)**.

## Documentation

| File | Purpose |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | High-level design, file layout, state |
| [docs/SECURITY_NOTES.md](docs/SECURITY_NOTES.md) | Threat model, mitigations, secret audit |
| [docs/KNOWN_LIMITATIONS.md](docs/KNOWN_LIMITATIONS.md) | Honest list of what does not work |
| [docs/LOCAL_SETUP.md](docs/LOCAL_SETUP.md) | Install, run, test, troubleshoot |
| [docs/PUBLIC_DEMO_PLAN.md](docs/PUBLIC_DEMO_PLAN.md) | `transcript.radoslaw-pleskot.com` plan (not deployed) |
| [docs/PROVIDER_MATRIX.md](docs/PROVIDER_MATRIX.md) | OpenRouter / Groq / Mistral / Ollama Cloud / oMLX comparison |
| [CHANGELOG.md](CHANGELOG.md) | Version history |
| [docs/legacy-server-pre-memory-fallback.js.bak](docs/legacy-server-pre-memory-fallback.js.bak) | Pre-v3.2 server snapshot (for diff archaeology) |

## Portfolio card (standard format)

- **Problem**: YouTube transcripts are useful but the auto-generated ones
  are fragmented and noisy; reading a 30-minute video in raw segments
  is painful.
- **Approach**: Fetch the transcript, send it to a local LLM, and
  produce (a) reconstructed paragraphs and (b) a bullet summary — all
  client-side rendered, no cloud storage.
- **Tools**: Node.js 20, Express 4, React 18, Vite 5, oMLX (local
  OpenAI-compatible server), Piper TTS (optional), `youtube-transcript-plus`.
- **Result**: Stable single-port prototype, resilience guardrails
  (retry / timeout / fallback / recovery page), mobile-responsive UI,
  PDF / Markdown / TXT / SRT export, optional 3-language TTS.
- **Value for the organisation**: Demonstrates a privacy-respecting
  pattern for AI-assisted content triage — the operator's transcripts
  never leave their machine. Same shape scales to internal corporate
  wikis, support tickets, or legal discovery.
- **Limitations**: Single-user local prototype; TTS requires a binary
  install; no model picker in UI; one LLM provider wired (oMLX); the
  chunked reconstruct path from v3.2 is not yet re-introduced in the
  oMLX M build.
- **Privacy**: All transcripts and LLM traffic stay on the operator's
  machine. No analytics. No outbound telemetry. No data persistence
  beyond in-memory cache.
- **Status**: prototype, review-ready, portfolio-ready. Public demo
  not yet deployed (see `docs/PUBLIC_DEMO_PLAN.md`).

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | oMLX probe + uptime + cache stats |
| GET | `/api/build-version` | release metadata |
| GET | `/api/transcript?url=<youtube-url>` | Fetch transcript for a URL |
| POST | `/api/transform` | `{snippets, type, mode}` → `{reconstructed\|summary, ...}` |
| POST | `/api/tts` | `{text, lang}` → `{audioUrl, lang}` (503 if Piper missing) |
| GET | `/api/audio/:id` | Serve generated WAV |
| GET | `/` | SPA (`client/dist/index.html`) or recovery page |

## Tests

```bash
cd client && npm test
# 2 suites, 16 assertions, all pass.
```

## Configuration

All runtime config is env-driven; see [.env.example](.env.example).

- `OMLX_URL`, `OMLX_MODEL`, `OMLX_API_KEY` (optional)
- `PORT` (default 4000)
- `CACHE_TTL_MINUTES` (default 60)
- `PIPER_BIN`, `PIPER_MODELS_DIR` (optional)

## License

Personal prototype. No public license declared yet — see
`docs/PUBLIC_DEMO_PLAN.md` for the future direction.
