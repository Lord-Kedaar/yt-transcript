/**
 * SSE streaming core for OpenAI-compatible chat completions.
 *
 * Extracted from server.js so it has a testable seam: server.js starts an HTTP
 * listener on import, so anything defined there cannot be unit-tested directly.
 *
 * Every configured provider (Mistral, oMLX, Groq, FreeLLMAPI) speaks the same
 * OpenAI wire format, so ONE parser serves all of them.
 *
 * Why streaming exists in this app: a large transcript (~94 kB ≈ 31.7k prompt
 * tokens) costs oMLX ~70 s of prefill before the first visible token. Buffered,
 * the client waits for the whole answer (~110 s) and Cloudflare closes the edge
 * at ~100 s → 524. Streaming keeps the connection alive from the first byte.
 */

/**
 * Parse an OpenAI-compatible SSE response body, invoking onDelta for each
 * content fragment. Returns the concatenated text plus usage if the upstream
 * reported it.
 *
 * `idleTimeoutMs` guards the GAP BETWEEN CHUNKS, not total duration. A long
 * prefill is legitimate work, not a hang — bounding total time would defeat the
 * entire purpose of streaming.
 *
 * Completion contract: a truncated stream is NOT a successful stream. The loop
 * can end for four different reasons and they must not be conflated:
 *   1. client/upstream abort      → AbortError (never a success)
 *   2. idle gap exceeded          → TimeoutError
 *   3. upstream closed early      → incomplete-stream error (no terminal marker)
 *   4. genuine completion         → [DONE] and/or a finish_reason was observed
 * Without (4) a dropped connection could be cached and shown as a finished
 * answer, which is worse than an honest error.
 */
export async function consumeOpenAiSse(response, { onDelta, idleTimeoutMs = 120000, signal } = {}) {
  if (!response.body) {
    throw new Error('Upstream returned no response body for streaming request.');
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let usage = null;
  let finishReason = null;
  let sawAnything = false;
  let sawDoneMarker = false;
  let idleTimer = null;
  let idleFired = false;

  const armIdle = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      idleFired = true;
      reader.cancel().catch(() => {});
    }, idleTimeoutMs);
  };
  const disarmIdle = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = null;
  };

  const makeAbortError = () =>
    Object.assign(new Error('Streaming request was aborted'), { name: 'AbortError' });

  const onAbort = () => {
    reader.cancel().catch(() => {});
  };
  const wasAborted = () => Boolean(signal?.aborted);
  if (signal) {
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }

  try {
    armIdle();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      armIdle();
      sawAnything = true;
      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by a blank line. Process every complete frame.
      let sep;
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        for (const rawLine of frame.split('\n')) {
          const line = rawLine.trim();
          if (!line || line.startsWith(':')) continue; // comment / keep-alive
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (payload === '[DONE]') {
            sawDoneMarker = true;
            continue;
          }
          let parsed;
          try {
            parsed = JSON.parse(payload);
          } catch {
            continue; // tolerate partial/odd frames rather than killing the stream
          }
          if (parsed.usage) usage = parsed.usage;
          const choice = (parsed.choices || [])[0];
          if (!choice) continue;
          if (choice.finish_reason) finishReason = choice.finish_reason;
          const delta = choice.delta || {};
          const piece = delta.content || '';
          if (piece) {
            text += piece;
            if (typeof onDelta === 'function') onDelta(piece);
          }
        }
      }
    }
  } finally {
    disarmIdle();
    if (signal) signal.removeEventListener?.('abort', onAbort);
  }

  // Order matters: an abort must never be reported as success, even when the
  // abort happened after we had already received (partial) content.
  if (wasAborted()) throw makeAbortError();
  if (idleFired) {
    const err = new Error(`Upstream stream idle for more than ${idleTimeoutMs}ms`);
    err.name = 'TimeoutError';
    throw err;
  }
  if (!sawAnything) {
    throw new Error('Upstream returned an empty stream.');
  }
  // A stream that stops mid-answer is a failure, not a short answer. Verified
  // against both Mistral and oMLX: a complete stream always carries `[DONE]`
  // and a terminal finish_reason.
  if (!sawDoneMarker && !finishReason) {
    const err = new Error(
      'Upstream stream ended before completion (no [DONE] marker and no finish_reason).',
    );
    err.name = 'IncompleteStreamError';
    err.code = 'ERR_INCOMPLETE_STREAM';
    err.partialText = text;
    throw err;
  }
  return { text, usage, finishReason, sawDoneMarker };
}

/**
 * POST to an OpenAI-compatible /chat/completions endpoint and stream deltas.
 * `signal` lets the caller abort when the browser disconnects.
 *
 * `headersTimeoutMs` bounds only the wait for response headers. Without it a
 * provider that accepts the connection and then never answers would hang until
 * the client gives up — the idle guard cannot help because no body exists yet.
 */
export async function fetchChatStream(
  url,
  {
    headers = {},
    model,
    messages,
    temperature = 0.1,
    maxTokens = 8192,
    reasoningEffort,
    onDelta,
    idleTimeoutMs = 120000,
    headersTimeoutMs = 120000,
    signal,
    fetchImpl,
  } = {},
) {
  const doFetch = fetchImpl || fetch;

  if (signal?.aborted) {
    throw Object.assign(new Error('Streaming request was aborted before start'), {
      name: 'AbortError',
    });
  }

  // Guard the header phase separately from the body phase.
  const headerGuard = new AbortController();
  const headerTimer = setTimeout(() => {
    headerGuard.abort();
    headerGuard.abortedByTimer = true;
  }, headersTimeoutMs);
  const combinedSignal = signal
    ? AbortSignal.any([signal, headerGuard.signal])
    : headerGuard.signal;

  let response;
  try {
    response = await doFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        stream: true,
        // Only sent when a caller asks for it: providers that don't understand
        // the field would reject an explicit `undefined` less gracefully than an
        // absent key.
        ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
        // Verified on both Mistral and oMLX: returns `usage` in the final chunk.
        stream_options: { include_usage: true },
      }),
      signal: combinedSignal,
    });
  } catch (err) {
    if (headerGuard.abortedByTimer && !signal?.aborted) {
      const timeoutErr = new Error(
        `Upstream did not send response headers within ${headersTimeoutMs}ms`,
      );
      timeoutErr.name = 'TimeoutError';
      throw timeoutErr;
    }
    throw err;
  } finally {
    clearTimeout(headerTimer);
  }

  if (!response.ok) {
    const raw = await response.text().catch(() => '');
    let detail = raw;
    try {
      const parsed = JSON.parse(raw);
      detail = parsed?.error?.message || parsed?.error || raw;
    } catch {
      // non-JSON error body (proxy page, plain text) — keep the raw text
    }
    const err = new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
    err.status = response.status;
    err.responseText = raw;
    throw err;
  }

  const { text, usage, finishReason } = await consumeOpenAiSse(response, {
    onDelta,
    idleTimeoutMs,
    // The combined signal keeps the caller's abort observable downstream while
    // the header timer is already disarmed.
    signal: combinedSignal,
  });
  return { content: text, usage, finishReason };
}
