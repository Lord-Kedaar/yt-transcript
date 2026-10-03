import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const RETENTION_MS = 24 * 60 * 60 * 1000;
const SECRET_KEY = /authorization|api[_-]?key|token|password|secret/i;
const CONTENT_KEY = /transcript|snippets|rawtext|messages|prompt|content/i;

export function classifyError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  const code = String(error?.code || '').toUpperCase();
  const status = Number(error?.status || error?.statusCode || 0);
  // undici hides the real code under `err.cause` (see collectErrorSignals).
  const signals = collectErrorSignals(error);

  // Timeout is checked before abort on purpose: AbortSignal.timeout() rejects
  // with a TimeoutError whose message reads "The operation was aborted due to
  // timeout", so a plain 'aborted' substring test would swallow every timeout
  // into 'abort'. A user-initiated cancel keeps name 'AbortError' and still
  // lands in the abort branch below.
  if (
    error?.name === 'TimeoutError' ||
    code === 'ETIMEDOUT' ||
    signals.has('ETIMEDOUT') ||
    signals.has('TIMEOUTERROR') ||
    message.includes('timeout') ||
    message.includes('timed out')
  )
    return 'timeout';
  if (
    error?.name === 'AbortError' ||
    code === 'ABORT_ERR' ||
    signals.has('ABORT_ERR') ||
    message.includes('aborted')
  )
    return 'abort';
  if (
    code === 'ENOTFOUND' ||
    signals.has('ENOTFOUND') ||
    code === 'EAI_AGAIN' ||
    signals.has('EAI_AGAIN') ||
    message.includes('dns')
  )
    return 'dns';
  if (code.startsWith('ERR_TLS') || message.includes('tls') || message.includes('certificate'))
    return 'tls';
  if (status === 401 || status === 403 || status === 429) return `http_${status}`;
  if (status >= 500 && status <= 599) return 'http_5xx';
  if (status >= 400 && status <= 499) return `http_${status}`;
  if (
    message.includes('fetch failed') ||
    message.includes('econn') ||
    code.startsWith('ECONN') ||
    code === 'ENETUNREACH'
  )
    return 'network';
  if (message.includes('invalid response') || message.includes('invalid json'))
    return 'invalid_response';
  if (message.includes('empty response')) return 'empty_response';
  return 'unknown';
}

/**
 * Network-layer failure signals that mean "the request never got an answer"
 * and are worth retrying.
 *
 * Node's `fetch` (undici) hides the actionable code inside `err.cause`: the
 * visible error is a bare `TypeError: fetch failed`, and the real code
 * (ETIMEDOUT, ECONNRESET, UND_ERR_CONNECT_TIMEOUT, ...) sits in the cause —
 * often inside an AggregateError's `errors` array, which holds one entry per
 * resolved address (a host with 16 A/AAAA records produces 16 entries).
 * Matching only on the top-level message therefore misses every network
 * failure, which is how a recoverable blip becomes a hard 500 with no retry.
 */
export const RETRYABLE_NETWORK_SIGNALS = new Set([
  'ETIMEDOUT',
  'ECONNRESET',
  'ECONNREFUSED',
  'EAI_AGAIN',
  'ABORT_ERR',
  'TIMEOUTERROR',
  'ABORTERROR',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_SOCKET',
]);

/**
 * Collect error codes and error names from an error and its whole `cause`
 * chain, including AggregateError member errors. Returned uppercased so a
 * `code` ('ETIMEDOUT') and a `name` ('TimeoutError' -> 'TIMEOUTERROR') can be
 * matched against a single signal set.
 */
export function collectErrorSignals(error, { maxDepth = 5 } = {}) {
  const signals = new Set();
  let node = error;
  for (let depth = 0; node && typeof node === 'object' && depth < maxDepth; depth += 1) {
    if (node.code) signals.add(String(node.code).toUpperCase());
    if (node.name) signals.add(String(node.name).toUpperCase());
    if (Array.isArray(node.errors)) {
      for (const inner of node.errors) {
        if (inner?.code) signals.add(String(inner.code).toUpperCase());
        if (inner?.name) signals.add(String(inner.name).toUpperCase());
      }
    }
    node = node.cause;
  }
  return signals;
}

/**
 * Whether the failure is a transport-layer problem worth retrying, however
 * deeply `fetch` nested the real cause.
 */
export function isRetryableNetworkError(error) {
  if (!error || typeof error !== 'object') return false;
  for (const signal of collectErrorSignals(error)) {
    if (RETRYABLE_NETWORK_SIGNALS.has(signal)) return true;
  }
  return false;
}

export function sanitizeForLog(value, key = '') {
  if (SECRET_KEY.test(key)) return '[REDACTED]';
  if (CONTENT_KEY.test(key)) return '[OMITTED]';
  if (typeof value === 'string')
    return value.replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]').slice(0, 500);
  if (Array.isArray(value)) return `[${value.length} items omitted]`;
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([entryKey, entryValue]) => [
      entryKey,
      sanitizeForLog(entryValue, entryKey),
    ]),
  );
}

