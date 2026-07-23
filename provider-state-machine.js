/**
 * Provider Recovery State Machine
 *
 * Replaces the sticky-fallback buildProviderChain closure (server.js:592-640)
 * with a proper PRIMARY → FALLBACK_OPEN → HALF_OPEN → PRIMARY state machine.
 *
 * Contract: ADR_PROVIDER_RECOVERY_STATE_MACHINE.md
 *
 * Guarantees:
 * - Single-flight probe in HALF_OPEN (no thundering herd).
 * - Monotonic cooldown with bounded backoff + jitter (no oscillation).
 * - No double chat (a request never goes to both providers simultaneously).
 * - Error matrix: transient/auth triggers fallback; validation/contract does not.
 * - Structured telemetry via injected diagnostics logger.
 * - Fake-clock injectable for deterministic tests.
 */

'use strict';

// ── Error classification ────────────────────────────────────────────

/**
 * Classify an error from a health probe or chat call.
 * Returns one of: 'transient', 'auth', 'validation', 'contract', 'unknown'
 *
 * @param {Error} err
 * @returns {string}
 */
export function classifyProviderError(err) {
  if (!err) return 'unknown';
  const status = Number(err.status || err.statusCode || 0);
  const message = String(err.message || err).toLowerCase();
  const code = String(err.code || '').toUpperCase();

  // Auth faults: 401, 403
  if (status === 401 || status === 403) return 'auth';

  // Validation / schema: 400, 404, 422
  if (status === 400 || status === 404 || status === 422) return 'validation';

  // Transient: timeout, network, 408, 425, 429, 5xx, 529
  if (
    code === 'ETIMEDOUT' ||
    code === 'ECONNRESET' ||
    code === 'ECONNREFUSED' ||
    code === 'ENETUNREACH' ||
    code === 'ENOTFOUND' ||
    code === 'EAI_AGAIN' ||
    err.name === 'TimeoutError' ||
    err.name === 'AbortError' ||
    code === 'ABORT_ERR' ||
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('fetch failed') ||
    message.includes('econn') ||
    message.includes('socket hang up') ||
    message.includes('connection reset') ||
    message.includes('connection refused')
  )
    return 'transient';

  if (status === 408 || status === 425 || status === 429 || status === 529) return 'transient';
  if (status >= 500 && status <= 599) return 'transient';

  // Contract: malformed or empty response
  if (
    message.includes('empty response') ||
    message.includes('invalid response') ||
    message.includes('invalid json')
  )
    return 'contract';

  return 'unknown';
}

/**
 * Whether an error class should degrade global provider health and trigger fallback.
 * @param {string} errorClass
 * @returns {boolean}
 */
export function isQualifiedFailure(errorClass) {
  return errorClass === 'transient' || errorClass === 'auth' || errorClass === 'unknown';
}

/**
 * Whether an error class should NOT send the same payload to fallback.
 * @param {string} errorClass
 * @returns {boolean}
 */
export function isNonForwardable(errorClass) {
  return errorClass === 'validation' || errorClass === 'contract';
}

// ── State machine ─────────────────────────────────────────────────

export const STATES = Object.freeze({
  PRIMARY: 'PRIMARY',
  FALLBACK_OPEN: 'FALLBACK_OPEN',
  HALF_OPEN: 'HALF_OPEN',
});

// Default config — overridable via constructor for tests.
export const DEFAULT_CONFIG = Object.freeze({
  baseCooldownMs: 10_000, // 10s initial cooldown
  maxCooldownMs: 300_000, // 5 min max cooldown
  backoffMultiplier: 2, // exponential backoff factor
  jitterMs: 2000, // ±2s jitter
  healthCacheTtlMs: 30_000, // 30s health cache in PRIMARY state
  authCooldownMultiplier: 6, // auth faults get much longer cooldown
});

/**
 * @typedef {Object} Provider
 * @property {string} name
 * @property {function(): Promise<{ok: boolean, state?: string, error?: string, endpoint?: string, models?: string[], loaded?: boolean}>} health
 * @property {function(Array, Object): Promise<{content: string, raw?: Object, model?: string, providerName?: string}>} chat
 */

/**
 * @typedef {Object} DiagnosticsLogger
 * @property {function(string, string, Object): void} event
 * @property {function(string=): Object} createOperationContext
 * @property {function(string, string, Object): void} probe
 */

/**
 * Create a provider recovery state machine.
 *
 * @param {Object} opts
 * @param {Provider[]} opts.chain - [primary, ...fallback]
 * @param {DiagnosticsLogger} [opts.diagnostics] - diagnostics logger (optional in tests)
 * @param {Object} [opts.config] - override defaults
 * @param {function(): number} [opts.now] - injectable clock (Date.now default)
 * @param {function(number): Promise<void>} [opts.sleep] - injectable sleep
 */
