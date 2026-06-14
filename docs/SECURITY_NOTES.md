# ytTranscript — Security Notes

> Last review: 2026-06-12. Scope: code, dependencies, env handling.

## Threat model

The app is a personal local prototype. Primary threats:

1. **Accidental secret leakage** in repo or logs.
2. **Path traversal** on the TTS audio cache endpoint.
3. **Bypass of oMLX auth** if the API key is empty.
4. **CSRF** in hypothetical public deployment (not enforced today).
5. **DDoS / cost amplification** if exposed publicly without rate limits.

## Mitigations in place

| Threat | Control | Where |
|---|---|---|
| Secret leakage | `.env` is gitignored, `.env.example` is empty for keys | `.gitignore`, `server.js` line 23 |
| Path traversal on `/api/audio/:id` | id must match `^[A-Za-z0-9-]+$` | `server.js` (TTS section) |
| Missing oMLX key | When `OMLX_API_KEY` is empty, no `Authorization` header is sent (oMLX allows this) | `server.js` transform + probe |
| Crash from oMLX being down | `/api/health` returns `degraded`; `/api/transform` returns 502 | `server.js` |
| Unbounded body size | `express.json({ limit: '16mb' })` | `server.js` |
| CORS | `cors({ origin: '*' })` — open for local use; restrict before public deploy | `server.js` |
| `x-powered-by` | disabled | `server.js` |
| X-Content-Type-Options | `nosniff` on all responses | `server.js` |
| Unhandled exception | logged + clean shutdown (supervisor restart) | `server.js` |

## Findings from 2026-06-12 audit

> ⚠️ **Doc/code drift (corrected 2026-06-14):** the 2026-06-12 review
> claimed the hardcoded fallback was removed, but the code at
> `server.js:23` still contains `|| '0456'`. Moved back to "Still
> present". See audit follow-up plan in `README.md`.

### Resolved

_(none as of 2026-06-14 — entries below were mis-categorized)_

- ~~Hardcoded fallback API key `'0456'` removed (server.js:19)~~ —
  **NOT RESOLVED**, see "Still present" below.

### Still present (acceptable for local prototype)

- **Hardcoded fallback API key `'0456'` at `server.js:23`** — the line is
  `const OMLX_API_KEY = process.env.OMLX_API_KEY || process.env.LM_STUDIO_API_KEY || '0456';`.
  Fine for personal local use (matches user's oMLX setup), but must be
  removed before any public/demo deploy. **Planned for removal in
  Phase 1 of the 2026-06-14 audit follow-up plan** (see `README.md`).
- **CORS is `*`** — fine for local dev, would need to be locked to
  `https://transcript.radoslaw-pleskot.com` before any public deploy.
- **No rate limit** on `/api/transform` — a misbehaving client could
  burn through oMLX context. Acceptable locally; would need express-rate-limit
  in public demo (see `PUBLIC_DEMO_PLAN.md`).
- **No CSRF token** — POST endpoints are not protected. Local-only is fine.
- **No log scrubbing** — server logs include error messages that could
  include user input. Low risk for local prototype.

## Secret audit

```bash
# Should return zero results in source code (excluding .env.example and docs):
git grep -nE "(0456|sk-|api[_-]?key.*=.*['\"])" -- server.js client/src/
```

Last secret audit: 2026-06-12. **PASS** — no secrets in tracked source.
The user-side `.env` (gitignored) may contain real keys; that file is
the operator's responsibility.

## Dependency surface

| Package | License | Notes |
|---|---|---|
| `express` | MIT | standard |
| `cors` | MIT | standard |
| `dotenv` | BSD-3-Clause | standard |
| `he` | MIT | HTML entity decoder |
| `youtube-transcript-plus` | MIT | third-party YouTube transcript fetcher |
| `react`, `react-dom` | MIT | frontend |
| `vite`, `@vitejs/plugin-react` | MIT | build |
| `jspdf`, `html2canvas` | MIT | PDF export |
| `@testing-library/*`, `jest` | MIT | tests (yt client) |

No native dependencies. No analytics. No outbound telemetry. No third-party
fonts or CDNs loaded at runtime beyond what's bundled by Vite.

## Logging

Logs go to:
- `console.log` / `console.error` on stdout/stderr (terminal)
- `/tmp/yt-transcript/server.log` and `server.err` when started via `manage.sh`

Logs include error messages, retry attempts, oMLX probe results. They do
NOT include request bodies, transcripts, summaries, or API keys.
