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

test('throws on a stream that produced no events at all', async () => {
  const res = sseResponse([': keep-alive\n\n', 'data: [DONE]\n\n']);
  await assert.rejects(() => consumeOpenAiSse(res, {}), /empty stream/);
});

// ─── Idle timeout semantics (the core of the feature) ───────────────

test('idle timeout does NOT fire while chunks keep arriving, even if slow', async () => {
  // Three chunks, each arriving well inside the window. Total elapsed time
  // exceeds the window — that must NOT be treated as a stall.
  let i = 0;
  const chunks = [delta('slow-'), delta('but-'), delta('alive')];
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

// ─── State machine: streaming failover semantics ────────────────────

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
