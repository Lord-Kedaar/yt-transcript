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
| Secret leakage | `.env` is gitignored, `.env.example` is empty for keys | `.gitignore`, `server.js` line 19 |
| Path traversal on `/api/audio/:id` | id must match `^[A-Za-z0-9-]+$` | `server.js` (TTS section) |
| Missing oMLX key | When `OMLX_API_KEY` is empty, no `Authorization` header is sent (oMLX allows this) | `server.js` transform + probe |
| Crash from oMLX being down | `/api/health` returns `degraded`; `/api/transform` returns 502 | `server.js` |
| Unbounded body size | `express.json({ limit: '16mb' })` | `server.js` |
| CORS | `cors({ origin: '*' })` — open for local use; restrict before public deploy | `server.js` |
| `x-powered-by` | disabled | `server.js` |
| X-Content-Type-Options | `nosniff` on all responses | `server.js` |
| Unhandled exception | logged + clean shutdown (supervisor restart) | `server.js` |

## Findings from 2026-06-12 audit

### Resolved

- **Hardcoded fallback API key `'0456'` removed** (server.js:19). The
  fallback is now an empty string; users must set `OMLX_API_KEY` in
  `.env` if their oMLX deployment requires auth.

### Still present (acceptable for local prototype)

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
