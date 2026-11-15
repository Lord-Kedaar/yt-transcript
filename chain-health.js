// Chain-level provider health probing.
//
// /api/health has to answer "is the AI usable at all?", not "is the currently
// active provider healthy right now?". The provider state machine only probes
// the *resolved* member of the chain (see provider-state-machine.js health()),
// so a single slow or unreachable active provider used to report the whole AI
// as offline even while a fallback (oMLX) kept answering.
//
// This helper probes every chain member except the one already reported, each
// bounded by a hard timeout, and never throws: a throwing probe is reported as
// { ok: false } so the caller can decide availability from the whole set.

export const DEFAULT_CHAIN_PROBE_TIMEOUT_MS = 6000;

/**
 * @param {Array<{name: string, health: function(): Promise<object>}>} providers
 * @param {{ skipName?: string|null, timeoutMs?: number }} [options]
 * @returns {Promise<Array<{name: string, ok: boolean, state: string|null, durationMs: number, error?: string}>>}
 */
export async function probeProviderChain(providers, options = {}) {
  const { skipName = null, timeoutMs = DEFAULT_CHAIN_PROBE_TIMEOUT_MS } = options;
  const list = Array.isArray(providers) ? providers : [];
  const targets = list.filter(p => p && p.name && p.name !== skipName);

  return Promise.all(
    targets.map(async p => {
      const started = Date.now();
      let timer = null;
      try {
        const health = await Promise.race([
          p.health(),
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('chain probe timeout')), timeoutMs);
          }),
        ]);
        return {
          name: p.name,
          ok: Boolean(health && health.ok),
          state: (health && health.state) || null,
          durationMs: Date.now() - started,
        };
      } catch (err) {
        return {
          name: p.name,
          ok: false,
          state: 'unreachable',
          error: (err && err.message) || String(err),
          durationMs: Date.now() - started,
        };
      } finally {
        // Never leave a pending timer behind: it would keep the event loop
        // alive in tests and in short-lived processes.
        if (timer) clearTimeout(timer);
      }
    }),
  );
}