export function cleanupExpiredLogs(logDir, { now = Date.now(), activeFileName } = {}) {
  if (!fs.existsSync(logDir)) return 0;
  let removed = 0;
  for (const name of fs.readdirSync(logDir)) {
    const filePath = path.join(logDir, name);
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || name === activeFileName || now - stat.mtimeMs <= RETENTION_MS) continue;
    fs.unlinkSync(filePath);
    removed += 1;
  }
  return removed;
}

export function publicTransformError({ type, fallbackAttempted }) {
  if (type !== 'summarize')
    return 'Usługa AI jest chwilowo niedostępna. Spróbuj ponownie za chwilę.';
  if (fallbackAttempted)
    return 'Podsumowanie AI jest chwilowo niedostępne. Usługa zapasowa AI również nie odpowiedziała; spróbuj ponownie za chwilę.';
  return 'Podsumowanie AI jest chwilowo niedostępne. Problem dotyczy usługi AI, nie pobierania transkrypcji. Spróbuj ponownie za chwilę.';
}

export function createDiagnosticLogger({ logDir } = {}) {
  const resolvedDir =
    logDir ||
    path.join(
      process.env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state'),
      'yttranscript',
      'logs',
    );
  const activeFileName = () => `yttranscript-${new Date().toISOString().slice(0, 10)}.jsonl`;
  const cleanup = () => cleanupExpiredLogs(resolvedDir, { activeFileName: activeFileName() });
  fs.mkdirSync(resolvedDir, { recursive: true });
  cleanup();
  const interval = setInterval(cleanup, 60 * 60 * 1000);
  interval.unref();
  let operationCounter = 0;

  const event = (level, eventName, fields = {}) => {
    const line = JSON.stringify(
      sanitizeForLog({ timestamp: new Date().toISOString(), level, event: eventName, ...fields }),
    );
    fs.appendFileSync(path.join(resolvedDir, activeFileName()), `${line}\n`, 'utf8');
  };

  const healthFields = result => ({
    endpoint: result.endpoint || null,
    durationMs: result.durationMs ?? 0,
    ok: result.ok,
    status: result.status || null,
    errorClassification:
      result.errorClassification ?? (result.ok ? null : classifyError(result.error)),
    technicalCause: sanitizeForLog(result.technicalCause || result.error, 'cause'),
    retryable: result.retryable ?? false,
  });

  return {
    logDir: resolvedDir,
    event,
    createOperationContext(requestId) {
      const normalizedRequestId = requestId || `req_${crypto.randomUUID()}`;
      const operationId = `op_${++operationCounter}_${normalizedRequestId.slice(-8)}`;
      const timings = {};
      let disconnected = false;
      let closeListener;

      const correlated = fields => ({ operationId, requestId: normalizedRequestId, ...fields });
      return {
        operationId,
        requestId: normalizedRequestId,
        tick(phase) {
          timings[phase] = Date.now();
          event('info', 'operation.tick', correlated({ phase }));
        },
        span(fromPhase, toPhase) {
          if (!timings[fromPhase]) return null;
          return Math.max(0, (timings[toPhase] ?? Date.now()) - timings[fromPhase]);
        },
        end(phase, extra = {}) {
          if (!timings[phase]) return;
          event(
            'info',
            'operation.phase_end',
            correlated({
              phase,
              durationMs: Date.now() - timings[phase],
              ...extra,
            }),
          );
        },
        probe(provider, phase, result) {
          event(
            result.ok ? 'info' : 'warn',
            `provider.health.${result.ok ? 'succeeded' : 'failed'}`,
            correlated({ provider, phase, ...healthFields(result) }),
          );
        },
        chat(phase, extra = {}) {
          event(phase === 'failed' ? 'error' : 'info', `provider.chat.${phase}`, correlated(extra));
        },
        fallback(action, extra = {}) {
          event('info', `provider.fallback.${action}`, correlated(extra));
        },
        selectProvider(provider, reason) {
          event('info', 'provider.selected', correlated({ provider, reason }));
        },
        transformPhase(phase, extra = {}) {
          event('info', `transform.${phase}`, correlated(extra));
        },
        disconnect(reason = 'client_abort') {
          disconnected = true;
          event('warn', 'response.client_disconnect', correlated({ reason }));
        },
        finish({ sent = true } = {}) {
          event(
            'info',
            'response.finish',
            correlated({
              clientDisconnected: disconnected,
              responseSent: sent,
            }),
          );
        },
        closeAfterDisconnect() {
          event('info', 'response.close_after_disconnect', correlated({ responseSent: false }));
        },
        bindResponseClose(res) {
          closeListener = () => {
            if (!res.writableEnded) this.disconnect('client_abort');
          };
          res.on('close', closeListener);
        },
        unbindResponseClose(res) {
          if (closeListener) res.off('close', closeListener);
        },
      };
    },
    probe(provider, phase, result) {
      event(result.ok ? 'info' : 'warn', `provider.health.${result.ok ? 'succeeded' : 'failed'}`, {
        provider,
        phase,
        ...healthFields(result),
      });
    },
  };
}
