#!/usr/bin/env node

import { spawn } from 'node:child_process';
import process from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const desktopDevScript = path.resolve(rootDir, 'apps', 'desktop', 'scripts', 'dev.mjs');

const child = spawn(process.execPath, [desktopDevScript, ...process.argv.slice(2)], {
  cwd: path.resolve(rootDir, 'apps', 'desktop'),
  stdio: 'inherit',
  shell: false,
});

child.on('close', (code) => {
  process.exit(code || 0);
});
