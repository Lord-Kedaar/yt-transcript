import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  classifyError,
  cleanupExpiredLogs,
  collectErrorSignals,
  createDiagnosticLogger,
  isRetryableNetworkError,
  publicTransformError,
  sanitizeForLog,
} from '../diagnostics.js';

// ── Helpers ──────────────────────────────────────────────────────────

function makeTempLogDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'yt-log-test-'));
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

function findEvent(events, name) {
  return events.find(e => e.event === name);
}

function findEvents(events, name) {
  return events.filter(e => e.event === name);
}

// ── Scope Item 3: Error classification ────────────────────────────────

test('classifyError identifies timeout errors', () => {
  const err = new Error('Operation timed out after 5000ms');
  err.name = 'TimeoutError';
  assert.equal(classifyError(err), 'timeout');
});

test('classifyError identifies timeout from code ETIMEDOUT', () => {
  const err = new Error('fetch failed');
  err.code = 'ETIMEDOUT';
  assert.equal(classifyError(err), 'timeout');
});

test('classifyError identifies network errors (ECONNRESET)', () => {
  const err = new Error('fetch failed');
  err.code = 'ECONNRESET';
  assert.equal(classifyError(err), 'network');
});

test('classifyError identifies network errors (fetch failed message)', () => {
  const err = new Error('fetch failed: connection refused');
  assert.equal(classifyError(err), 'network');
});

test('classifyError identifies DNS errors (ENOTFOUND)', () => {
  const err = new Error('getaddrinfo failed');
  err.code = 'ENOTFOUND';
  assert.equal(classifyError(err), 'dns');
});

test('classifyError identifies DNS errors (EAI_AGAIN)', () => {
  const err = new Error('DNS resolution failed');
  err.code = 'EAI_AGAIN';
  assert.equal(classifyError(err), 'dns');
});

test('classifyError identifies TLS errors', () => {
  const err = new Error('certificate verification failed');
  err.code = 'ERR_TLS_CERT_ERROR';
  assert.equal(classifyError(err), 'tls');
});

test('classifyError identifies abort errors', () => {
  const err = new Error('The operation was aborted');
  err.name = 'AbortError';
  assert.equal(classifyError(err), 'abort');
});

test('classifyError identifies abort from code ABORT_ERR', () => {
  const err = new Error('aborted');
  err.code = 'ABORT_ERR';
  assert.equal(classifyError(err), 'abort');
});

test('classifyError identifies HTTP 401', () => {
  const err = new Error('Unauthorized');
  err.status = 401;
  assert.equal(classifyError(err), 'http_401');
});

test('classifyError identifies HTTP 403', () => {
  const err = new Error('Forbidden');
  err.status = 403;
  assert.equal(classifyError(err), 'http_403');
});

test('classifyError identifies HTTP 429 (rate limit)', () => {
  const err = new Error('Too many requests');
  err.status = 429;
  assert.equal(classifyError(err), 'http_429');
});

test('classifyError identifies HTTP 5xx errors', () => {
  const err = new Error('Internal Server Error');
  err.status = 500;
  assert.equal(classifyError(err), 'http_5xx');
  const err502 = new Error('Bad Gateway');
  err502.status = 502;
  assert.equal(classifyError(err502), 'http_5xx');
  const err503 = new Error('Service Unavailable');
  err503.status = 503;
  assert.equal(classifyError(err503), 'http_5xx');
});

test('classifyError identifies invalid_response', () => {
  const err = new Error('invalid response from provider');
  assert.equal(classifyError(err), 'invalid_response');
});

test('classifyError identifies invalid_response (invalid json)', () => {
  const err = new Error('invalid json response');
  assert.equal(classifyError(err), 'invalid_response');
});

test('classifyError identifies empty_response', () => {
  const err = new Error('empty response');
  assert.equal(classifyError(err), 'empty_response');
});

test('classifyError falls back to unknown', () => {
  const err = new Error('something weird happened');
  assert.equal(classifyError(err), 'unknown');
});

test('classifyError handles null/undefined gracefully', () => {
  assert.equal(classifyError(null), 'unknown');
  assert.equal(classifyError(undefined), 'unknown');
  assert.equal(classifyError(''), 'unknown');
});

// ── Scope Item 5: Redaction ───────────────────────────────────────────

test('sanitizeForLog redacts apiKey', () => {
  const safe = sanitizeForLog({ apiKey: 'secret' }, 'apiKey');
  assert.equal(safe, '[REDACTED]');
});

test('sanitizeForLog redacts authorization header', () => {
  const safe = sanitizeForLog({ authorization: 'Bearer abc.def.ghi' }, 'authorization');
  assert.equal(safe, '[REDACTED]');
});

test('sanitizeForLog redacts token', () => {
  const safe = sanitizeForLog({ token: 'tok_abc123' }, 'token');
  assert.equal(safe, '[REDACTED]');
});

test('sanitizeForLog redacts password', () => {
  const safe = sanitizeForLog({ password: 's3cr3t' }, 'password');
  assert.equal(safe, '[REDACTED]');
});

