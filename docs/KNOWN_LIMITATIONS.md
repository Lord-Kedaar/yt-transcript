# ytTranscript — Known Limitations

> Honest list of things that don't work, work partially, or are deferred
> to a future session. Last updated 2026-06-12.

## Functional limitations

1. **Piper TTS is dead code in production**
   The `/api/tts` endpoint is implemented and works when the Piper binary
   is installed at the default path, but the binary itself was removed
   from this machine. The endpoint returns 503 with a hint; the UI shows
   the error in console but does not break. To re-enable: install Piper
   (e.g. `pip install piper-tts` into the hermes venv) and verify
   `PIPER_BIN` points to it.

2. **No transcript upload** — only YouTube URLs. No VTT/SRT paste,
   no local file. Out of scope for the current iteration.

3. **No transcript editor** — the user cannot fix incorrect segments
   in the raw transcript before sending to LLM.

4. **Model name is hardcoded in `.env.example`** — `gemma-4-12b-it-nvfp4`.
   Switching to a different model is a `.env` edit and a server restart.
   No in-app model picker.

5. **No video title fetch in some edge cases** — `fetchVideoTitle`
   retries twice then falls back to `Video <id>`. Works for the vast
   majority of public YouTube URLs.

6. **16 MB request body limit** — large reconstructed transcripts may
   fail at the JSON parse boundary. If this becomes a real bottleneck,
   raise to 32 MB or stream.

7. **In-memory cache** — restarting the server clears the cache. There
   is no persistence layer.

## Non-functional limitations

8. **Single-machine scope** — no multi-user, no auth, no sessions.
   One human runs it; the URL is shared only over Tailscale or
   Cloudflare Tunnel (in that order of preference).

9. **No internationalization** — UI is English-only; reconstruct prompt
   can translate to Polish when `mode=translate`. No other languages.

10. **No accessibility audit** — the SPA has not been audited against
    WCAG. Keyboard navigation should work; screen reader support
    is untested.

11. **No CI** — tests are run locally via `cd client && npm test`.
    No GitHub Actions, no pre-commit hook, no automated deployment.

12. **No monitoring** — no metrics, no error reporting, no Sentry.
    Server logs are the only observability.

## Provider limitations

13. **Single provider** — oMLX is the only wired provider. The
    `PROVIDER_MATRIX.md` documents a future multi-provider adapter
    (Groq, OpenRouter, Mistral, Ollama Cloud) but it is not
    implemented in this iteration. Adding it requires abstracting
    `chat/completions` into `lib/providers/`.

14. **No streaming response** — `/api/transform` waits for the full
    LLM response before returning. Long transcripts can take 30-60 s.
    Server-Sent Events streaming is the natural next step.

15. **No chunking for the `/api/transform` path** — HEAD had chunked
    reconstruct for >150-snippet inputs; the current M (with retries +
    fallback) does not implement that. Long videos may exceed the
    model's context window. Re-introduce the chunked path if real
    users hit this.

## Public demo limitations (not yet built)

See `PUBLIC_DEMO_PLAN.md`. The short list:
- No subdomain is configured.
- No Turnstile / rate limit.
- No daily / monthly budget guard.
- No input length cap.
- No anonymised logging.

## Performance baseline

- Cold start to first response: ~2 s (build step + Vite warm cache)
- Transcript fetch: 1-3 s typical, 5-8 s on cold YouTube rate-limit
- LLM reconstruct (1500-token transcript): 8-20 s
- LLM summarise (1500-token transcript): 6-15 s
- TTS (when Piper present): 1-3 s per ~100 chars

These figures are from the v3.2 development cycle. New M (oMLX) is
typically faster than v3.2 (LM Studio) on Apple Silicon, but a fresh
benchmark is owed.
