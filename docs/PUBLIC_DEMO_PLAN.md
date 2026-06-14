# ytTranscript — Public Demo Plan (not yet deployed)

> Plan only. **Do not deploy without explicit user approval.**
> Subdomain target: `transcript.radoslaw-pleskot.com`

## What this plan covers

A constrained public version of the app suitable for sharing a single
URL with recruiters, friends, or the public. The goal is to demonstrate
the product without burning the operator's oMLX context or leaking
private data.

## Target constraints

- **Subdomain**: `transcript.radoslaw-pleskot.com` (Cloudflare Tunnel)
- **Input length**: hard cap on transcript text size (≈ 50 000 chars)
- **Uploads**: disabled in MVP; or extremely restrictive (1 file, 1 MB, .vtt only)
- **Provider**: separate from operator's primary key; per-IP daily budget
- **Rate limit**: 5 requests / minute / IP, 50 / day / IP
- **Token limit**: 4096 per request, 16 000 per IP / day
- **Logging**: anonymised IP hash, no transcript text, no summary text
- **Auth**: Cloudflare Turnstile (no-login MVP)
- **Fallback**: 503 with "Try again later" if budget exhausted
- **Rollback**: one env var flips back to private mode (no public route)

## Architecture additions vs the local prototype

```
Browser → Cloudflare edge (Turnstile, rate limit) → Tunnel
       → Frontend (Cloudflare Pages) — identical to local build
       → /api/* → public backend on a different port (e.g. 4100)
                → Groq API (LLM, with daily budget)
                → no Piper TTS in MVP
```

The public backend is a thin wrapper around the same `server.js` with:

- `ENABLE_TTS=false`
- `PROVIDER=groq` (after multi-provider adapter is built)
- `RATE_LIMIT_PER_MIN=5`
- `DAILY_BUDGET_TOKENS=16000`
- `LOG_LEVEL=warn` (no info logs)
- `DISABLE_TRANSCRIPT_STORE=true` (in-memory only, evicted after response)

## Provider choice (recap; see PROVIDER_MATRIX.md)

| Need               | Provider       | Reason                    |
| ------------------ | -------------- | ------------------------- |
| LLM in public demo | Groq (planned) | 840 tok/s, lowest cost    |
| LLM in private     | local oMLX     | zero cost, zero egress    |
| TTS in public demo | skip           | not worth the cost in MVP |

## What we will NOT deploy until further notice

- File upload (drag-and-drop VTT/SRT)
- Long-form videos (>30 min)
- Multiple concurrent users per IP
- Per-user accounts / sessions
- Custom system prompt injection
- Public rate-limit bypass (no "API key for trusted users" yet)

## Open questions for the user (before any deploy)

1. **Do you want Groq as the public provider?** (Need API key + decision
   on spend ceiling.)
2. **Daily budget cap?** (Groq free tier vs paid tier vs $5/day.)
3. **Turnstile vs hCaptcha?** (Both have free tiers; Turnstile is
   less intrusive for low-traffic sites.)
4. **Custom domain branding** (favicon, colors, footer credit)?
5. **Logging retention?** (24h? 7d? Never? Affects Cloudflare logpush cost.)

## Rollback plan

If the public demo misbehaves:

1. Set `PUBLIC_DEMO_ENABLED=false` in `.env`.
2. Restart the public backend — the route is no longer served.
3. Optionally tear down the Cloudflare Tunnel via the dashboard.

Estimated rollback time: < 2 minutes.
