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

  if (error?.name === 'AbortError' || code === 'ABORT_ERR' || message.includes('aborted'))
    return 'abort';
  if (
    error?.name === 'TimeoutError' ||
    code === 'ETIMEDOUT' ||
    message.includes('timeout') ||
    message.includes('timed out')
  )
    return 'timeout';
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN' || message.includes('dns')) return 'dns';
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
