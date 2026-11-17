#!/usr/bin/env node

/**
 * Send2Me — Development Runner & Supervisor
 * 
 * 1. Runs pre-dev cleanup (terminates old instances & frees port 5173).
 * 2. Spawns `@tauri-apps/cli` directly using `process.execPath` without cmd.exe wrapper
 *    to prevent the Windows "Terminate batch job (Y/N)?" prompt on Ctrl+C.
 * 3. Registers exit signal hooks (SIGINT, SIGTERM, SIGHUP, exit) for atomic teardown.
 */

import { spawn, execSync } from 'node:child_process';
import process from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { freePort, killDevProcesses } from './predev.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(appDir, '../..');
const isWindows = process.platform === 'win32';

process.env.NODE_NO_WARNINGS = '1';

console.log('\n===============================================================');
console.log('  ⚡ Send2Me — Local Dev Environment (100% Offline Mode)');
console.log('===============================================================');
console.log(`  📁 App Directory : ${appDir}`);
console.log(`  🦀 Rust Core     : ${path.join(appDir, 'src-tauri')}`);
console.log('  🖥️ Dev Server    : http://localhost:5173 (Vite + React 19)');
console.log('  🛑 To Stop       : Press Ctrl+C once to clean and terminate');
console.log('===============================================================\n');

killDevProcesses();
freePort(5173);

let child = null;
let hasCleanedUp = false;

function cleanExit(signal = 'EXIT') {
  if (hasCleanedUp) return;
  hasCleanedUp = true;

  console.log(`\n🛑 Received ${signal}: Shutting down Send2Me development environment...`);

  if (child && child.pid) {
    try {
      if (isWindows) {
        execSync(`taskkill /F /T /PID ${child.pid} 2>nul || exit 0`, {
          windowsHide: true,
          shell: true,
          stdio: 'ignore'
        });
      } else {
        child.kill('SIGKILL');
      }
    } catch {}
  }

  killDevProcesses();
  freePort(5173);

  console.log('🧹 Cleaned up dev Send2Me process, Vite dev server, and worker threads.');
  console.log('✨ System and ports returned back to normal.\n');
  process.exit(0);
}

process.on('SIGINT', () => cleanExit('SIGINT'));
process.on('SIGTERM', () => cleanExit('SIGTERM'));
process.on('SIGHUP', () => cleanExit('SIGHUP'));
process.on('SIGBREAK', () => cleanExit('SIGBREAK'));
process.on('exit', () => cleanExit('EXIT'));

function startDevProcess() {
  const tauriCliScript = path.resolve(appDir, 'node_modules', '@tauri-apps', 'cli', 'tauri.js');

  child = spawn(process.execPath, [tauriCliScript, 'dev'], {
    cwd: appDir,
    stdio: 'inherit',
    shell: false,
    windowsHide: false,
    env: {
      ...process.env,
      RUST_BACKTRACE: '1',
      NODE_NO_WARNINGS: '1'
    }
  });

  child.on('close', (code) => {
    cleanExit(`CLOSE_${code || 0}`);
  });

  child.on('error', (err) => {
    console.error('Failed to start Tauri dev process:', err);
    cleanExit('ERROR');
  });
}

startDevProcess();
