// BUILD_INFO is injected by Vite from vite.config.js at build time.
// Fallback keeps tests/editor tooling safe outside the Vite pipeline.
const fallbackBuildInfo = {
  version: 'development-unbuilt',
  builtAt: 'unbuilt',
  gitSha: 'unknown',
  port: 4000,
};

/* global __BUILD_INFO__: readonly */
export const BUILD_INFO =
  typeof __BUILD_INFO__ !== 'undefined' ? __BUILD_INFO__ : fallbackBuildInfo;

export default BUILD_INFO;
