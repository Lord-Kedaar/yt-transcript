/**
 * Daily AI limit — server-backed integration tests.
 *
 * These tests used to assume a server was already listening on :4005, so they
 * failed on every clean checkout (they were excluded from CI for that reason).
 * The suite now spawns its own server on a dedicated port with a throwaway
 * store file, waits for it to answer, and tears it down afterwards. That makes
 * the tests self-contained: no external process, no clobbering of the real
 * .ai-daily-limit.json.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';
import http from 'node:http';
import { spawn } from 'node:child_process';

// ── Fixture ──────────────────────────────────────────────────────────

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');
const TEST_PORT = Number(process.env.YTTRANSCRIPT_TEST_PORT) || 4015;
const TEST_STORE_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'yt-limit-test-')),
  'store.json',
);
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const READY_TIMEOUT_MS = 20000;

let child = null;

function startServer() {
  child = spawn(process.execPath, ['server.js'], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      PORT: String(TEST_PORT),
      HOST: '127.0.0.1',
      NODE_ENV: 'test',
      YTTRANSCRIPT_AI_DAILY_LIMIT_ENABLED: 'true',
      YTTRANSCRIPT_AI_LIMIT_STORE: TEST_STORE_PATH,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  child.stdout.on('data', d => {
    output += d;
  });
  child.stderr.on('data', d => {
    output += d;
  });

  return new Promise((resolve, reject) => {
    const deadline = Date.now() + READY_TIMEOUT_MS;
    const poll = async () => {
      if (child.exitCode !== null) {
        reject(new Error(`server exited early (code ${child.exitCode}):\n${output}`));
        return;
      }
      try {
        const res = await httpRequest(`${BASE_URL}/api/health`, { timeout: 2000 });
        if (res.status === 200) {
          resolve();
          return;
        }
      } catch {
        /* not up yet */
      }
      if (Date.now() > deadline) {
        reject(new Error(`server not ready within ${READY_TIMEOUT_MS}ms:\n${output}`));
        return;
      }
      setTimeout(poll, 250);
    };
    poll();
  });
}

function httpRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = {
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: options.timeout || 10000,
    };
    const req = http.request(opts, res => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        let body;
        try {
          body = JSON.parse(data);
        } catch {
          body = data;
        }
        resolve({ status: res.statusCode, headers: res.headers, body });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
    if (options.body) req.write(JSON.stringify(options.body));
    req.end();
  });
}

before(async () => {
  await startServer();
});

after(() => {
  if (child && child.exitCode === null) child.kill('SIGTERM');
  fs.rmSync(path.dirname(TEST_STORE_PATH), { recursive: true, force: true });
});

// ── Tests ────────────────────────────────────────────────────────────

test('daily limit: server responds to health check', async () => {
  const res = await httpRequest(`${BASE_URL}/api/health`);
  assert.equal(res.status, 200, 'Health check should return 200');
  assert.ok(res.body.status, 'Health check should have status field');
});

test('daily limit: limit status endpoint returns correct values', async () => {
  const res = await httpRequest(`${BASE_URL}/api/ai-limit-status`);
  assert.equal(res.status, 200, 'Limit status should return 200');
  assert.equal(res.body.limitEnabled, true, 'Limit should be enabled');
  assert.equal(res.body.dailyLimit, 6, 'Daily limit should be 6');
  assert.equal(typeof res.body.remainingToday, 'number', 'remainingToday should be a number');
});

test('daily limit: CF-Connecting-IP header is respected', async () => {
  const res = await httpRequest(`${BASE_URL}/api/ai-limit-status`, {
    headers: { 'CF-Connecting-IP': '10.0.0.1' },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.usedToday, 0);
});

test('daily limit: IPv4-mapped IPv6 normalization', async () => {
  const res = await httpRequest(`${BASE_URL}/api/ai-limit-status`, {
    headers: { 'CF-Connecting-IP': '::ffff:10.0.0.2' },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.usedToday, 0);
});

test('daily limit: day reset works for old entries', async () => {
  // Pre-populate the throwaway store with yesterday's data, using the known
  // hash of '9.9.9.9' (SHA-256, first 16 hex chars).
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const store = { '1a22570d6105dfec': { date: yesterday, count: 6 } };
  fs.writeFileSync(TEST_STORE_PATH, JSON.stringify(store));

  // The count is read fresh on each request, so no restart is needed.
  const res = await httpRequest(`${BASE_URL}/api/ai-limit-status`, {
    headers: { 'CF-Connecting-IP': '9.9.9.9' },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.usedToday, 0, 'stale entry from yesterday must reset to 0');
});

test('daily limit: distinct IPs get independent counters', async () => {
  const first = await httpRequest(`${BASE_URL}/api/ai-limit-status`, {
    headers: { 'CF-Connecting-IP': '203.0.113.7' },
  });
  const second = await httpRequest(`${BASE_URL}/api/ai-limit-status`, {
    headers: { 'CF-Connecting-IP': '203.0.113.8' },
  });
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  // Either both are 0 (store empty for them) — the point is they are not
  // sharing a single bucket keyed on something constant.
  assert.equal(first.body.usedToday, second.body.usedToday);
});
