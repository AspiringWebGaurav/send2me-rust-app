#!/usr/bin/env node

import { spawn } from 'node:child_process';
import process from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const desktopPredevScript = path.resolve(rootDir, 'apps', 'desktop', 'scripts', 'predev.mjs');

const child = spawn(process.execPath, [desktopPredevScript, ...process.argv.slice(2)], {
  cwd: path.resolve(rootDir, 'apps', 'desktop'),
  stdio: 'inherit',
  shell: false,
});

child.on('close', (code) => {
  process.exit(code || 0);
});
