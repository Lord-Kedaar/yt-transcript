import test from 'node:test';
import assert from 'node:assert/strict';
import { probeProviderChain } from '../chain-health.js';

const okProvider = name => ({
  name,
  async health() {
    return { ok: true, state: 'connected', modelCount: 9 };
  },
});

const downProvider = name => ({
  name,
  async health() {
    throw new Error('connect ECONNREFUSED');
  },
});

const hangingProvider = name => ({
  name,
  health() {
    return new Promise(() => {}); // never settles
  },
});

test('reports a healthy fallback while the active provider is down', async () => {
  const chain = [downProvider('FreeLLMAPI'), okProvider('oMLX')];
  const result = await probeProviderChain(chain, { skipName: 'FreeLLMAPI' });

  assert.equal(result.length, 1);
  assert.equal(result[0].name, 'oMLX');
  assert.equal(result[0].ok, true);
  assert.equal(result[0].state, 'connected');
});

test('a hanging probe is bounded by the timeout and reported as unreachable', async () => {
  const started = Date.now();
  const result = await probeProviderChain([hangingProvider('oMLX')], { timeoutMs: 80 });
  const elapsed = Date.now() - started;

  assert.equal(result.length, 1);
  assert.equal(result[0].ok, false);
  assert.equal(result[0].state, 'unreachable');
  assert.equal(result[0].error, 'chain probe timeout');
  assert.ok(elapsed < 2000, `probe must not hang (took ${elapsed} ms)`);
});

test('a throwing provider does not reject the whole probe', async () => {
  const result = await probeProviderChain(
    [downProvider('FreeLLMAPI'), okProvider('oMLX')],
    { skipName: 'FreeLLMAPI' },
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].ok, true);
});

test('skipName excludes the active provider from the probe', async () => {
  const chain = [okProvider('FreeLLMAPI'), okProvider('oMLX')];
  const result = await probeProviderChain(chain, { skipName: 'oMLX' });

  assert.deepEqual(result.map(r => r.name), ['FreeLLMAPI']);
});

test('whole chain down yields no ok entry (AI offline)', async () => {
  const chain = [downProvider('FreeLLMAPI'), hangingProvider('oMLX')];
  const result = await probeProviderChain(chain, { skipName: 'FreeLLMAPI', timeoutMs: 80 });

  assert.equal(result.some(r => r.ok), false);
});

test('tolerates a missing/invalid chain', async () => {
  assert.deepEqual(await probeProviderChain(null), []);
  assert.deepEqual(await probeProviderChain(undefined), []);
  assert.deepEqual(await probeProviderChain([]), []);
});
