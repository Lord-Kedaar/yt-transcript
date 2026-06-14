import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

function gitShortSha() {
  try {
    return execSync('git rev-parse --short HEAD', {
      cwd: resolve(__dirname, '..'),
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    }).trim();
  } catch {
    return 'unknown';
  }
}

function createBuildInfo() {
  const builtAt = new Date().toISOString();
  const gitSha = gitShortSha();
  return {
    version: `${builtAt.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}-${gitSha}`,
    builtAt,
    gitSha,
    port: 4000,
  };
}

const buildInfo = createBuildInfo();
const publicDir = resolve(__dirname, 'public');
mkdirSync(publicDir, { recursive: true });
writeFileSync(
  resolve(publicDir, 'build-version.json'),
  `${JSON.stringify(buildInfo, null, 2)}\n`,
  'utf8',
);
console.log(`build-info: ${buildInfo.version}`);

export default defineConfig({
  plugins: [react()],
  base: '/',
  define: {
    __BUILD_INFO__: JSON.stringify(buildInfo),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true, // was false (stale asset risk, audit #8)
  },
  server: {
    port: 4001,
    strictPort: true,
    host: process.env.VITE_EXPOSE === '1' ? '0.0.0.0' : 'localhost',
    allowedHosts: process.env.VITE_EXPOSE === '1' ? true : false,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