test('sanitizeForLog redacts secret', () => {
  const safe = sanitizeForLog({ secret: 'xyz' }, 'secret');
  assert.equal(safe, '[REDACTED]');
});

test('sanitizeForLog omits transcript content', () => {
  const safe = sanitizeForLog({ transcript: 'private transcript text' }, 'transcript');
  assert.equal(safe, '[OMITTED]');
});

test('sanitizeForLog omits snippets', () => {
  const safe = sanitizeForLog({ snippets: [{ text: 'snippet content' }] }, 'snippets');
  assert.equal(safe, '[OMITTED]');
});

test('sanitizeForLog omits messages (prompt content)', () => {
  const safe = sanitizeForLog({ messages: [{ role: 'user', content: 'prompt' }] }, 'messages');
  assert.equal(safe, '[OMITTED]');
});

test('sanitizeForLog omits prompt', () => {
  const safe = sanitizeForLog({ prompt: 'system prompt text' }, 'prompt');
  assert.equal(safe, '[OMITTED]');
});

test('sanitizeForLog omits content', () => {
  const safe = sanitizeForLog({ content: 'user content' }, 'content');
  assert.equal(safe, '[OMITTED]');
});

test('sanitizeForLog redacts Bearer tokens in string values', () => {
  const safe = sanitizeForLog('Bearer abc.def.ghi');
  assert.match(safe, /Bearer \[REDACTED\]/);
  assert.doesNotMatch(safe, /abc\.def\.ghi/);
});

test('sanitizeForLog redacts nested Bearer tokens', () => {
  const safe = sanitizeForLog({ message: 'Bearer secret.token.here' });
  assert.equal(safe.message, 'Bearer [REDACTED]');
});

test('sanitizeForLog truncates long strings to 500 chars', () => {
  const long = 'x'.repeat(600);
  const safe = sanitizeForLog(long);
  assert.equal(safe.length, 500);
});

test('sanitizeForLog redacts secrets and omits transcript payloads in nested objects', () => {
  const safe = sanitizeForLog({
    apiKey: 'secret',
    snippets: [{ text: 'private transcript' }],
    message: 'Bearer abc.def',
    otherField: 'ok',
  });
  assert.equal(safe.apiKey, '[REDACTED]');
  assert.equal(safe.snippets, '[OMITTED]');
  assert.equal(safe.message, 'Bearer [REDACTED]');
  assert.equal(safe.otherField, 'ok');
});

test('sanitizeForLog handles arrays as omitted count', () => {
  const safe = sanitizeForLog([1, 2, 3], 'snippets');
  assert.equal(safe, '[OMITTED]');
  const safeArr = sanitizeForLog([1, 2, 3], 'otherKey');
  assert.match(safeArr, /\[3 items omitted\]/);
});

// ── Scope Item 5: 24h retention ────────────────────────────────────────

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

