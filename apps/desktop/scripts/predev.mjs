#!/usr/bin/env node

import { execSync } from 'node:child_process';
import process from 'node:process';

const isWindows = process.platform === 'win32';

export function freePort(port = 5173) {
  if (!isWindows) return;
  try {
    const output = execSync(`netstat -ano -p tcp | findstr :${port} | findstr LISTENING`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    const lines = output.trim().split('\n');
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && Number(pid) > 0 && Number(pid) !== process.pid) {
        try {
          execSync(`taskkill /F /PID ${pid} 2>nul`, { stdio: 'ignore' });
        } catch {}
      }
    }
  } catch {}
}

export function killDevProcesses() {
  if (!isWindows) return;
  try {
    execSync('taskkill /F /IM send2me.exe 2>nul || exit 0', { shell: true, stdio: 'ignore' });
    execSync('taskkill /F /IM Send2Me.exe 2>nul || exit 0', { shell: true, stdio: 'ignore' });
  } catch {}
}

function main() {
  killDevProcesses();
  freePort(5173);
  console.log('🧹 Pre-dev: Cleaned lingering Send2Me processes and freed port 5173.');
}

if (process.argv[1] && process.argv[1].endsWith('predev.mjs')) {
  main();
}
