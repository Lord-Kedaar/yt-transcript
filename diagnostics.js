import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const RETENTION_MS = 24 * 60 * 60 * 1000;
const SECRET_KEY = /authorization|api[_-]?key|token|password|secret/i;
const CONTENT_KEY = /transcript|snippets|rawtext|messages|prompt|content/i;

export function classifyError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  if (
    error?.name === 'TimeoutError' ||
    message.includes('timeout') ||
    message.includes('timed out')
  )
    return 'timeout';
  if (error?.status) return `http_${error.status}`;
  if (
    message.includes('fetch failed') ||
    message.includes('econn') ||
    message.includes('eai_again')
  )
    return 'network';
  if (message.includes('empty response')) return 'empty_response';
  return 'unknown';
}

export function sanitizeForLog(value, key = '') {
  if (SECRET_KEY.test(key)) return '[REDACTED]';
  if (CONTENT_KEY.test(key)) return '[OMITTED]';
  if (typeof value === 'string') {
    return value.replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]').slice(0, 500);
  }
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
  if (fallbackAttempted) {
    return 'Podsumowanie AI jest chwilowo niedostępne. Usługa zapasowa AI również nie odpowiedziała; spróbuj ponownie za chwilę.';
  }
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
  return {
    logDir: resolvedDir,
    event(level, event, fields = {}) {
      const line = JSON.stringify(
        sanitizeForLog({ timestamp: new Date().toISOString(), level, event, ...fields }),
      );
      fs.appendFileSync(path.join(resolvedDir, activeFileName()), `${line}\n`, 'utf8');
    },
  };
}
