# ADR: Provider Recovery State Machine

**Date:** 2026-07-23
**Status:** Accepted
**Task:** t_fa714581
**Baseline commit:** `1bdce40b11d89e25ce348b7ecd566856f73f03df`

## Context

The RCA (`REPORT_MISTRAL_FALLBACK_ROOT_CAUSE_POST_DEPLOY.md`) identified a sticky-fallback
bug in `buildProviderChain.active()` (server.js:596–619): after a transient Mistral health
failure, the system switched to oMLX and never re-probed Mistral because `active()` only
probed `resolved` (the current provider), not `chain[0]` (the primary). As long as oMLX
was healthy (always, on a local network), the system stayed on the fallback indefinitely.

Mordax review (comment #642 on t_bb0c502c, verdict CONDITIONAL_APPROVE) required:
- A proper state machine (PRIMARY → FALLBACK_OPEN → HALF_OPEN → PRIMARY) with
  monotonic cooldown, bounded backoff/jitter, single-flight probe, and no thundering herd.
- Separation of health failure from chat failure with an explicit error matrix.
- Structured telemetry events for all state transitions.
- Deterministic concurrency tests with fake clock and fake providers.

## Decision

Replace the `buildProviderChain` closure with a dedicated `ProviderStateMachine`
module (`provider-state-machine.js`) that owns:

### States

```
  PRIMARY ──(qualified failure)──► FALLBACK_OPEN
  FALLBACK_OPEN ──(cooldown elapsed)──► HALF_OPEN
  HALF_OPEN ──(probe succeeds)──► PRIMARY
  HALF_OPEN ──(probe fails)──► FALLBACK_OPEN (cooldown extended)
```

| State | Active provider | Description |
|-------|----------------|-------------|
| `PRIMARY` | chain[0] (Mistral) | Normal operation. Requests go to primary. |
| `FALLBACK_OPEN` | chain[1] (oMLX) | Primary failed. All requests go to fallback. Monotonic cooldown with bounded backoff + jitter. |
| `HALF_OPEN` | chain[1] (oMLX) | Cooldown elapsed. Exactly one single-flight probe to primary. All other requests go to fallback. Probe success → PRIMARY. Probe fail → FALLBACK_OPEN with extended cooldown. |

### Error matrix

| Error class | HTTP codes / patterns | Degrades global health? | Triggers fallback? | Sends payload to fallback? |
|---|---|---|---|---|
| transient | timeout, network, 408, 425, 429, 5xx, 529 | Yes (after threshold) | Yes | Yes |
| auth | 401, 403 | Yes (with slow re-probe) | Yes (with alert) | Yes |
| validation | 400, 404, 422, schema | No | No | No |
| contract | malformed/empty response | No | No | No (caller gets error) |

### Telemetry events

All events are structured JSONL via the diagnostics module, correlation by
`probeId` (system probes) or `operationId`/`requestId` (request-scoped).

| Event | When |
|-------|------|
| `provider.health.started` | Before each health probe |
| `provider.health.succeeded` | Health probe returned ok |
| `provider.health.failed` | Health probe returned not-ok |
| `provider.state.transition` | State changes (previous, new, reason, errorClass, latency, cooldown, counters) |
| `provider.chat.failed` | Chat call threw an error |
| `provider.fallback.attempted` | Fallback provider selected for a request |
| `provider.fallback.succeeded` | Fallback chat succeeded |
| `provider.fallback.failed` | Fallback chat failed |
| `provider.recovery.succeeded` | HALF_OPEN probe succeeded → PRIMARY |
| `provider.recovery.failed` | HALF_OPEN probe failed → FALLBACK_OPEN |

### `/api/health` resolution

- `configuredProvider`: the configured primary provider name (chain[0]).
- `activeProvider`: the runtime-active provider name (from state machine).
- Top-level `provider` field kept as `configuredProvider` for backward compatibility.
- `modelType` in chat logs uses `activeProvider`, not `configuredProvider`.

### Concurrency guarantees

- **Single-flight probe**: only one probe to primary during HALF_OPEN. All other
  concurrent requests go to fallback; they do not initiate their own probes.
- **No thundering herd**: cooldown is monotonic (never resets on failure). Backoff
  is bounded with jitter.
- **No oscillation**: a failed probe in HALF_OPEN extends the cooldown (backoff).
- **No double chat**: a request never goes to both providers simultaneously.

### Counters

- `failureCount`: consecutive qualified failures of the primary.
- `successCount`: consecutive successes of the primary (resets failureCount).
- `cooldownDeadline`: timestamp when HALF_OPEN probe becomes eligible.
- `maxCooldownMs`: upper bound on cooldown (default 300s).
- `baseCooldownMs`: initial cooldown (default 10s).
- Counters reset on recovery to PRIMARY.

## Rollback path

1. `git revert <new-commit-sha> --no-edit` on the Lenovo release directory.
2. `systemctl --user restart yt-transcript.service`.
3. Verify `/api/health` returns 200 with `activeProvider` matching the old behavior.

## Out of scope

- Multi-provider fallback beyond primary + single fallback (chain[0] + chain[1]).
- Circuit breaker for the fallback provider.
- Prometheus metrics export (JSONL only).
- Kubernetes health probes.