#!/usr/bin/env node
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TEST_SCRIPTS = ['test-summary-parser.mjs', 'test-pdf-pagination.mjs'];

let passed = 0;
let failed = 0;
const failedSuites = [];

for (const script of TEST_SCRIPTS) {
  const scriptPath = path.join(__dirname, script);
  process.stdout.write(`\n--- ${script} ---\n`);

  const child = spawn('node', [scriptPath], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';

  child.stdout.on('data', d => {
    stdout += d;
    process.stdout.write(d);
  });
  child.stderr.on('data', d => {
    stderr += d;
    process.stderr.write(d);
  });

  await new Promise(resolve => {
    child.on('close', code => {
      if (code === 0) {
        passed++;
      } else {
        failed++;
        failedSuites.push(script);
      }
      resolve();
    });
  });
}

process.stdout.write('\n==================\n');
process.stdout.write(`Results: ${passed} passed, ${failed} failed\n`);
process.stdout.write(`Suites: ${TEST_SCRIPTS.length} total\n`);
if (failedSuites.length) {
  process.stdout.write(`Failed: ${failedSuites.join(', ')}\n`);
}
process.stdout.write('==================\n');

process.exit(failed > 0 ? 1 : 0);
