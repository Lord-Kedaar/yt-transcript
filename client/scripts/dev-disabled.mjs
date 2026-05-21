#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..', '..');

console.error('\nVite dev server is disabled for ytTranscript.');
console.error('Use the single-port workflow instead:');
console.error(`  cd ${rootDir}`);
console.error('  npm run build');
console.error('  ./manage.sh restart');
console.error('  open http://localhost:4000');
console.error('\nReason: port 3000 caused stale Vite vs Express :4000 divergence.\n');
process.exit(1);
