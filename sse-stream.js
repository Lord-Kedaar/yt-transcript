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
  let sawAnyEvent = false;
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

  const onAbort = () => {
    reader.cancel().catch(() => {});
  };
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
          if (payload === '[DONE]') continue;
          let parsed;
          try {
            parsed = JSON.parse(payload);
          } catch {
            continue; // tolerate partial/odd frames rather than killing the stream
          }
          sawAnyEvent = true;
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

  if (idleFired) {
    const err = new Error(`Upstream stream idle for more than ${idleTimeoutMs}ms`);
    err.name = 'TimeoutError';
    throw err;
  }
  if (!sawAnyEvent) {
    throw new Error('Upstream returned an empty stream.');
  }
  return { text, usage, finishReason };
}

/**
 * POST to an OpenAI-compatible /chat/completions endpoint and stream deltas.
 * `signal` lets the caller abort when the browser disconnects.
 */
export async function fetchChatStream(
  url,
  {
    headers = {},
    model,
    messages,
    temperature = 0.1,
    maxTokens = 8192,
    onDelta,
    idleTimeoutMs = 120000,
    signal,
    fetchImpl,
  } = {},
) {
  const doFetch = fetchImpl || fetch;
  const response = await doFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: true,
      // Verified on both Mistral and oMLX: returns `usage` in the final chunk.
      stream_options: { include_usage: true },
    }),
    signal,
  });

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
    signal,
  });
  return { content: text, usage, finishReason };
}
