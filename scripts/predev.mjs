#!/usr/bin/env node

/**
 * Send2Me — Root Pre-Dev Runner & Exporter
 * Delegates cleanly to apps/desktop/scripts/predev.mjs and re-exports utilities.
 */

import { spawn } from 'node:child_process';
import process from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const desktopPredevScript = path.resolve(rootDir, 'apps', 'desktop', 'scripts', 'predev.mjs');

export * from '../apps/desktop/scripts/predev.mjs';

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

if (isMain) {
  const child = spawn(process.execPath, [desktopPredevScript, ...process.argv.slice(2)], {
    cwd: path.resolve(rootDir, 'apps', 'desktop'),
    stdio: 'inherit',
    shell: false,
  });

  child.on('close', (code) => {
    process.exit(code || 0);
  });

  child.on('error', (err) => {
    console.error('Failed to run predev script:', err);
    process.exit(1);
  });
}