export function createProviderStateMachine({
  chain,
  diagnostics = null,
  config = {},
  now = () => Date.now(),
}) {
  if (!Array.isArray(chain) || chain.length < 2) {
    throw new Error('ProviderStateMachine requires a chain of at least 2 providers');
  }

  const cfg = { ...DEFAULT_CONFIG, ...config };

  // ── Internal state ──────────────────────────────────────────────

  let state = STATES.PRIMARY;
  let activeProvider = chain[0]; // Currently serving requests
  let failureCount = 0;
  let successCount = 0;
  let cooldownDeadline = 0; // Timestamp when HALF_OPEN probe becomes eligible
  let currentCooldownMs = cfg.baseCooldownMs;
  let probeInFlight = false; // Single-flight guard for HALF_OPEN probe
  let lastTransitionAt = now();
  let lastErrorClass = null;
  let probeCounter = 0;

  // Health cache for PRIMARY state (avoids probing on every request when primary is healthy)
  let cachedHealth = null;
  let cachedHealthAt = 0;

  // ── Telemetry helper ─────────────────────────────────────────────

  function emit(eventName, fields = {}) {
    if (!diagnostics || typeof diagnostics.event !== 'function') return;
    diagnostics.event('info', eventName, {
      ...fields,
      state,
      activeProvider: activeProvider.name,
      failureCount,
      successCount,
      cooldownMs: currentCooldownMs,
    });
  }

  function emitTransition(previous, next, reason, extra = {}) {
    const transitionFields = {
      previousState: previous,
      newState: next,
      reason,
      errorClass: lastErrorClass,
      latencyMs: now() - lastTransitionAt,
      cooldownMs: currentCooldownMs,
      cooldownDeadline,
      failureCount,
      successCount,
      ...extra,
    };
    lastTransitionAt = now();
    emit('provider.state.transition', transitionFields);
  }

  // ── Cooldown with bounded backoff + jitter ───────────────────────

  function computeCooldown(errorClass) {
    let base = currentCooldownMs * cfg.backoffMultiplier;
    if (errorClass === 'auth') {
      base = base * cfg.authCooldownMultiplier;
    }
    // Bounded: never exceed maxCooldownMs
    base = Math.min(base, cfg.maxCooldownMs);
    // Jitter: ±jitterMs
    const jitter = (Math.random() - 0.5) * 2 * cfg.jitterMs;
    return Math.max(cfg.baseCooldownMs, Math.round(base + jitter));
  }

  function transitionToFallbackOpen(errorClass) {
    const previous = state;
    state = STATES.FALLBACK_OPEN;
    activeProvider = chain[1];
    failureCount += 1;
    lastErrorClass = errorClass;
    // First failure: use baseCooldownMs (with auth multiplier if applicable).
    // Subsequent failures (extendCooldown) apply bounded backoff.
    let cd = cfg.baseCooldownMs;
    if (errorClass === 'auth') {
      cd = cd * cfg.authCooldownMultiplier;
    }
    currentCooldownMs = Math.min(cd, cfg.maxCooldownMs);
    cooldownDeadline = now() + currentCooldownMs;
    cachedHealth = null;
    emitTransition(previous, STATES.FALLBACK_OPEN, 'primary_qualified_failure', {
      errorClass,
    });
  }

  function transitionToHalfOpen() {
    const previous = state;
    state = STATES.HALF_OPEN;
    // Active provider stays as fallback; only the probe goes to primary
    emitTransition(previous, STATES.HALF_OPEN, 'cooldown_elapsed');
  }

  function transitionToPrimary() {
    const previous = state;
    state = STATES.PRIMARY;
    activeProvider = chain[0];
    successCount += 1;
    failureCount = 0;
    currentCooldownMs = cfg.baseCooldownMs;
    cooldownDeadline = 0;
    cachedHealth = null;
    emitTransition(previous, STATES.PRIMARY, 'recovery_probe_succeeded');
  }

  function extendCooldown(errorClass) {
    const previous = state;
    state = STATES.FALLBACK_OPEN;
    failureCount += 1;
    lastErrorClass = errorClass;
    currentCooldownMs = computeCooldown(errorClass);
    cooldownDeadline = now() + currentCooldownMs;
    cachedHealth = null;
    emitTransition(previous, STATES.FALLBACK_OPEN, 'half_open_probe_failed', {
      errorClass,
    });
  }

  // ── Health probe (single-flight) ─────────────────────────────────

  /**
   * Probe a provider's health, emitting telemetry.
   * @param {Provider} provider
   * @param {string} phase - 'system_probe' or 'preflight'
   * @param {string} probeId
   * @returns {Promise<{ok: boolean, error?: string, errorClass?: string, durationMs: number}>}
   */
  async function probeHealth(provider, phase, probeId) {
    const start = now();
    emit('provider.health.started', { provider: provider.name, phase, probeId });

    let result;
    try {
      result = await provider.health();
    } catch (err) {
      result = { ok: false, error: err?.message || String(err), _err: err };
    }

    const durationMs = now() - start;
    const ok = Boolean(result?.ok);
    // Classify using the original Error object (preserves status/code) or construct one from the error string
    let errorObj = null;
    if (!ok) {
      if (result?._err) {
        errorObj = result._err;
      } else if (result?.error) {
        errorObj = new Error(result.error);
      }
    }
    const errorClass = ok ? null : classifyProviderError(errorObj);

    if (diagnostics && typeof diagnostics.probe === 'function') {
      diagnostics.probe(provider.name, phase, {
        ok,
        endpoint: result?.endpoint || null,
        durationMs,
        status: result?.state || (ok ? 'connected' : 'unreachable'),
        error: ok ? null : result?.error,
        errorClassification: errorClass,
        technicalCause: ok ? null : result?.error,
        retryable: ok ? false : errorClass === 'transient',
      });
    }

    if (ok) {
      emit('provider.health.succeeded', { provider: provider.name, phase, probeId, durationMs });
    } else {
      emit('provider.health.failed', {
        provider: provider.name,
        phase,
        probeId,
        durationMs,
        error: result?.error,
        errorClass,
      });
    }

    return { ok, error: result?.error, errorClass, durationMs };
  }

  // ── Public API ────────────────────────────────────────────────────

  /**
   * Resolve the active provider for a request.
   * In PRIMARY: use primary with health cache.
   * In FALLBACK_OPEN: use fallback. If cooldown elapsed, transition to HALF_OPEN and
   *   initiate a single-flight probe to primary.
   * In HALF_OPEN: use fallback. If probe is in flight, wait for it. If not, initiate one.
   *
   * @param {string} [requestId] - for correlation
   * @returns {Promise<Provider>}
   */
  async function resolve(requestId) {
    // ── PRIMARY ──────────────────────────────────────────────────
    if (state === STATES.PRIMARY) {
      // Use health cache to avoid probing on every request
      const cacheAge = now() - cachedHealthAt;
      if (cachedHealth?.ok && cacheAge < cfg.healthCacheTtlMs) {
        return activeProvider;
      }

      // Probe primary
      const probeId = `probe_${++probeCounter}`;
      const { ok, errorClass } = await probeHealth(chain[0], 'preflight', probeId);

      if (ok) {
        cachedHealth = { ok: true };
        cachedHealthAt = now();
        return activeProvider; // chain[0]
      }

      // Qualified failure → transition to FALLBACK_OPEN
      if (isQualifiedFailure(errorClass)) {
        transitionToFallbackOpen(errorClass);
        return activeProvider; // now chain[1]
      }

      // Non-qualified (validation/contract) — don't degrade global health.
      // The caller will surface the error; activeProvider stays as primary.
      return activeProvider;
    }

    // ── FALLBACK_OPEN ─────────────────────────────────────────────
    if (state === STATES.FALLBACK_OPEN) {
      // Check if cooldown has elapsed
      if (now() >= cooldownDeadline) {
        transitionToHalfOpen();
        // Fall through to HALF_OPEN handling below
      } else {
        return activeProvider; // fallback
      }
    }

    // ── HALF_OPEN ──────────────────────────────────────────────────
    if (state === STATES.HALF_OPEN) {
      // Single-flight: if a probe is already in flight, just return fallback.
      if (probeInFlight) {
        return activeProvider; // fallback
      }

      // Initiate single-flight probe to primary
      probeInFlight = true;
      const probeId = `probe_${++probeCounter}`;

      try {
        emit('provider.fallback.attempted', {
          probeId,
          requestId: requestId || null,
          reason: 'half_open_probe',
          provider: chain[0].name,
        });

        const { ok, errorClass } = await probeHealth(chain[0], 'recovery_probe', probeId);

        if (ok) {
          // Recovery succeeded
          emit('provider.recovery.succeeded', { probeId, requestId: requestId || null });
          transitionToPrimary();
          return activeProvider; // now chain[0]
        }

        // Probe failed — extend cooldown and go back to FALLBACK_OPEN
        emit('provider.recovery.failed', { probeId, requestId: requestId || null, errorClass });
        extendCooldown(errorClass || 'unknown');
        return activeProvider; // fallback
      } finally {
        probeInFlight = false;
      }
    }

    // Should never reach here
    return activeProvider;
  }

  /**
   * Record a chat failure from the active provider.
   * In PRIMARY state, a qualified chat failure triggers transition to FALLBACK_OPEN.
   *
   * @param {Error} err
   * @param {string} [requestId]
   */
  function recordChatFailure(err, requestId) {
    const errorClass = classifyProviderError(err);

    if (diagnostics) {
      diagnostics.event('error', 'provider.chat.failed', {
        provider: activeProvider.name,
        errorClass,
        requestId: requestId || null,
        error: err?.message,
      });
    }

    // Only degrade if we're in PRIMARY and this is a qualified failure
    if (state === STATES.PRIMARY && isQualifiedFailure(errorClass)) {
      transitionToFallbackOpen(errorClass);
    }
  }

  /**
   * Record a chat success. Resets failure count in PRIMARY.
   */
  function recordChatSuccess() {
    if (state === STATES.PRIMARY) {
      successCount += 1;
      failureCount = 0;
    }
  }

  /**
   * Get the active provider for a health endpoint call.
   * This is the equivalent of the old `llmProvider.health()`.
   * @returns {Promise<{ok: boolean, state?: string, activeProvider: string, chain: string[], providerHealth: Array}>}
   */
  async function health() {
    const provider = await resolve();
    let result;
    try {
      result = await provider.health();
    } catch (err) {
      result = { ok: false, state: 'unreachable', error: err?.message };
    }
    return {
      ...result,
      activeProvider: provider.name,
      configuredProvider: chain[0].name,
      chain: chain.map(p => p.name),
      state,
      providerHealth: chain.map(p => ({
        name: p.name,
        // We don't probe all providers here — just report the active one's result
        ok: p === provider ? result.ok : null,
      })),
    };
  }

  /**
   * Execute a chat call through the state machine.
   * Routes to the active provider. On qualified chat failure in PRIMARY,
   * transitions to FALLBACK_OPEN and retries on fallback (once).
   *
   * @param {Array} messages
   * @param {Object} opts
   * @param {string} [requestId]
   * @returns {Promise<{content: string, raw?: Object, model?: string, providerName: string}>}
   */
  async function chat(messages, opts = {}, requestId) {
    const provider = await resolve(requestId);

    try {
      const result = await provider.chat(messages, opts);
      recordChatSuccess();
      return { ...result, providerName: provider.name };
    } catch (err) {
      err.providerName = provider.name;
      recordChatFailure(err, requestId);

      // If we were in PRIMARY and just transitioned to FALLBACK_OPEN,
      // retry the chat on the fallback provider (single retry, not a loop).
      if (
        provider === chain[0] &&
        state === STATES.FALLBACK_OPEN &&
        !isNonForwardable(classifyProviderError(err))
      ) {
        emit('provider.fallback.attempted', {
          requestId: requestId || null,
          reason: 'chat_failure_retry',
          provider: chain[1].name,
        });
        try {
          const fbResult = await chain[1].chat(messages, opts);
          emit('provider.fallback.succeeded', {
            requestId: requestId || null,
            provider: chain[1].name,
          });
          return { ...fbResult, providerName: chain[1].name };
        } catch (fbErr) {
          fbErr.providerName = chain[1].name;
          emit('provider.fallback.failed', {
            requestId: requestId || null,
            provider: chain[1].name,
            error: fbErr?.message,
          });
          throw fbErr;
        }
      }

      throw err;
    }
  }

  // ── Inspectors (for tests and /api/health) ────────────────────────

  function getState() {
    return state;
  }

  function getActiveProvider() {
    return activeProvider;
  }

  function getActiveProviderName() {
    return activeProvider.name;
  }

  function getConfiguredProviderName() {
    return chain[0].name;
  }

  function getChainNames() {
    return chain.map(p => p.name);
  }

  function getCounters() {
    return {
      failureCount,
      successCount,
      cooldownDeadline,
      cooldownMs: currentCooldownMs,
    };
  }

  return {
    resolve,
    chat,
    health,
    recordChatFailure,
    recordChatSuccess,
    getState,
    getActiveProvider,
    getActiveProviderName,
    getConfiguredProviderName,
    getChainNames,
    getCounters,
    // Exposed for tests only
    _internal: {
      probeHealth,
      transitionToFallbackOpen,
      transitionToHalfOpen,
      transitionToPrimary,
      extendCooldown,
    },
  };
}