test('cleanup preserves the active log even when older than retention', () => {
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

test('cleanup returns 0 for non-existent directory', () => {
  assert.equal(cleanupExpiredLogs('/nonexistent/path/xyz'), 0);
});

test('cleanup preserves files exactly at 24h boundary', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yt-log-test-'));
  const boundaryFile = path.join(dir, 'boundary.jsonl');
  fs.writeFileSync(boundaryFile, 'boundary');
  const now = Date.now();
  // 23h59m — just under retention
  fs.utimesSync(
    boundaryFile,
    new Date(now - 23 * 60 * 60 * 1000 - 59 * 60 * 1000),
    new Date(now - 23 * 60 * 60 * 1000 - 59 * 60 * 1000),
  );
  assert.equal(cleanupExpiredLogs(dir, { now }), 0);
  assert.equal(fs.existsSync(boundaryFile), true);
  fs.rmSync(dir, { recursive: true, force: true });
});

// ── Scope Items 1-2: Logger JSONL output, correlation IDs, phases ──

test('logger writes structured JSONL without protected payload', () => {
  const dir = makeTempLogDir();
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

test('logger JSONL lines are valid JSON with timestamp, level, event', () => {
  const dir = makeTempLogDir();
  const logger = createDiagnosticLogger({ logDir: dir });
  logger.event('info', 'test.event', { requestId: 'r-test' });
  const events = readJsonlEvents(dir);
  assert.ok(events.length > 0);
  const evt = events[0];
  assert.equal(evt.event, 'test.event');
  assert.equal(evt.level, 'info');
  assert.ok(typeof evt.timestamp === 'string');
  assert.match(evt.timestamp, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(evt.requestId, 'r-test');
  fs.rmSync(dir, { recursive: true, force: true });
});

// ── Scope Item 2: Operation context correlation ─────────────────────

test('createOperationContext generates unique requestId and operationId', () => {
  const dir = makeTempLogDir();
  const logger = createDiagnosticLogger({ logDir: dir });
  const op1 = logger.createOperationContext('req-aaa');
  const op2 = logger.createOperationContext('req-bbb');
  assert.equal(op1.requestId, 'req-aaa');
  assert.equal(op2.requestId, 'req-bbb');
  assert.notEqual(op1.operationId, op2.operationId);
  assert.match(op1.operationId, /^op_\d+_/);
  assert.match(op2.operationId, /^op_\d+_/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('createOperationContext generates requestId when not provided', () => {
  const dir = makeTempLogDir();
  const logger = createDiagnosticLogger({ logDir: dir });
  const op = logger.createOperationContext();
  assert.ok(op.requestId);
  assert.match(op.requestId, /^req_/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('operation context tick logs phase with correlation IDs', () => {
  const dir = makeTempLogDir();
  const logger = createDiagnosticLogger({ logDir: dir });
  const op = logger.createOperationContext('req-tick-test');
  op.tick('request_received');
  const events = readJsonlEvents(dir);
  const tickEvt = findEvent(events, 'operation.tick');
  assert.ok(tickEvt, 'operation.tick event should exist');
  assert.equal(tickEvt.phase, 'request_received');
  assert.equal(tickEvt.requestId, 'req-tick-test');
  assert.ok(tickEvt.operationId, 'operationId must be present');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('operation context span measures duration between phases', () => {
  const dir = makeTempLogDir();
  const logger = createDiagnosticLogger({ logDir: dir });
  const op = logger.createOperationContext('req-span-test');
  op.tick('start');
  // Small delay to ensure measurable duration
  const ms = op.span('start', 'start');
  assert.ok(ms !== null);
  assert.ok(ms >= 0);
  // span for unknown phase returns null
  assert.equal(op.span('nonexistent', 'start'), null);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('operation context end logs phase_end with durationMs', () => {
  const dir = makeTempLogDir();
  const logger = createDiagnosticLogger({ logDir: dir });
  const op = logger.createOperationContext('req-end-test');
  op.tick('chat_start');
  op.end('chat_start', { provider: 'Mistral' });
  const events = readJsonlEvents(dir);
  const endEvt = findEvent(events, 'operation.phase_end');
  assert.ok(endEvt, 'operation.phase_end event should exist');
  assert.equal(endEvt.phase, 'chat_start');
  assert.ok(typeof endEvt.durationMs === 'number');
  assert.equal(endEvt.provider, 'Mistral');
  assert.equal(endEvt.requestId, 'req-end-test');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('operation context end does not log for untracked phase', () => {
  const dir = makeTempLogDir();
  const logger = createDiagnosticLogger({ logDir: dir });
  const op = logger.createOperationContext('req-noend-test');
  op.end('untracked_phase', { provider: 'Mistral' });
  const events = readJsonlEvents(dir);
  const endEvt = findEvent(events, 'operation.phase_end');
  assert.equal(endEvt, undefined);
  fs.rmSync(dir, { recursive: true, force: true });
});

// ── Scope Item 1: Health probes ───────────────────────────────────────

test('op.probe logs provider.health.succeeded for healthy provider', () => {
  const dir = makeTempLogDir();
  const logger = createDiagnosticLogger({ logDir: dir });
  const op = logger.createOperationContext('req-probe-ok');
  op.probe('Mistral', 'preflight', {
    ok: true,
    endpoint: 'https://api.mistral.ai',
    durationMs: 50,
    status: 'connected',
  });
  const events = readJsonlEvents(dir);
  const probeEvt = findEvent(events, 'provider.health.succeeded');
  assert.ok(probeEvt, 'provider.health.succeeded event should exist');
  assert.equal(probeEvt.provider, 'Mistral');
  assert.equal(probeEvt.phase, 'preflight');
  assert.equal(probeEvt.ok, true);
  assert.equal(probeEvt.endpoint, 'https://api.mistral.ai');
  assert.equal(probeEvt.level, 'info');
  assert.equal(probeEvt.requestId, 'req-probe-ok');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('op.probe logs provider.health.failed with classification and technicalCause', () => {
  const dir = makeTempLogDir();
  const logger = createDiagnosticLogger({ logDir: dir });
  const op = logger.createOperationContext('req-probe-fail');
  op.probe('Mistral', 'preflight', {
    ok: false,
    endpoint: 'https://api.mistral.ai',
    durationMs: 3000,
    status: 'unreachable',
    error: new Error('timed out after 6000ms'),
  });
  const events = readJsonlEvents(dir);
  const probeEvt = findEvent(events, 'provider.health.failed');
  assert.ok(probeEvt, 'provider.health.failed event should exist');
  assert.equal(probeEvt.provider, 'Mistral');
  assert.equal(probeEvt.ok, false);
  assert.equal(probeEvt.level, 'warn');
  assert.ok(probeEvt.errorClassification, 'errorClassification must be present');
  assert.equal(probeEvt.errorClassification, 'timeout');
  assert.ok(probeEvt.technicalCause, 'technicalCause must be present');
  assert.equal(probeEvt.requestId, 'req-probe-fail');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('op.probe includes retryable field', () => {
  const dir = makeTempLogDir();
  const logger = createDiagnosticLogger({ logDir: dir });
  const op = logger.createOperationContext('req-probe-retry');
  op.probe('Mistral', 'preflight', {
    ok: false,
    endpoint: 'https://api.mistral.ai',
    durationMs: 5000,
    status: 'unreachable',
    error: new Error('fetch failed'),
    retryable: true,
  });
  const events = readJsonlEvents(dir);
  const probeEvt = findEvent(events, 'provider.health.failed');
  assert.equal(probeEvt.retryable, true);
  fs.rmSync(dir, { recursive: true, force: true });
});

// ── Scope Item 2: Full event correlation pipeline ─────────────────────

test('full summarize pipeline emits correlated events: request → selection → chat → completed', () => {
  const dir = makeTempLogDir();
  const logger = createDiagnosticLogger({ logDir: dir });
  const op = logger.createOperationContext('req-pipeline-sum');

  // Simulate a successful summarize pipeline
  op.transformPhase('requested', { type: 'summarize', mode: 'original', snippetCount: 10 });
  op.tick('request_received');
  op.tick('preflight');
  const providerSelectionEvent = {
    primary: 'Mistral',
    selected: 'Mistral',
    ok: true,
    durationMs: 50,
    fallbackConfigured: false,
    fallbackAttempted: false,
    fallbackDecision: 'no-fallback-configured',
  };
  op.transformPhase('preflight', providerSelectionEvent);
  op.selectProvider('Mistral', 'no-fallback-configured');
  op.tick('chat_start');
  op.chat('start', { provider: 'Mistral', endpoint: 'https://api.mistral.ai' });
  op.tick('chat_succeeded');
  op.chat('succeeded', { provider: 'Mistral', durationMs: 2000 });
  op.tick('response_complete');
  op.transformPhase('completed', {
    type: 'summarize',
    provider: 'Mistral',
    model: 'mistral-small-2603',
    durationMs: 2000,
    outputLength: 500,
  });
  op.finish({ sent: true });

  const events = readJsonlEvents(dir);

  // Verify all expected events exist and are correlated
  const requested = findEvent(events, 'transform.requested');
  const preflight = findEvent(events, 'transform.preflight');
  const selected = findEvent(events, 'provider.selected');
  const chatStart = findEvent(events, 'provider.chat.start');
  const chatSucceeded = findEvent(events, 'provider.chat.succeeded');
  const completed = findEvent(events, 'transform.completed');
  const finish = findEvent(events, 'response.finish');

  assert.ok(requested, 'transform.requested event should exist');
  assert.ok(preflight, 'transform.preflight event should exist');
  assert.ok(selected, 'provider.selected event should exist');
  assert.ok(chatStart, 'provider.chat.start event should exist');
  assert.ok(chatSucceeded, 'provider.chat.succeeded event should exist');
  assert.ok(completed, 'transform.completed event should exist');
  assert.ok(finish, 'response.finish event should exist');

  // All events must carry the same requestId and operationId
  for (const evt of [requested, preflight, selected, chatStart, chatSucceeded, completed, finish]) {
    assert.equal(evt.requestId, 'req-pipeline-sum', `${evt.event} must carry requestId`);
    assert.ok(evt.operationId, `${evt.event} must carry operationId`);
  }

  // Verify specific fields
  assert.equal(requested.type, 'summarize');
  assert.equal(selected.provider, 'Mistral');
  assert.equal(selected.reason, 'no-fallback-configured');
  assert.equal(chatStart.provider, 'Mistral');
  assert.equal(chatSucceeded.provider, 'Mistral');
  assert.ok(chatSucceeded.durationMs >= 0, 'chat.succeeded must have durationMs');
  assert.equal(completed.type, 'summarize');
  assert.equal(completed.provider, 'Mistral');
  assert.equal(finish.responseSent, true);

  fs.rmSync(dir, { recursive: true, force: true });
});

test('full reconstruct pipeline emits correlated events', () => {
  const dir = makeTempLogDir();
  const logger = createDiagnosticLogger({ logDir: dir });
  const op = logger.createOperationContext('req-pipeline-rec');

  op.transformPhase('requested', { type: 'reconstruct', mode: 'original', snippetCount: 5 });
  op.tick('request_received');
  op.selectProvider('Mistral', 'no-fallback-configured');
  op.chat('start', { provider: 'Mistral' });
  op.chat('succeeded', { provider: 'Mistral', durationMs: 1500 });
  op.transformPhase('completed', {
    type: 'reconstruct',
    provider: 'Mistral',
    model: 'mistral-small-2603',
    durationMs: 1500,
    outputLength: 300,
  });
  op.finish({ sent: true });

  const events = readJsonlEvents(dir);
  const requested = findEvent(events, 'transform.requested');
  const completed = findEvent(events, 'transform.completed');

  assert.ok(requested, 'transform.requested event should exist');
  assert.ok(completed, 'transform.completed event should exist');
  assert.equal(requested.type, 'reconstruct');
  assert.equal(completed.type, 'reconstruct');
  assert.equal(requested.requestId, 'req-pipeline-rec');
  assert.equal(completed.requestId, 'req-pipeline-rec');
  assert.equal(requested.operationId, completed.operationId);

  fs.rmSync(dir, { recursive: true, force: true });
});

// ── Scope Item 2: Fallback pipeline ───────────────────────────────────

test('fallback pipeline: health failure → oMLX fallback selection → fallback event', () => {
  const dir = makeTempLogDir();
  const logger = createDiagnosticLogger({ logDir: dir });
  const op = logger.createOperationContext('req-fallback-test');

  // Simulate Mistral health failure
  op.probe('Mistral', 'preflight', {
    ok: false,
    endpoint: 'https://api.mistral.ai',
    durationMs: 6000,
    status: 'unreachable',
    error: new Error('timed out after 6000ms'),
    retryable: true,
  });

  // Simulate fallback to oMLX
  op.fallback('selected', { from: 'Mistral', to: 'oMLX', reason: 'health_check_failed' });
  op.selectProvider('oMLX', 'selected-fallback');

  const events = readJsonlEvents(dir);
  const healthFail = findEvent(events, 'provider.health.failed');
  const fallbackSelected = findEvent(events, 'provider.fallback.selected');
  const providerSelected = findEvent(events, 'provider.selected');

  assert.ok(healthFail, 'provider.health.failed should exist');
  assert.ok(fallbackSelected, 'provider.fallback.selected should exist');
  assert.ok(providerSelected, 'provider.selected should exist');

  assert.equal(healthFail.provider, 'Mistral');
  assert.equal(healthFail.errorClassification, 'timeout');
  assert.equal(fallbackSelected.from, 'Mistral');
  assert.equal(fallbackSelected.to, 'oMLX');
  assert.equal(providerSelected.provider, 'oMLX');
  assert.equal(providerSelected.reason, 'selected-fallback');

  // All correlated
  assert.equal(healthFail.requestId, 'req-fallback-test');
  assert.equal(fallbackSelected.requestId, 'req-fallback-test');
  assert.equal(providerSelected.requestId, 'req-fallback-test');
  assert.equal(healthFail.operationId, fallbackSelected.operationId);

  fs.rmSync(dir, { recursive: true, force: true });
});

test('fallback pipeline: all providers fail → fallback-attempted-no-healthy-provider', () => {
  const dir = makeTempLogDir();
  const logger = createDiagnosticLogger({ logDir: dir });
  const op = logger.createOperationContext('req-all-fail');

  op.probe('Mistral', 'preflight', {
    ok: false,
    endpoint: 'https://api.mistral.ai',
    durationMs: 6000,
    status: 'unreachable',
    error: new Error('timed out'),
  });
  op.probe('oMLX', 'preflight', {
    ok: false,
    endpoint: 'http://localhost:8585',
    durationMs: 3000,
    status: 'unreachable',
    error: new Error('fetch failed'),
  });
  op.selectProvider('Mistral', 'fallback-attempted-no-healthy-provider');
  op.transformPhase('failed', {
    status: 503,
    errorClassification: 'timeout',
    technicalCause: 'no_healthy_provider',
  });
  op.finish({ sent: true });

  const events = readJsonlEvents(dir);
  const failedEvents = findEvents(events, 'provider.health.failed');
  const transformFailed = findEvent(events, 'transform.failed');
  const finish = findEvent(events, 'response.finish');

  assert.equal(failedEvents.length, 2, 'Two provider.health.failed events expected');
  assert.ok(transformFailed, 'transform.failed should exist');
  assert.ok(finish, 'response.finish should exist');
  assert.equal(transformFailed.errorClassification, 'timeout');
  assert.equal(transformFailed.technicalCause, 'no_healthy_provider');
  assert.equal(finish.responseSent, true);

  fs.rmSync(dir, { recursive: true, force: true });
});

// ── Scope Item 2: Chat failure with error classification ─────────────

test('chat failure logs provider.chat.failed with classification and technicalCause', () => {
  const dir = makeTempLogDir();
  const logger = createDiagnosticLogger({ logDir: dir });
  const op = logger.createOperationContext('req-chat-fail');

  const err = new Error('Request timed out after 120000ms');
  err.name = 'TimeoutError';

  op.chat('failed', {
    provider: 'Mistral',
    endpoint: 'https://api.mistral.ai',
    durationMs: 120000,
    errorClassification: classifyError(err),
    technicalCause: err.message,
    fallbackAttempted: false,
  });
  op.transformPhase('failed', {
    status: 502,
    errorClassification: classifyError(err),
    technicalCause: err.message,
  });
  op.finish({ sent: true });

  const events = readJsonlEvents(dir);
  const chatFailed = findEvent(events, 'provider.chat.failed');
  const transformFailed = findEvent(events, 'transform.failed');

  assert.ok(chatFailed, 'provider.chat.failed should exist');
  assert.equal(chatFailed.provider, 'Mistral');
  assert.equal(chatFailed.errorClassification, 'timeout');
  assert.ok(chatFailed.technicalCause);
  assert.match(chatFailed.technicalCause, /timed out/i);
  assert.equal(chatFailed.fallbackAttempted, false);
  assert.equal(chatFailed.level, 'error');
  assert.equal(transformFailed.errorClassification, 'timeout');

  fs.rmSync(dir, { recursive: true, force: true });
});

test('chat failure with HTTP 401 classification', () => {
  const dir = makeTempLogDir();
  const logger = createDiagnosticLogger({ logDir: dir });
  const op = logger.createOperationContext('req-401');

  const err = new Error('Unauthorized');
  err.status = 401;

  op.chat('failed', {
    provider: 'Mistral',
    durationMs: 100,
    errorClassification: classifyError(err),
    technicalCause: err.message,
    fallbackAttempted: false,
  });

  const events = readJsonlEvents(dir);
  const chatFailed = findEvent(events, 'provider.chat.failed');
  assert.equal(chatFailed.errorClassification, 'http_401');
  assert.equal(chatFailed.technicalCause, 'Unauthorized');

  fs.rmSync(dir, { recursive: true, force: true });
});

test('chat failure with HTTP 429 classification', () => {
  const dir = makeTempLogDir();
  const logger = createDiagnosticLogger({ logDir: dir });
  const op = logger.createOperationContext('req-429');

  const err = new Error('Too many requests');
  err.status = 429;

  op.chat('failed', {
    provider: 'Mistral',
    durationMs: 50,
    errorClassification: classifyError(err),
    technicalCause: err.message,
    fallbackAttempted: true,
  });

  const events = readJsonlEvents(dir);
  const chatFailed = findEvent(events, 'provider.chat.failed');
  assert.equal(chatFailed.errorClassification, 'http_429');
  assert.equal(chatFailed.fallbackAttempted, true);

  fs.rmSync(dir, { recursive: true, force: true });
});

test('chat failure with HTTP 5xx classification', () => {
  const dir = makeTempLogDir();
  const logger = createDiagnosticLogger({ logDir: dir });
  const op = logger.createOperationContext('req-5xx');

  const err = new Error('Internal Server Error');
  err.status = 503;

  op.chat('failed', {
    provider: 'Mistral',
    durationMs: 200,
    errorClassification: classifyError(err),
    technicalCause: err.message,
    fallbackAttempted: false,
  });

  const events = readJsonlEvents(dir);
  const chatFailed = findEvent(events, 'provider.chat.failed');
  assert.equal(chatFailed.errorClassification, 'http_5xx');

  fs.rmSync(dir, { recursive: true, force: true });
});

test('chat failure with network error classification', () => {
  const dir = makeTempLogDir();
  const logger = createDiagnosticLogger({ logDir: dir });
  const op = logger.createOperationContext('req-net-err');

  const err = new Error('fetch failed');
  err.code = 'ECONNRESET';

  op.chat('failed', {
    provider: 'Mistral',
    durationMs: 30,
    errorClassification: classifyError(err),
    technicalCause: err.message,
    fallbackAttempted: true,
  });

  const events = readJsonlEvents(dir);
  const chatFailed = findEvent(events, 'provider.chat.failed');
  assert.equal(chatFailed.errorClassification, 'network');
  assert.equal(chatFailed.fallbackAttempted, true);

  fs.rmSync(dir, { recursive: true, force: true });
});

// ── Scope Item 2: Empty response classification ───────────────────────

test('empty response logs provider.chat.failed with empty_response classification', () => {
  const dir = makeTempLogDir();
  const logger = createDiagnosticLogger({ logDir: dir });
  const op = logger.createOperationContext('req-empty-resp');

  const err = new Error('Provider returned an empty response.');
  op.chat('failed', {
    provider: 'Mistral',
    durationMs: 5000,
    errorClassification: classifyError(err),
    technicalCause: err.message,
    fallbackAttempted: false,
  });
  op.transformPhase('failed', { status: 502, errorClassification: 'empty_response' });
  op.finish({ sent: true });

  const events = readJsonlEvents(dir);
  const chatFailed = findEvent(events, 'provider.chat.failed');
  const transformFailed = findEvent(events, 'transform.failed');

  assert.ok(chatFailed);
  assert.equal(chatFailed.errorClassification, 'empty_response');
  assert.equal(transformFailed.errorClassification, 'empty_response');
  assert.equal(transformFailed.status, 502);

  fs.rmSync(dir, { recursive: true, force: true });
});

// ── Scope Item 4: Client disconnect tracking ─────────────────────────

test('op.disconnect logs response.client_disconnect with reason', () => {
  const dir = makeTempLogDir();
  const logger = createDiagnosticLogger({ logDir: dir });
  const op = logger.createOperationContext('req-disconnect');

  op.disconnect('client_abort');

  const events = readJsonlEvents(dir);
  const discEvt = findEvent(events, 'response.client_disconnect');
  assert.ok(discEvt, 'response.client_disconnect event should exist');
  assert.equal(discEvt.reason, 'client_abort');
  assert.equal(discEvt.level, 'warn');
  assert.equal(discEvt.requestId, 'req-disconnect');
  assert.ok(discEvt.operationId, 'disconnect event must carry operationId');

  fs.rmSync(dir, { recursive: true, force: true });
});

test('op.disconnect defaults reason to client_abort', () => {
  const dir = makeTempLogDir();
  const logger = createDiagnosticLogger({ logDir: dir });
  const op = logger.createOperationContext('req-disconnect-default');

  op.disconnect();

  const events = readJsonlEvents(dir);
  const discEvt = findEvent(events, 'response.client_disconnect');
  assert.ok(discEvt);
  assert.equal(discEvt.reason, 'client_abort');

  fs.rmSync(dir, { recursive: true, force: true });
});

test('op.finish logs response.finish with clientDisconnected flag', () => {
  const dir = makeTempLogDir();
  const logger = createDiagnosticLogger({ logDir: dir });
  const op = logger.createOperationContext('req-finish-disc');

  op.disconnect('client_abort');
  op.finish({ sent: false });

  const events = readJsonlEvents(dir);
  const finishEvt = findEvent(events, 'response.finish');
  assert.ok(finishEvt);
  assert.equal(finishEvt.clientDisconnected, true);
  assert.equal(finishEvt.responseSent, false);

  fs.rmSync(dir, { recursive: true, force: true });
});

test('op.finish with sent=true after no disconnect shows clientDisconnected=false', () => {
  const dir = makeTempLogDir();
  const logger = createDiagnosticLogger({ logDir: dir });
  const op = logger.createOperationContext('req-finish-ok');

  op.finish({ sent: true });

  const events = readJsonlEvents(dir);
  const finishEvt = findEvent(events, 'response.finish');
  assert.ok(finishEvt);
  assert.equal(finishEvt.clientDisconnected, false);
  assert.equal(finishEvt.responseSent, true);

  fs.rmSync(dir, { recursive: true, force: true });
});

test('op.closeAfterDisconnect logs response.close_after_disconnect', () => {
  const dir = makeTempLogDir();
  const logger = createDiagnosticLogger({ logDir: dir });
  const op = logger.createOperationContext('req-close-disc');

  op.closeAfterDisconnect();

  const events = readJsonlEvents(dir);
  const closeEvt = findEvent(events, 'response.close_after_disconnect');
  assert.ok(closeEvt, 'response.close_after_disconnect should exist');
  assert.equal(closeEvt.responseSent, false);
  assert.equal(closeEvt.requestId, 'req-close-disc');

  fs.rmSync(dir, { recursive: true, force: true });
});

// ── Scope Item 2: Response finish/close events ───────────────────────

test('op.finish logs response.finish with responseSent field', () => {
  const dir = makeTempLogDir();
  const logger = createDiagnosticLogger({ logDir: dir });
  const op = logger.createOperationContext('req-finish-test');

  op.finish({ sent: true });

  const events = readJsonlEvents(dir);
  const finishEvt = findEvent(events, 'response.finish');
  assert.ok(finishEvt);
  assert.equal(finishEvt.responseSent, true);
  assert.equal(finishEvt.level, 'info');

  fs.rmSync(dir, { recursive: true, force: true });
});

// ── Scope Item 3: publicTransformError ────────────────────────────────

test('public summary errors distinguish fallback state and do not expose fetch failure', () => {
  assert.match(
    publicTransformError({ type: 'summarize', fallbackAttempted: false }),
    /nie pobierania transkrypcji/,
  );
  assert.match(publicTransformError({ type: 'summarize', fallbackAttempted: true }), /zapasowa/);
});

test('publicTransformError for non-summarize type returns generic message', () => {
  const msg = publicTransformError({ type: 'reconstruct', fallbackAttempted: false });
  assert.match(msg, /chwilowo niedostępna/);
  assert.doesNotMatch(msg, /transkrypcji|zapasowa/);
});

test('publicTransformError never exposes technical error details', () => {
  // Even with an error message that looks technical, the public error should
  // not leak it.
  const msg1 = publicTransformError({ type: 'summarize', fallbackAttempted: false });
  const msg2 = publicTransformError({ type: 'reconstruct', fallbackAttempted: true });
  assert.doesNotMatch(msg1, /fetch|timeout|ECONN|Bearer|api_key|401|429|500/i);
  assert.doesNotMatch(msg2, /fetch|timeout|ECONN|Bearer|api_key|401|429|500/i);
});

// ── Scope Item 2: Multiple operations in same log file share file ────

test('multiple operations write to the same daily log file', () => {
  const dir = makeTempLogDir();
  const logger = createDiagnosticLogger({ logDir: dir });
  const op1 = logger.createOperationContext('req-multi-1');
  const op2 = logger.createOperationContext('req-multi-2');

  op1.tick('request_received');
  op2.tick('request_received');

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl'));
  assert.equal(files.length, 1, 'All events should go to a single daily log file');

  const events = readJsonlEvents(dir);
  const op1Events = events.filter(e => e.requestId === 'req-multi-1');
  const op2Events = events.filter(e => e.requestId === 'req-multi-2');
  assert.ok(op1Events.length > 0, 'op1 events should exist');
  assert.ok(op2Events.length > 0, 'op2 events should exist');
  assert.notEqual(
    op1Events[0].operationId,
    op2Events[0].operationId,
    'Different operations must have different operationIds',
  );

  fs.rmSync(dir, { recursive: true, force: true });
});

// ── Scope Item 2: Operation context incrementing counter ──────────────

test('operationId counter increments across operations', () => {
  const dir = makeTempLogDir();
  const logger = createDiagnosticLogger({ logDir: dir });
  const op1 = logger.createOperationContext('req-counter-1');
  const op2 = logger.createOperationContext('req-counter-2');
  const op3 = logger.createOperationContext('req-counter-3');

  // Extract counter number from operationId (format: op_N_xxxxxxxx)
  const counter1 = Number(op1.operationId.split('_')[1]);
  const counter2 = Number(op2.operationId.split('_')[1]);
  const counter3 = Number(op3.operationId.split('_')[1]);

  assert.ok(counter2 > counter1, 'counter should increment');
  assert.ok(counter3 > counter2, 'counter should increment');

  fs.rmSync(dir, { recursive: true, force: true });
});

// ── undici cause-chain unwrapping (2026-10-03 incident) ───────────────
//
// Production symptom: /api/transcript answered "Failed to fetch transcript."
// with HTTP 500 and no retry, while the network blip was recoverable. Node's
// fetch reports a bare `TypeError: fetch failed`; the actionable code lives in
// `err.cause`, and for a host with many A/AAAA records the cause is an
// AggregateError whose `errors` array holds one entry per address. Every check
// that only inspected the top-level message missed all of it.

function makeFetchFailed(codes, message = 'fetch failed') {
  const inner = codes.map(code => Object.assign(new Error(''), { code }));
  const cause = inner.length === 1 ? inner[0] : new AggregateError(inner, '');
  return new TypeError(message, { cause });
}

test('collectErrorSignals walks the cause chain', () => {
  const err = makeFetchFailed(['ETIMEDOUT']);
  const signals = collectErrorSignals(err);
  assert.ok(signals.has('ETIMEDOUT'), 'must surface the code nested under cause');
});

test('collectErrorSignals reads every AggregateError member', () => {
  const err = makeFetchFailed(['ETIMEDOUT', 'ECONNREFUSED', 'ENETUNREACH']);
  const signals = collectErrorSignals(err);
  assert.ok(signals.has('ETIMEDOUT'));
  assert.ok(signals.has('ECONNREFUSED'));
  assert.ok(signals.has('ENETUNREACH'));
});

test('collected signals are uppercased for case-insensitive matching', () => {
  const err = makeFetchFailed(['etimedout']);
  assert.ok(collectErrorSignals(err).has('ETIMEDOUT'));
});

test('collectErrorSignals tolerates a cause cycle', () => {
  const a = new Error('a');
  a.code = 'ETIMEDOUT';
  a.cause = a; // self-referential: must terminate, not hang
  assert.ok(collectErrorSignals(a).has('ETIMEDOUT'));
});

test('classifyError unwraps ETIMEDOUT hidden under cause', () => {
  // The exact shape logged by production: fetch failed -> AggregateError.
  assert.equal(classifyError(makeFetchFailed(['ETIMEDOUT'])), 'timeout');
});

test('classifyError unwraps EAI_AGAIN hidden under cause', () => {
  assert.equal(classifyError(makeFetchFailed(['EAI_AGAIN'])), 'dns');
});

test('isRetryableNetworkError unwraps a nested ETIMEDOUT', () => {
  assert.equal(isRetryableNetworkError(makeFetchFailed(['ETIMEDOUT'])), true);
});

test('isRetryableNetworkError unwraps multi-address AggregateError', () => {
  const codes = Array.from({ length: 16 }, () => 'ETIMEDOUT');
  assert.equal(isRetryableNetworkError(makeFetchFailed(codes)), true);
});

test('isRetryableNetworkError recognises undici UND_ERR_* codes', () => {
  for (const code of ['UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_SOCKET']) {
    assert.equal(isRetryableNetworkError(makeFetchFailed([code])), true, `${code} must retry`);
  }
});

test('isRetryableNetworkError does not retry application failures', () => {
  const validation = Object.assign(new Error('Invalid request payload'), { status: 400 });
  assert.equal(isRetryableNetworkError(validation), false);
  assert.equal(isRetryableNetworkError(new Error('Provider returned an empty response.')), false);
});

test('isRetryableNetworkError accepts only objects', () => {
  assert.equal(isRetryableNetworkError(null), false);
  assert.equal(isRetryableNetworkError(undefined), false);
  assert.equal(isRetryableNetworkError('ETIMEDOUT'), false);
});

test('AbortSignal.timeout() TimeoutError classifies as timeout, not abort', () => {
  // AbortSignal.timeout() rejects with name TimeoutError and the message
  // "The operation was aborted due to timeout" — checking 'aborted' first
  // would swallow every timeout into the abort bucket.
  const err = Object.assign(new Error('The operation was aborted due to timeout'), {
    name: 'TimeoutError',
  });
  assert.equal(classifyError(err), 'timeout');
});

test('user-initiated abort still classifies as abort', () => {
  const err = Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });
  assert.equal(classifyError(err), 'abort');
});
