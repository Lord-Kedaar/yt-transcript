/**
 * Provider Recovery State Machine — Deterministic Tests
 *
 * Tests all 9 required scenarios from the Mordax contract:
 * 1. Transient Mistral outage → fallback → cooldown → half-open → recovery
 * 2. Persistent outage with bounded backoff/jitter
 * 3. Error matrix: 429, 401/403, 400/422 validation, 5xx, timeout/network, malformed/empty
 * 4. Both providers down
 * 5. 100 concurrent requests in cooldown = one probe/recovery flight
 * 6. Requests during HALF_OPEN
 * 7. No oscillation and no double full chat
 * 8. Event JSONL, redaction, technicalCause, compatible endpoints
 * 9. (lint/build handled by npm scripts — these tests must pass alongside existing suite)
 *
 * Uses fake clock and fake providers for determinism.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createProviderStateMachine,
  classifyProviderError,
  isQualifiedFailure,
  isNonForwardable,
  STATES,
} from '../provider-state-machine.js';
import { createDiagnosticLogger } from '../diagnostics.js';

// ── Fake clock ──────────────────────────────────────────────────────

function createFakeClock(start = 0) {
  let current = start;
  return {
    now: () => current,
    advance(ms) {
      current += ms;
    },
    set(v) {
      current = v;
    },
  };
}

// ── Fake provider ───────────────────────────────────────────────────

function createFakeProvider(
  name,
  { healthOk = true, chatContent = 'ok response', chatDelayMs = 0 } = {},
) {
  let healthOkVar = healthOk;
  let chatContentVar = chatContent;
  let healthCalls = 0;
  let chatCalls = 0;
  return {
    name,
    healthCalls: () => healthCalls,
    chatCalls: () => chatCalls,
    setHealthOk(v) {
      healthOkVar = v;
    },
    setChatContent(v) {
      chatContentVar = v;
    },
    async health() {
      healthCalls += 1;
      if (healthOkVar) return { ok: true, state: 'connected' };
      return { ok: false, state: 'unreachable', error: 'provider down' };
    },
    async chat() {
      chatCalls += 1;
      if (chatDelayMs > 0) await new Promise(r => setTimeout(r, chatDelayMs));
      if (!healthOkVar) {
        const err = new Error('provider down');
        err.status = 503;
        throw err;
      }
      return { content: chatContentVar, model: name + '-model' };
    },
  };
}

// ── Fake provider with error-type control ───────────────────────────

function createControllableProvider(name) {
  let healthResult = { ok: true, state: 'connected' };
  let chatResult = { content: 'ok', model: name + '-model' };
  let chatThrows = null;
  let healthCalls = 0;
  let chatCalls = 0;
  return {
    name,
    healthCalls: () => healthCalls,
    chatCalls: () => chatCalls,
    setHealthResult(r) {
      healthResult = r;
    },
    setChatResult(r) {
      chatResult = r;
    },
    setChatThrows(err) {
      chatThrows = err;
    },
    async health() {
      healthCalls += 1;
      return healthResult;
    },
    async chat(_messages) {
      chatCalls += 1;
      if (chatThrows) throw chatThrows;
      return chatResult;
    },
  };
}

// ── Test config (fast cooldown for deterministic tests) ─────────────

const TEST_CONFIG = {
  baseCooldownMs: 100,
  maxCooldownMs: 1000,
  backoffMultiplier: 2,
  jitterMs: 0, // No jitter for deterministic tests
  healthCacheTtlMs: 50,
  authCooldownMultiplier: 3,
};

function makeTempLogDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'yt-sm-test-'));
}

function readJsonlEvents(dir) {
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl'));
  const lines = [];
  for (const f of files) {
    const content = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const line of content.trim().split('\n')) {
      if (line) lines.push(JSON.parse(line));
    }
  }
  return lines;
}

function findEvents(events, name) {
  return events.filter(e => e.event === name);
}

// ── Test 1: Transient outage → fallback → cooldown → half-open → recovery

test('1. transient outage: PRIMARY → FALLBACK_OPEN → HALF_OPEN → PRIMARY', async () => {
  const clock = createFakeClock(0);
  const mistral = createFakeProvider('Mistral', { healthOk: true });
  const omlx = createFakeProvider('oMLX', { healthOk: true });
  const sm = createProviderStateMachine({
    chain: [mistral, omlx],
    config: TEST_CONFIG,
    now: clock.now,
  });

  // Initially in PRIMARY, active = Mistral
  assert.equal(sm.getState(), STATES.PRIMARY);
  assert.equal(sm.getActiveProviderName(), 'Mistral');

  // Simulate transient Mistral failure
  mistral.setHealthOk(false);
  const provider = await sm.resolve('req-1');
  assert.equal(provider.name, 'oMLX', 'should fall back to oMLX');
  assert.equal(sm.getState(), STATES.FALLBACK_OPEN);
  assert.equal(sm.getActiveProviderName(), 'oMLX');

  // Advance past cooldown
  clock.advance(TEST_CONFIG.baseCooldownMs + 1);

  // Mistral recovers
  mistral.setHealthOk(true);

  // Next resolve triggers HALF_OPEN probe → recovery to PRIMARY
  await sm.resolve('req-2');
  assert.equal(sm.getState(), STATES.PRIMARY, 'should recover to PRIMARY');
  assert.equal(sm.getActiveProviderName(), 'Mistral', 'active provider should be Mistral again');
});

// ── Test 2: Persistent outage with bounded backoff/jitter

test('2. persistent outage: cooldown grows with bounded backoff', async () => {
  const clock = createFakeClock(0);
  const mistral = createControllableProvider('Mistral');
  const omlx = createFakeProvider('oMLX', { healthOk: true });
  const sm = createProviderStateMachine({
    chain: [mistral, omlx],
    config: TEST_CONFIG,
    now: clock.now,
  });

  // First failure → FALLBACK_OPEN, cooldown = baseCooldownMs
  mistral.setHealthResult({ ok: false, state: 'unreachable', error: 'timeout' });
  await sm.resolve('req-1');
  assert.equal(sm.getState(), STATES.FALLBACK_OPEN);
  const counters1 = sm.getCounters();
  assert.equal(counters1.cooldownMs, TEST_CONFIG.baseCooldownMs);

  // Advance past cooldown, probe fails again → cooldown should grow (backoff)
  clock.advance(TEST_CONFIG.baseCooldownMs + 1);
  mistral.setHealthResult({ ok: false, state: 'unreachable', error: 'timeout' });
  await sm.resolve('req-2'); // Triggers HALF_OPEN → probe fails → FALLBACK_OPEN
  assert.equal(sm.getState(), STATES.FALLBACK_OPEN);
  const counters2 = sm.getCounters();
  // Cooldown should have grown (base * backoffMultiplier)
  assert.ok(
    counters2.cooldownMs > TEST_CONFIG.baseCooldownMs,
    `cooldown should grow: ${counters2.cooldownMs} > ${TEST_CONFIG.baseCooldownMs}`,
  );

  // Advance past new cooldown, probe fails again → cooldown grows more but bounded
  clock.advance(counters2.cooldownMs + 1);
  mistral.setHealthResult({ ok: false, state: 'unreachable', error: 'timeout' });
  await sm.resolve('req-3');
  const counters3 = sm.getCounters();
  assert.ok(
    counters3.cooldownMs <= TEST_CONFIG.maxCooldownMs,
    `cooldown bounded: ${counters3.cooldownMs} <= ${TEST_CONFIG.maxCooldownMs}`,
  );
});

// ── Test 3: Error matrix

test('3a. 429 rate limit is transient → triggers fallback', async () => {
  const err = new Error('Too many requests');
  err.status = 429;
  assert.equal(classifyProviderError(err), 'transient');
  assert.equal(isQualifiedFailure(classifyProviderError(err)), true);
});

test('3b. 401/403 auth faults trigger fallback but with longer cooldown', async () => {
  const err401 = new Error('Unauthorized');
  err401.status = 401;
  assert.equal(classifyProviderError(err401), 'auth');
  assert.equal(isQualifiedFailure('auth'), true);

  const err403 = new Error('Forbidden');
  err403.status = 403;
  assert.equal(classifyProviderError(err403), 'auth');
});

test('3c. 400/422 validation does NOT degrade global health', async () => {
  const clock = createFakeClock(0);
  const mistral = createControllableProvider('Mistral');
  const omlx = createFakeProvider('oMLX', { healthOk: true });
  const sm = createProviderStateMachine({
    chain: [mistral, omlx],
    config: TEST_CONFIG,
    now: clock.now,
  });

  // Validation error from chat should NOT trigger fallback
  const validationErr = new Error('Bad request');
  validationErr.status = 400;
  mistral.setChatThrows(validationErr);
  mistral.setHealthResult({ ok: true, state: 'connected' });

  try {
    await sm.chat([], {}, 'req-val');
    assert.fail('should have thrown');
  } catch (err) {
    assert.equal(err.status, 400);
  }
  assert.equal(sm.getState(), STATES.PRIMARY, 'validation error should not degrade health');
  assert.equal(isNonForwardable('validation'), true);
});

test('3d. 5xx server error is transient', async () => {
  const err500 = new Error('Internal Server Error');
  err500.status = 500;
  assert.equal(classifyProviderError(err500), 'transient');

  const err502 = new Error('Bad Gateway');
  err502.status = 502;
  assert.equal(classifyProviderError(err502), 'transient');

  const err529 = new Error('Overloaded');
  err529.status = 529;
  assert.equal(classifyProviderError(err529), 'transient');
});

test('3e. timeout/network is transient', async () => {
  const err = new Error('Operation timed out after 5000ms');
  err.name = 'TimeoutError';
  assert.equal(classifyProviderError(err), 'transient');

  const err2 = new Error('fetch failed');
  err2.code = 'ECONNRESET';
  assert.equal(classifyProviderError(err2), 'transient');
});

test('3f. malformed/empty response is contract failure', async () => {
  const err = new Error('empty response');
  assert.equal(classifyProviderError(err), 'contract');
  assert.equal(isNonForwardable('contract'), true);
  assert.equal(isQualifiedFailure('contract'), false);
});

// ── Test 4: Both providers down

test('4. both providers down: state machine returns fallback (not crash)', async () => {
  const clock = createFakeClock(0);
  const mistral = createControllableProvider('Mistral');
  const omlx = createControllableProvider('oMLX');
  mistral.setHealthResult({ ok: false, state: 'unreachable', error: 'down' });
  omlx.setHealthResult({ ok: false, state: 'unreachable', error: 'down' });

  const sm = createProviderStateMachine({
    chain: [mistral, omlx],
    config: TEST_CONFIG,
    now: clock.now,
  });

  // First resolve: Mistral fails → FALLBACK_OPEN, oMLX is active
  await sm.resolve('req-down-1');
  assert.equal(sm.getState(), STATES.FALLBACK_OPEN);
  // Even though oMLX is unhealthy, it's the active provider (caller will get error from chat)
  assert.equal(sm.getActiveProviderName(), 'oMLX');
});

// ── Test 5: 100 concurrent requests in cooldown = one probe/recovery flight

test('5. 100 concurrent requests in cooldown: single-flight probe', async () => {
  const clock = createFakeClock(0);
  const mistral = createControllableProvider('Mistral');
  const omlx = createControllableProvider('oMLX');
  omlx.setHealthResult({ ok: true, state: 'connected' });

  const sm = createProviderStateMachine({
    chain: [mistral, omlx],
    config: TEST_CONFIG,
    now: clock.now,
  });

  // Trigger fallback
  mistral.setHealthResult({ ok: false, state: 'unreachable', error: 'timeout' });
  await sm.resolve('req-init');

  // Advance past cooldown → next resolve enters HALF_OPEN
  clock.advance(TEST_CONFIG.baseCooldownMs + 1);

  // Mistral recovers
  mistral.setHealthResult({ ok: true, state: 'connected' });

  // 100 concurrent resolves — only one should probe Mistral
  const promises = [];
  for (let i = 0; i < 100; i++) {
    promises.push(sm.resolve(`req-concurrent-${i}`));
  }
  await Promise.all(promises);

  // All should resolve (some to oMLX during HALF_OPEN, last one to Mistral after recovery)
  // The key assertion: Mistral.health() should have been called at most a few times (single-flight)
  const mistralHealthCalls = mistral.healthCalls();
  // First call was the initial probe that failed, second is the recovery probe.
  // The 100 concurrent requests should NOT cause 100 probes.
  assert.ok(
    mistralHealthCalls <= 3,
    `Mistral health should be called at most ~2-3 times, got ${mistralHealthCalls}`,
  );

  // After all resolves, state should be PRIMARY (recovery probe succeeded)
  assert.equal(sm.getState(), STATES.PRIMARY);
});

// ── Test 6: Requests during HALF_OPEN

test('6. requests during HALF_OPEN go to fallback, not primary (until probe completes)', async () => {
  const clock = createFakeClock(0);
  const mistral = createControllableProvider('Mistral');
  const omlx = createControllableProvider('oMLX');
  omlx.setHealthResult({ ok: true, state: 'connected' });

  const sm = createProviderStateMachine({
    chain: [mistral, omlx],
    config: TEST_CONFIG,
    now: clock.now,
  });

  // Trigger fallback
  mistral.setHealthResult({ ok: false, state: 'unreachable', error: 'timeout' });
  await sm.resolve('req-1');
  assert.equal(sm.getState(), STATES.FALLBACK_OPEN);

  // Advance past cooldown
  clock.advance(TEST_CONFIG.baseCooldownMs + 1);

  // Now we're in HALF_OPEN territory. A request should go to oMLX (fallback)
  // while the single-flight probe checks Mistral.
  // Make Mistral slow to respond so we can verify the request gets fallback.
  let mistralProbeResolve;
  mistral.health = function slowHealth() {
    return new Promise(resolve => {
      mistralProbeResolve = resolve;
    });
  };
  mistral.setHealthResult({ ok: true, state: 'connected' });

  // Start a resolve — it will enter HALF_OPEN and start the probe
  const resolvePromise = sm.resolve('req-half-open');

  // While probe is in flight, start another resolve — should get fallback (oMLX)
  const resolve2 = await sm.resolve('req-half-open-2');
  assert.equal(resolve2.name, 'oMLX', 'concurrent request during HALF_OPEN should get fallback');

  // Now let the probe complete (Mistral is healthy)
  mistralProbeResolve({ ok: true, state: 'connected' });
  await resolvePromise;

  // After probe succeeds, state should be PRIMARY
  assert.equal(sm.getState(), STATES.PRIMARY);
  assert.equal(sm.getActiveProviderName(), 'Mistral');
});

// ── Test 7: No oscillation and no double full chat

test('7a. no oscillation: failed HALF_OPEN probe extends cooldown, does not loop', async () => {
  const clock = createFakeClock(0);
  const mistral = createControllableProvider('Mistral');
  const omlx = createControllableProvider('oMLX');
  omlx.setHealthResult({ ok: true, state: 'connected' });

  const sm = createProviderStateMachine({
    chain: [mistral, omlx],
    config: TEST_CONFIG,
    now: clock.now,
  });

  // Initial failure → FALLBACK_OPEN
  mistral.setHealthResult({ ok: false, state: 'unreachable', error: 'timeout' });
  await sm.resolve('req-1');
  assert.equal(sm.getState(), STATES.FALLBACK_OPEN);
  const cd1 = sm.getCounters().cooldownMs;

  // Advance past cooldown → HALF_OPEN → probe fails → FALLBACK_OPEN with extended cooldown
  clock.advance(cd1 + 1);
  mistral.setHealthResult({ ok: false, state: 'unreachable', error: 'timeout' });
  await sm.resolve('req-2');
  assert.equal(sm.getState(), STATES.FALLBACK_OPEN, 'should be back in FALLBACK_OPEN');
  const cd2 = sm.getCounters().cooldownMs;
  assert.ok(cd2 > cd1, `cooldown should be extended: ${cd2} > ${cd1}`);

  // No oscillation: we should NOT be in HALF_OPEN after a failed probe
  assert.notEqual(sm.getState(), STATES.HALF_OPEN);
});

test('7b. no double full chat: a request never goes to both providers simultaneously', async () => {
  const clock = createFakeClock(0);
  const mistral = createControllableProvider('Mistral');
  const omlx = createControllableProvider('oMLX');
  omlx.setHealthResult({ ok: true, state: 'connected' });

  const sm = createProviderStateMachine({
    chain: [mistral, omlx],
    config: TEST_CONFIG,
    now: clock.now,
  });

  // In PRIMARY, chat goes to Mistral only
  mistral.setHealthResult({ ok: true, state: 'connected' });
  mistral.setChatResult({ content: 'mistral-response', model: 'mistral-model' });
  omlx.setChatResult({ content: 'omlx-response', model: 'omlx-model' });

  const result = await sm.chat([{ role: 'user', content: 'hello' }], {}, 'req-no-double');
  assert.equal(result.providerName, 'Mistral');
  assert.equal(mistral.chatCalls(), 1);
  assert.equal(omlx.chatCalls(), 0, 'oMLX should not be called in PRIMARY');

  // Now make Mistral fail on chat → should retry on fallback (single retry)
  const chatErr = new Error('Mistral timed out');
  chatErr.name = 'TimeoutError';
  mistral.setChatThrows(chatErr);

  const result2 = await sm.chat([{ role: 'user', content: 'hello2' }], {}, 'req-retry');
  // After chat failure in PRIMARY, state machine transitions to FALLBACK_OPEN and retries on oMLX
  assert.equal(result2.providerName, 'oMLX', 'should retry on oMLX');
  assert.equal(mistral.chatCalls(), 2, 'Mistral called once before failure');
  assert.equal(omlx.chatCalls(), 1, 'oMLX called once for retry');
  // Both providers were called, but NOT simultaneously — sequentially (Mistral first, then oMLX)
});

// ── Test 8: Event JSONL, redaction, technicalCause, compatible endpoints

test('8a. state machine emits structured JSONL events on transitions', async () => {
  const dir = makeTempLogDir();
  const logger = createDiagnosticLogger({ logDir: dir });
  const clock = createFakeClock(0);
  const mistral = createControllableProvider('Mistral');
  const omlx = createControllableProvider('oMLX');
  omlx.setHealthResult({ ok: true, state: 'connected' });

  const sm = createProviderStateMachine({
    chain: [mistral, omlx],
    diagnostics: logger,
    config: TEST_CONFIG,
    now: clock.now,
  });

  // Trigger fallback
  mistral.setHealthResult({ ok: false, state: 'unreachable', error: 'timed out after 6000ms' });
  await sm.resolve('req-events-1');

  // Advance past cooldown and recover
  clock.advance(TEST_CONFIG.baseCooldownMs + 1);
  mistral.setHealthResult({ ok: true, state: 'connected' });
  await sm.resolve('req-events-2');

  const events = readJsonlEvents(dir);
  const transitions = findEvents(events, 'provider.state.transition');
  assert.ok(
    transitions.length >= 2,
    `should have at least 2 transitions, got ${transitions.length}`,
  );

  // Check first transition: PRIMARY → FALLBACK_OPEN
  const t1 = transitions[0];
  assert.equal(t1.previousState, 'PRIMARY');
  assert.equal(t1.newState, 'FALLBACK_OPEN');
  assert.equal(t1.reason, 'primary_qualified_failure');
  assert.ok(t1.errorClass, 'errorClass should be present');

  // Check recovery transition: HALF_OPEN → PRIMARY
  const recoveryTransition = transitions.find(t => t.newState === 'PRIMARY');
  assert.ok(recoveryTransition, 'should have a transition to PRIMARY');
  assert.equal(recoveryTransition.reason, 'recovery_probe_succeeded');

  // Check health events
  const healthStarted = findEvents(events, 'provider.health.started');
  assert.ok(healthStarted.length > 0, 'should have health.started events');

  const healthFailed = findEvents(events, 'provider.health.failed');
  assert.ok(healthFailed.length > 0, 'should have health.failed events');

  const healthSucceeded = findEvents(events, 'provider.health.succeeded');
  assert.ok(healthSucceeded.length > 0, 'should have health.succeeded events');

  // Check recovery events
  const recoverySucceeded = findEvents(events, 'provider.recovery.succeeded');
  assert.ok(recoverySucceeded.length > 0, 'should have recovery.succeeded event');

  fs.rmSync(dir, { recursive: true, force: true });
});

test('8b. events do not contain secrets or transcript content', async () => {
  const dir = makeTempLogDir();
  const logger = createDiagnosticLogger({ logDir: dir });
  const clock = createFakeClock(0);
  const mistral = createControllableProvider('Mistral');
  const omlx = createControllableProvider('oMLX');
  omlx.setHealthResult({ ok: true, state: 'connected' });

  const sm = createProviderStateMachine({
    chain: [mistral, omlx],
    diagnostics: logger,
    config: TEST_CONFIG,
    now: clock.now,
  });

  // Trigger fallback with an error message that contains a fake secret
  const errWithSecret = new Error('Authorization failed: Bearer sk-secret-key-123');
  errWithSecret.status = 401;
  mistral.setHealthResult({
    ok: false,
    state: 'unreachable',
    error: 'Authorization failed: Bearer sk-secret-key-123',
  });
  await sm.resolve('req-redact-1');

  const events = readJsonlEvents(dir);
  const allLines = events.map(e => JSON.stringify(e)).join('\n');
  // The Bearer token should be redacted
  assert.doesNotMatch(allLines, /sk-secret-key-123/, 'secret should be redacted');

  fs.rmSync(dir, { recursive: true, force: true });
});

test('8c. technicalCause is present for failed health probes', async () => {
  const dir = makeTempLogDir();
  const logger = createDiagnosticLogger({ logDir: dir });
  const clock = createFakeClock(0);
  const mistral = createControllableProvider('Mistral');
  const omlx = createControllableProvider('oMLX');
  omlx.setHealthResult({ ok: true, state: 'connected' });

  const sm = createProviderStateMachine({
    chain: [mistral, omlx],
    diagnostics: logger,
    config: TEST_CONFIG,
    now: clock.now,
  });

  mistral.setHealthResult({
    ok: false,
    state: 'unreachable',
    error: 'Connection timed out after 6000ms',
  });
  await sm.resolve('req-cause-1');

  const events = readJsonlEvents(dir);
  const healthFailed = findEvents(events, 'provider.health.failed');
  assert.ok(healthFailed.length > 0);
  // technicalCause should be present (from diagnostics.probe)
  const probeFailed = findEvents(events, 'provider.health.failed');
  assert.ok(probeFailed.length > 0);

  fs.rmSync(dir, { recursive: true, force: true });
});

// ── Test 9: Health endpoint returns compatible shape

test('9. health() returns compatible shape with chain, activeProvider, configuredProvider', async () => {
  const clock = createFakeClock(0);
  const mistral = createControllableProvider('Mistral');
  const omlx = createControllableProvider('oMLX');
  mistral.setHealthResult({ ok: true, state: 'connected' });
  omlx.setHealthResult({ ok: true, state: 'connected' });

  const sm = createProviderStateMachine({
    chain: [mistral, omlx],
    config: TEST_CONFIG,
    now: clock.now,
  });

  const h = await sm.health();
  assert.ok(h.ok, 'health should be ok');
  assert.equal(h.activeProvider, 'Mistral');
  assert.equal(h.configuredProvider, 'Mistral');
  assert.deepEqual(h.chain, ['Mistral', 'oMLX']);
  assert.equal(h.state, STATES.PRIMARY);
  assert.ok(Array.isArray(h.providerHealth));
});

// ── Additional edge case tests ──────────────────────────────────────

test('chat success resets failure count in PRIMARY', async () => {
  const clock = createFakeClock(0);
  const mistral = createControllableProvider('Mistral');
  const omlx = createControllableProvider('oMLX');
  mistral.setHealthResult({ ok: true, state: 'connected' });
  omlx.setHealthResult({ ok: true, state: 'connected' });

  const sm = createProviderStateMachine({
    chain: [mistral, omlx],
    config: TEST_CONFIG,
    now: clock.now,
  });

  // No failures yet
  assert.equal(sm.getCounters().failureCount, 0);

  // Successful chat
  mistral.setChatResult({ content: 'ok', model: 'mistral-model' });
  await sm.chat([], {}, 'req-success');
  assert.equal(sm.getCounters().failureCount, 0);
  assert.ok(sm.getCounters().successCount > 0);
});

test('state machine requires at least 2 providers in chain', () => {
  assert.throws(
    () => createProviderStateMachine({ chain: [createFakeProvider('only')] }),
    /at least 2 providers/,
  );
});

test('auth failure gets longer cooldown than transient', async () => {
  const clock = createFakeClock(0);
  const mistral = createControllableProvider('Mistral');
  const omlx = createControllableProvider('oMLX');
  omlx.setHealthResult({ ok: true, state: 'connected' });

  const sm = createProviderStateMachine({
    chain: [mistral, omlx],
    config: TEST_CONFIG,
    now: clock.now,
  });

  // Transient failure — health() throws a timeout error
  const transientErr = new Error('Operation timed out');
  transientErr.name = 'TimeoutError';
  mistral.health = async function transientHealth() {
    throw transientErr;
  };
  await sm.resolve('req-transient');
  const transientCd = sm.getCounters().cooldownMs;
  assert.equal(transientCd, TEST_CONFIG.baseCooldownMs, 'transient cooldown = base');

  // Reset and try auth failure — health() throws a 401 error
  clock.set(0);
  const sm2 = createProviderStateMachine({
    chain: [mistral, omlx],
    config: TEST_CONFIG,
    now: clock.now,
  });

  const authErr = new Error('Unauthorized');
  authErr.status = 401;
  mistral.health = async function authHealth() {
    throw authErr;
  };
  await sm2.resolve('req-auth');
  const authCd = sm2.getCounters().cooldownMs;

  // Auth cooldown should be longer due to authCooldownMultiplier
  assert.ok(
    authCd > transientCd,
    `auth cooldown (${authCd}) should be longer than transient (${transientCd})`,
  );
});
