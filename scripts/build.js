import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const dist = path.join(root, 'client', 'dist');
const out = path.join(dist, 'build-info.json');

fs.mkdirSync(dist, { recursive: true });

const info = {
  name: 'yt-transcript',
  version: '3.2.0',
  builtAt: new Date().toISOString(),
  note: 'Build metadata is refreshed on launch; the SPA remains static.'
};

fs.writeFileSync(out, JSON.stringify(info, null, 2) + '\n', 'utf8');
console.log(`build info written to ${out}`);
