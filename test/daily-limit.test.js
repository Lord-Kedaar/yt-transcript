import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import http from 'node:http';

// ── Helpers ──────────────────────────────────────────────────────────

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');
const TEST_STORE_PATH = path.join(PROJECT_ROOT, '.ai-daily-limit.test.json');
const TEST_PORT = 4005;

function cleanStore() {
  try { fs.unlinkSync(TEST_STORE_PATH); } catch { /* ok */ }
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
      timeout: 10000,
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let body;
        try { body = JSON.parse(data); } catch { body = data; }
        resolve({ status: res.statusCode, headers: res.headers, body });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    req.end();
  });
}

// ── Tests ────────────────────────────────────────────────────────────

test('daily limit: server responds to health check', async (t) => {
  const res = await httpRequest(`http://127.0.0.1:${TEST_PORT}/api/health`);
  assert.equal(res.status, 200, 'Health check should return 200');
  assert.ok(res.body.status, 'Health check should have status field');
});

test('daily limit: limit status endpoint returns correct values', async (t) => {
  const res = await httpRequest(`http://127.0.0.1:${TEST_PORT}/api/ai-limit-status`);
  assert.equal(res.status, 200, 'Limit status should return 200');
  assert.equal(res.body.limitEnabled, true, 'Limit should be enabled');
  assert.equal(res.body.dailyLimit, 6, 'Daily limit should be 6');
  assert.equal(typeof res.body.remainingToday, 'number', 'remainingToday should be a number');
});

test('daily limit: CF-Connecting-IP header is respected', async (t) => {
  const res = await httpRequest(`http://127.0.0.1:${TEST_PORT}/api/ai-limit-status`, {
    headers: { 'CF-Connecting-IP': '10.0.0.1' },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.usedToday, 0);
});

test('daily limit: IPv4-mapped IPv6 normalization', async (t) => {
  const res = await httpRequest(`http://127.0.0.1:${TEST_PORT}/api/ai-limit-status`, {
    headers: { 'CF-Connecting-IP': '::ffff:10.0.0.2' },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.usedToday, 0);
});

test('daily limit: day reset works for old entries', async (t) => {
  // Pre-populate store with yesterday's data using a known IP hash
  // Hash of '9.9.9.9' = '1a22570d6105dfec' (SHA256 first 16 hex chars)
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const store = {
    '1a22570d6105dfec': { date: yesterday, count: 6 },
  };
  fs.writeFileSync(TEST_STORE_PATH, JSON.stringify(store));

  const res = await httpRequest(`http://127.0.0.1:${TEST_PORT}/api/ai-limit-status`, {
    headers: { 'CF-Connecting-IP': '9.9.9.9' },
  });
  assert.equal(res.status, 200);
  // The old entry from yesterday should be reset, so usedToday should be 0
  assert.equal(res.body.usedToday, 0);

  cleanStore();
});
