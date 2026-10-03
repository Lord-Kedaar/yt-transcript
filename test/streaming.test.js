/**
 * Streaming regression tests: SSE parsing, usage extraction, idle timeout,
 * and provider failover semantics for the streaming path.
 *
 * These assert the CONTRACT, not just "it returned 200":
 *  - SSE frames split across chunk boundaries must reassemble
 *  - keep-alive comments and [DONE] must be ignored, not treated as content
 *  - usage must be captured from the final chunk
 *  - the idle timeout measures the gap BETWEEN chunks, so a long prefill is
 *    NOT a failure (this is the whole point of the feature)
 *  - failover happens ONLY before the first delta; after it, the failure is
 *    terminal and two models' outputs are never spliced together
 *
 * Run: node --test test/streaming.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { consumeOpenAiSse, fetchChatStream } from '../sse-stream.js';
import { createProviderStateMachine, STATES } from '../provider-state-machine.js';

const encoder = new TextEncoder();

function sseResponse(chunks) {
  let i = 0;
  const body = new ReadableStream({
    pull(controller) {
      if (i >= chunks.length) {
        controller.close();
        return;
      }
      const chunk = chunks[i++];
      // Accept both strings and raw byte slices. Re-encoding a Uint8Array would
      // stringify it ("100,97,116,97") instead of passing the bytes through.
      controller.enqueue(typeof chunk === 'string' ? encoder.encode(chunk) : chunk);
    },
  });
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

const frame = obj => `data: ${JSON.stringify(obj)}\n\n`;
const delta = text => frame({ choices: [{ delta: { content: text }, index: 0 }] });
const usageFrame = usage => frame({ choices: [], usage });

// ─── SSE parsing ────────────────────────────────────────────────────

test('parses deltas and captures usage from the final chunk', async () => {
  const res = sseResponse([
    delta('Hello '),
    delta('world'),
    usageFrame({ prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 }),
    'data: [DONE]\n\n',
  ]);
  const seen = [];
  const out = await consumeOpenAiSse(res, { onDelta: d => seen.push(d) });
  assert.equal(out.text, 'Hello world');
  assert.deepEqual(seen, ['Hello ', 'world']);
  assert.equal(out.usage.total_tokens, 12);
});

test('reassembles frames split across chunk boundaries', async () => {
  const wire =
    delta('Alpha ') + delta('Beta') + usageFrame({ total_tokens: 6 }) + 'data: [DONE]\n\n';
  const bytes = encoder.encode(wire);
  // Deliberately cut mid-frame at three arbitrary points. Chunks are handed to
  // the stream as bytes — re-encoding a Uint8Array would stringify it, so the
  // slices are wrapped in fresh Uint8Arrays.
  const res = sseResponse([bytes.slice(0, 17), bytes.slice(17, 40), bytes.slice(40)]);
  const out = await consumeOpenAiSse(res, {});
  assert.equal(out.text, 'Alpha Beta');
  assert.equal(out.usage.total_tokens, 6);
});

test('keep-alive comments produce no content and do not corrupt the parse', async () => {
  const res = sseResponse([
    ': keep-alive\n\n',
    delta('A'),
    ': keep-alive\n\n',
    delta('B'),
    'data: [DONE]\n\n',
  ]);
  const out = await consumeOpenAiSse(res, {});
  assert.equal(out.text, 'AB');
});

test('captures finish_reason when the upstream reports it', async () => {
  const res = sseResponse([
    delta('partial'),
    frame({ choices: [{ delta: {}, index: 0, finish_reason: 'length' }] }),
    'data: [DONE]\n\n',
  ]);
  const out = await consumeOpenAiSse(res, {});
  assert.equal(out.finishReason, 'length');
});

test('throws on a stream that produced no bytes at all', async () => {
  // A genuinely empty response body — distinct from a stream that ends early,
  // which is covered by the IncompleteStreamError tests below.
  const res = sseResponse([]);
  await assert.rejects(() => consumeOpenAiSse(res, {}), /empty stream/);
});

// ─── Idle timeout semantics (the core of the feature) ───────────────

test('idle timeout does NOT fire while chunks keep arriving, even if slow', async () => {
  // Three chunks, each arriving well inside the window. Total elapsed time
  // exceeds the window — that must NOT be treated as a stall. The stream ends
  // with a proper terminator so it is a genuine completion, not a truncation.
  let i = 0;
  const chunks = [delta('slow-'), delta('but-'), delta('alive'), 'data: [DONE]\n\n'];
  const body = new ReadableStream({
    async pull(controller) {
      if (i >= chunks.length) {
        controller.close();
        return;
      }
      await new Promise(r => setTimeout(r, 60));
      controller.enqueue(encoder.encode(chunks[i++]));
    },
  });
  const res = new Response(body, { status: 200 });
  const out = await consumeOpenAiSse(res, { idleTimeoutMs: 150 });
  assert.equal(out.text, 'slow-but-alive');
});

test('idle timeout DOES fire when the upstream goes silent', async () => {
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(delta('started')));
      // then never sends anything again — simulates a hung upstream
    },
  });
  const res = new Response(body, { status: 200 });
  await assert.rejects(
    () => consumeOpenAiSse(res, { idleTimeoutMs: 80 }),
    /idle for more than 80ms/,
  );
});

// ─── fetchChatStream error handling ─────────────────────────────────

test('non-OK upstream response surfaces status and message', async () => {
  const fakeFetch = async () =>
    new Response(JSON.stringify({ error: { message: 'Rate limit exceeded' } }), { status: 429 });
  await assert.rejects(
    () =>
      fetchChatStream('http://x/v1/chat/completions', {
        model: 'm',
        messages: [],
        fetchImpl: fakeFetch,
      }),
    err => err.status === 429 && /Rate limit exceeded/.test(err.message),
  );
});

test('non-JSON error body does not leak a JSON parse error', async () => {
  const fakeFetch = async () => new Response('error code: 502', { status: 502 });
  await assert.rejects(
    () =>
      fetchChatStream('http://x/v1/chat/completions', {
        model: 'm',
        messages: [],
        fetchImpl: fakeFetch,
      }),
    err => err.status === 502 && err.message === 'error code: 502',
  );
});

test('request body enables streaming and usage reporting', async () => {
  let captured = null;
  const fakeFetch = async (_url, opts) => {
    captured = JSON.parse(opts.body);
    return sseResponse([delta('ok'), 'data: [DONE]\n\n']);
  };
  await fetchChatStream('http://x/v1/chat/completions', {
    model: 'test-model',
    messages: [{ role: 'user', content: 'hi' }],
    fetchImpl: fakeFetch,
  });
  assert.equal(captured.stream, true);
  assert.deepEqual(captured.stream_options, { include_usage: true });
  assert.equal(captured.model, 'test-model');
});

// ─── Completion contract (Mordax F1/F2) ────────────────────────────

test('REJECT-F2: stream that closes early is NOT a successful completion', async () => {
  // One valid delta, then the connection dies with no [DONE] and no finish_reason.
  const res = sseResponse([delta('partial answer only')]);
  await assert.rejects(
    () => consumeOpenAiSse(res, {}),
    err => err.name === 'IncompleteStreamError' && err.code === 'ERR_INCOMPLETE_STREAM',
  );
});

test('REJECT-F2: finish_reason alone (no [DONE]) still counts as complete', async () => {
  const res = sseResponse([
    delta('complete answer'),
    frame({ choices: [{ delta: {}, index: 0, finish_reason: 'stop' }] }),
  ]);
  const out = await consumeOpenAiSse(res, {});
  assert.equal(out.text, 'complete answer');
  assert.equal(out.finishReason, 'stop');
  assert.equal(out.sawDoneMarker, false);
});

test('REJECT-F2: [DONE] alone (no finish_reason) counts as complete', async () => {
  const res = sseResponse([delta('answer'), 'data: [DONE]\n\n']);
  const out = await consumeOpenAiSse(res, {});
  assert.equal(out.text, 'answer');
  assert.equal(out.sawDoneMarker, true);
});

test('REJECT-F2: partial text is not reported as the result on early close', async () => {
  const res = sseResponse([delta('this must not be cached')]);
  let caught = null;
  try {
    await consumeOpenAiSse(res, {});
  } catch (e) {
    caught = e;
  }
  assert.ok(caught, 'must throw');
  // The partial text rides on the error for diagnostics, never as a return value.
  assert.equal(caught.partialText, 'this must not be cached');
});

// ─── Abort semantics (Mordax F1) ────────────────────────────────────

test('REJECT-F1: abort AFTER a delta is an error, never a successful result', async () => {
  const controller = new AbortController();
  let i = 0;
  const chunks = [delta('first'), delta('second'), delta('third')];
  const body = new ReadableStream({
    async pull(c) {
      if (i >= chunks.length) {
        c.close();
        return;
      }
      const chunk = chunks[i++];
      // Abort midway, exactly as a browser disconnect would.
      if (i === 2) controller.abort();
      c.enqueue(encoder.encode(chunk));
    },
  });
  const res = new Response(body, { status: 200 });
  await assert.rejects(
    () => consumeOpenAiSse(res, { signal: controller.signal }),
    err => err.name === 'AbortError',
  );
});

test('REJECT-F1: abort BEFORE any content is an error', async () => {
  const controller = new AbortController();
  controller.abort();
  const res = sseResponse([delta('never seen')]);
  await assert.rejects(
    () => consumeOpenAiSse(res, { signal: controller.signal }),
    err => err.name === 'AbortError',
  );
});

test('REJECT-F1: aborting before start never issues the upstream request', async () => {
  const controller = new AbortController();
  controller.abort();
  let called = false;
  const fakeFetch = async () => {
    called = true;
    return sseResponse([delta('x'), 'data: [DONE]\n\n']);
  };
  await assert.rejects(
    () =>
      fetchChatStream('http://x/v1/chat/completions', {
        model: 'm',
        messages: [],
        signal: controller.signal,
        fetchImpl: fakeFetch,
      }),
    err => err.name === 'AbortError',
  );
  assert.equal(called, false, 'an already-aborted request must not reach the provider');
});

// ─── Header-phase guard (Mordax answer #1) ──────────────────────────

test('REJECT-A1: provider that never sends headers hits the header timeout', async () => {
  // A real fetch rejects when the signal fires; this stub does the same so the
  // test exercises our timer rather than hanging on a promise that never settles.
  const fakeFetch = (_url, opts) =>
    new Promise((_resolve, reject) => {
      opts.signal.addEventListener('abort', () => {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        reject(err);
      });
    });
  await assert.rejects(
    () =>
      fetchChatStream('http://x/v1/chat/completions', {
        model: 'm',
        messages: [],
        fetchImpl: fakeFetch,
        headersTimeoutMs: 60,
      }),
    err => err.name === 'TimeoutError' && /headers/.test(err.message),
  );
});

// ─── Prompt parity between the two routes (Mordax F4) ───────────────

test('REJECT-F4: both endpoints build prompts through the same helper', async () => {
  // Guards against re-duplication: a second copy of the prompt construction in
  // the buffered route would silently let the two routes drift apart.
  const src = await readFile(new URL('../server.js', import.meta.url), 'utf8');
  const calls = src.match(/buildTransformMessages\(/g) || [];
  // one definition + one call site per endpoint (buffered + streaming)
  assert.ok(
    calls.length >= 3,
    `expected buildTransformMessages to be defined once and called by both endpoints, saw ${calls.length}`,
  );
  assert.ok(
    /app\.post\(\s*['"]\/api\/transform['"]/.test(src) &&
      /app\.post\(\s*['"]\/api\/transform\/stream['"]/.test(src),
    'both routes must still exist',
  );
});

test('REJECT-F3: error event carries afterFirstDelta for the UI to act on', async () => {
  const src = await readFile(new URL('../server.js', import.meta.url), 'utf8');
  assert.ok(
    /afterFirstDelta:\s*emitted/.test(src),
    'server must tell the client whether partial text was already sent',
  );
});

// ─── Provider failover semantics (unchanged) ────────────────────────

function buildChain(primary, fallback) {
  const events = [];
  const diagnostics = {
    event: (level, name, fields) => events.push({ level, name, ...fields }),
    createOperationContext: () => ({
      tick() {},
      chat() {},
      finish() {},
      transformPhase() {},
      probe() {},
      disconnect() {},
      selectProvider() {},
      fallback() {},
    }),
    probe: () => {},
  };
  return { sm: createProviderStateMachine({ chain: [primary, fallback], diagnostics }), events };
}

test('chatStream: succeeds on primary without touching fallback', async () => {
  let fallbackCalls = 0;
  const primary = {
    name: 'P',
    async health() {
      return { ok: true, state: 'connected' };
    },
    async chatStream(_m, { onDelta }) {
      onDelta('A');
      onDelta('B');
      return { content: 'AB', usage: { total_tokens: 5 }, model: 'p-model' };
    },
  };
  const fallback = {
    name: 'F',
    async health() {
      return { ok: true, state: 'connected' };
    },
    async chatStream() {
      fallbackCalls += 1;
      return { content: 'fb', model: 'f-model' };
    },
  };
  const { sm } = buildChain(primary, fallback);
  const deltas = [];
  const result = await sm.chatStream([], { onDelta: d => deltas.push(d) });
  assert.deepEqual(deltas, ['A', 'B']);
  assert.equal(result.providerName, 'P');
  assert.equal(result.emitted, true);
  assert.equal(fallbackCalls, 0);
});

test('chatStream: fails over when primary fails BEFORE first delta', async () => {
  let fallbackCalls = 0;
  const primary = {
    name: 'P',
    async health() {
      return { ok: true, state: 'connected' };
    },
    async chatStream() {
      const e = new Error('Rate limit exceeded');
      e.status = 429;
      throw e;
    },
  };
  const fallback = {
    name: 'F',
    async health() {
      return { ok: true, state: 'connected' };
    },
    async chatStream(_m, { onDelta }) {
      fallbackCalls += 1;
      onDelta('from-fallback');
      return { content: 'from-fallback', model: 'f-model' };
    },
  };
  const { sm } = buildChain(primary, fallback);
  const deltas = [];
  const result = await sm.chatStream([], { onDelta: d => deltas.push(d) });
  assert.equal(fallbackCalls, 1);
  assert.deepEqual(deltas, ['from-fallback']);
  assert.equal(result.providerName, 'F');
});

test('chatStream: NEVER fails over after first delta — outputs are never spliced', async () => {
  let fallbackCalls = 0;
  const primary = {
    name: 'P',
    async health() {
      return { ok: true, state: 'connected' };
    },
    async chatStream(_m, { onDelta }) {
      onDelta('partial-answer-from-primary');
      const e = new Error('upstream died mid-stream');
      e.status = 429;
      throw e;
    },
  };
  const fallback = {
    name: 'F',
    async health() {
      return { ok: true, state: 'connected' };
    },
    async chatStream() {
      fallbackCalls += 1;
      return { content: 'must-never-appear', model: 'f' };
    },
  };
  const { sm } = buildChain(primary, fallback);
  const deltas = [];
  await assert.rejects(
    () => sm.chatStream([], { onDelta: d => deltas.push(d) }),
    /upstream died mid-stream/,
  );
  assert.equal(fallbackCalls, 0, 'must not fall back after emitting output');
  assert.deepEqual(deltas, ['partial-answer-from-primary'], 'only primary text is ever emitted');
});

test('chatStream: validation failure is not forwarded to fallback', async () => {
  // NOTE: 401/403 'auth' IS deliberately forwardable in this codebase (an
  // invalid key on one provider may still succeed on another) — see
  // provider-state-machine.test.js:235. Only 'validation' and 'contract'
  // failures are non-forwardable, so that is what this test pins.
  let fallbackCalls = 0;
  const primary = {
    name: 'P',
    async health() {
      return { ok: true, state: 'connected' };
    },
    async chatStream() {
      const e = new Error('Invalid request payload');
      e.status = 422;
      throw e;
    },
  };
  const fallback = {
    name: 'F',
    async health() {
      return { ok: true, state: 'connected' };
    },
    async chatStream() {
      fallbackCalls += 1;
      return { content: 'x', model: 'f' };
    },
  };
  const { sm } = buildChain(primary, fallback);
  await assert.rejects(() => sm.chatStream([], {}));
  assert.equal(fallbackCalls, 0, 'validation failures must not be forwarded verbatim');
});

test('chatStream: auth failure IS forwarded (documented fallback policy)', async () => {
  let fallbackCalls = 0;
  const primary = {
    name: 'P',
    async health() {
      return { ok: true, state: 'connected' };
    },
    async chatStream() {
      const e = new Error('Unauthorized');
      e.status = 401;
      throw e;
    },
  };
  const fallback = {
    name: 'F',
    async health() {
      return { ok: true, state: 'connected' };
    },
    async chatStream(_m, { onDelta }) {
      fallbackCalls += 1;
      onDelta('recovered');
      return { content: 'recovered', model: 'f' };
    },
  };
  const { sm } = buildChain(primary, fallback);
  const result = await sm.chatStream([], {});
  assert.equal(fallbackCalls, 1, 'auth faults do trigger fallback by design');
  assert.equal(result.providerName, 'F');
});

test('buffered chat() still works unchanged (no regression)', async () => {
  const primary = {
    name: 'P',
    async health() {
      return { ok: true, state: 'connected' };
    },
    async chat() {
      return { content: 'buffered', model: 'p' };
    },
  };
  const fallback = {
    name: 'F',
    async health() {
      return { ok: true, state: 'connected' };
    },
    async chat() {
      return { content: 'fb', model: 'f' };
    },
  };
  const { sm } = buildChain(primary, fallback);
  const result = await sm.chat([], {});
  assert.equal(result.content, 'buffered');
  assert.equal(result.providerName, 'P');
  assert.equal(sm.getState(), STATES.PRIMARY);
});

// ─── reasoningEffort forwarding (2026-10-03) ─────────────────────────
//
// Why this matters: the FreeLLMAPI default model (gpt-oss-20b) is a reasoning
// model. Without a reasoning budget it prepends its chain-of-thought to the
// answer ("We need to merge fragments into paragraphs..."), which is
// user-visible garbage in the reconstruction panel. Measured on a real 150-
// snippet chunk: 6/6 answers leaked. Sending reasoning_effort='low' produced
// 6/6 clean answers.
//
// The field must reach the wire ONLY when the caller sets it — models that do
// not understand it should never receive an explicit `undefined`.

test('fetchChatStream omits reasoning_effort when not requested', async () => {
  let sentBody = null;
  const fetchImpl = async (_url, init) => {
    sentBody = JSON.parse(init.body);
    return sseResponse([
      delta('ok'),
      frame({ choices: [{ finish_reason: 'stop' }] }),
      'data: [DONE]\n\n',
    ]);
  };
  await fetchChatStream('http://x/v1/chat/completions', {
    model: 'm',
    messages: [],
    fetchImpl,
  });
  assert.ok(sentBody, 'request body must be captured');
  assert.equal(
    Object.prototype.hasOwnProperty.call(sentBody, 'reasoning_effort'),
    false,
    'reasoning_effort must be absent, not undefined-valued, when not requested',
  );
});

test('fetchChatStream forwards reasoning_effort when requested', async () => {
  let sentBody = null;
  const fetchImpl = async (_url, init) => {
    sentBody = JSON.parse(init.body);
    return sseResponse([
      delta('ok'),
      frame({ choices: [{ finish_reason: 'stop' }] }),
      'data: [DONE]\n\n',
    ]);
  };
  await fetchChatStream('http://x/v1/chat/completions', {
    model: 'openai/gpt-oss-20b',
    messages: [{ role: 'user', content: 'hi' }],
    reasoningEffort: 'low',
    fetchImpl,
  });
  assert.equal(sentBody.reasoning_effort, 'low', 'reasoning_effort must reach the wire');
  assert.equal(sentBody.model, 'openai/gpt-oss-20b');
  assert.equal(sentBody.stream, true, 'streaming must stay enabled');
});

// ─── FreeLLMAPI health probe shape (2026-10-03) ──────────────────────
//
// The FreeLLMAPI health() used to POST a chat completion with max_tokens: 2.
// On a reasoning model that truncates the reasoning budget before any content
// is emitted, so a HEALTHY router answered 502 and the state machine flipped
// the primary to FALLBACK_OPEN — the service looked broken while the router was
// fine. It also burned real RPM/RPD quota on every probe.
//
// The probe must read /v1/models (GET), which is cheap and quota-free.

test('FreeLLMAPI health probe reads /v1/models, not a chat completion', async () => {
  const src = await readFile(new URL('../server.js', import.meta.url), 'utf8');
  // Locate the FreeLLMAPI provider block and inspect only that region.
  const start = src.indexOf('function buildFreeLLMAPIProvider()');
  assert.ok(start !== -1, 'buildFreeLLMAPIProvider must exist');
  const end = src.indexOf('// ── Mistral provider', start);
  const block = src.slice(start, end === -1 ? undefined : end);

  // Plain substring checks: the needle contains '/', so a regex literal would
  // need escaping at every slash and is easy to get wrong.
  assert.ok(block.includes('/v1/models'), 'health() must probe /v1/models');
  assert.ok(
    !/max_tokens:\s*2/.test(block),
    'health() must not send a truncated chat completion (it 502s on reasoning models)',
  );
});
