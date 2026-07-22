import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  cleanupExpiredLogs,
  createDiagnosticLogger,
  publicTransformError,
  sanitizeForLog,
} from '../diagnostics.js';

test('diagnostic logger redacts secrets and transcript payloads', () => {
  const safe = sanitizeForLog({
    apiKey: 'secret',
    snippets: [{ text: 'private transcript' }],
    message: 'Bearer abc.def',
  });
  assert.equal(safe.apiKey, '[REDACTED]');
  assert.equal(safe.snippets, '[OMITTED]');
  assert.equal(safe.message, 'Bearer [REDACTED]');
});

test('cleanup removes only logs older than 24 hours', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yt-log-test-'));
  const oldFile = path.join(dir, 'old.jsonl');
  const freshFile = path.join(dir, 'fresh.jsonl');
  fs.writeFileSync(oldFile, 'old');
  fs.writeFileSync(freshFile, 'fresh');
  const now = Date.now();
  fs.utimesSync(oldFile, new Date(now - 25 * 60 * 60 * 1000), new Date(now - 25 * 60 * 60 * 1000));
  assert.equal(cleanupExpiredLogs(dir, { now }), 1);
  assert.equal(fs.existsSync(oldFile), false);
  assert.equal(fs.existsSync(freshFile), true);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('cleanup preserves the active log even when its timestamp is older than retention', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yt-log-test-'));
  const activeFile = 'yttranscript-active.jsonl';
  const activePath = path.join(dir, activeFile);
  fs.writeFileSync(activePath, 'active');
  const now = Date.now();
  fs.utimesSync(
    activePath,
    new Date(now - 25 * 60 * 60 * 1000),
    new Date(now - 25 * 60 * 60 * 1000),
  );
  assert.equal(cleanupExpiredLogs(dir, { now, activeFileName: activeFile }), 0);
  assert.equal(fs.existsSync(activePath), true);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('logger writes structured JSONL without protected payload', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yt-log-test-'));
  const logger = createDiagnosticLogger({ logDir: dir });
  logger.event('error', 'transform.failed', {
    requestId: 'r1',
    transcript: 'private',
    token: 'secret',
  });
  const line = fs.readFileSync(path.join(dir, fs.readdirSync(dir)[0]), 'utf8');
  assert.match(line, /"requestId":"r1"/);
  assert.doesNotMatch(line, /private|secret/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('public summary errors distinguish fallback state and do not expose fetch failure', () => {
  assert.match(
    publicTransformError({ type: 'summarize', fallbackAttempted: false }),
    /nie pobierania transkrypcji/,
  );
  assert.match(publicTransformError({ type: 'summarize', fallbackAttempted: true }), /zapasowa/);
});
