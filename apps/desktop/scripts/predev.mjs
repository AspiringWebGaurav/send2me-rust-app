#!/usr/bin/env node

/**
 * Send2Me — Pre-Dev Lifecycle Coordinator & Process Cleanup Supervisor
 *
 * 1. Cleanly terminates lingering Send2Me development processes and dev servers.
 * 2. Frees Vite frontend dev port (5173) and network ports.
 * 3. Sweeps stale OTA update flags and staged binaries before launching dev.
 * 4. Supports `--dev-only` to preserve system-installed Send2Me services.
 */

import { execFileSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const APP_DIR = path.resolve(__dirname, '..');
export const REPO_ROOT = path.resolve(APP_DIR, '../..');

const isWindows = process.platform === 'win32';
const queryScript = path.join(__dirname, 'query-send2me-procs.ps1');

export function sleepSync(ms) {
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch {
    const start = Date.now();
    while (Date.now() - start < ms) {}
  }
}

export function listSend2MeProcesses(rootDir = REPO_ROOT) {
  if (!isWindows) {
    return { all: [], devProcs: [], installedProcs: [] };
  }

  const normalizedRoot = path.resolve(rootDir).replace(/\//g, '\\').toLowerCase();
  let parsed = [];

  try {
    const out = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', queryScript],
      {
        windowsHide: true,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 4000,
      }
    ).trim();
    if (out) {
      const json = JSON.parse(out);
      parsed = Array.isArray(json) ? json : [json];
    }
  } catch {
    parsed = [];
  }

  const devProcs = [];
  const installedProcs = [];

  for (const proc of parsed) {
    if (!proc || !proc.pid) continue;
    const exePath = String(proc.path || '');
    const normExe = exePath.replace(/\//g, '\\').toLowerCase();
    if (!normExe || normExe.startsWith(normalizedRoot + '\\') || normExe === normalizedRoot || normExe.includes('target\\debug')) {
      devProcs.push(proc);
    } else {
      installedProcs.push(proc);
    }
  }

  return { all: parsed, devProcs, installedProcs };
}

export function freePortsSync(ports = [5173], excludePids = new Set()) {
  if (!isWindows) return;
  try {
    const netstatOut = execSync('netstat -ano -p tcp', {
      windowsHide: true,
      shell: true,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    });

    const pids = new Set();
    const patterns = ports.map((p) => `:${p}`);

    for (const line of netstatOut.split('\n')) {
      if ((line.includes('LISTENING') || line.includes('ESTABLISHED')) && patterns.some((p) => line.includes(p))) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && pid !== '0' && pid !== String(process.pid) && !excludePids.has(Number(pid))) {
          pids.add(pid);
        }
      }
    }

    for (const pid of pids) {
      try {
        execSync(`taskkill /F /PID ${pid} 2>nul || exit 0`, {
          windowsHide: true,
          shell: true,
          stdio: 'ignore',
        });
      } catch {}
    }
  } catch {}
}

export function freePort(port = 5173) {
  freePortsSync([port]);
}

export function cleanStaleUpdateFlags() {
  try {
    const tempDir =
      process.env.TEMP ||
      (process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'AppData', 'Local', 'Temp') : '');
    const localAppData =
      process.env.LOCALAPPDATA ||
      (process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'AppData', 'Local') : '');

    const candidates = [
      tempDir ? path.join(tempDir, 'com.send2me.app', 'update_restart.flag') : '',
      localAppData ? path.join(localAppData, 'Send2Me', 'update_restart.flag') : '',
    ].filter(Boolean);

    for (const flagPath of candidates) {
      if (fs.existsSync(flagPath)) {
        try {
          fs.unlinkSync(flagPath);
        } catch {}
      }
    }

    // Also sweep stale target staging files if present
    const debugTargetDir = path.join(APP_DIR, 'src-tauri', 'target', 'debug');
    if (fs.existsSync(debugTargetDir)) {
      try {
        const files = fs.readdirSync(debugTargetDir);
        for (const f of files) {
          if (f.endsWith('.bad') || f.endsWith('.staged') || f.endsWith('.tmp')) {
            try {
              fs.unlinkSync(path.join(debugTargetDir, f));
            } catch {}
          }
        }
      } catch {}
    }
  } catch {}
}

export function killDevProcesses(opts = {}) {
  if (!isWindows) {
    try {
      execSync('pkill -9 -f send2me 2>/dev/null || true', { stdio: 'ignore' });
    } catch {}
    return { devProcs: [], installedProcs: [] };
  }

  const { devProcs, installedProcs } = listSend2MeProcesses(REPO_ROOT);
  const includeInstalled = Boolean(opts.all || opts.includeInstalled);

  const targets = includeInstalled ? [...devProcs, ...installedProcs] : devProcs;

  for (const proc of targets) {
    if (proc.pid && proc.pid !== process.pid) {
      try {
        execSync(`taskkill /F /PID ${proc.pid} 2>nul || exit 0`, {
          windowsHide: true,
          shell: true,
          stdio: 'ignore',
        });
      } catch {}
    }
  }

  // Backup safeguard if no WMI paths were matched but dev instances exist
  if (!opts.devOnly && targets.length === 0) {
    try {
      execSync('taskkill /F /IM send2me.exe 2>nul || exit 0', { shell: true, stdio: 'ignore' });
      execSync('taskkill /F /IM Send2Me.exe 2>nul || exit 0', { shell: true, stdio: 'ignore' });
    } catch {}
  }

  return { devProcs, installedProcs };
}

export function cleanLingeringProcesses(opts = {}) {
  const procs = killDevProcesses(opts);
  const excludePids = opts.devOnly ? new Set(procs.installedProcs.map((p) => p.pid)) : new Set();

  freePortsSync([5173], excludePids);
  cleanStaleUpdateFlags();
  sleepSync(150);

  return procs;
}

export async function main() {
  const args = new Set(process.argv.slice(2));
  const devOnly = args.has('--dev-only');
  const all = args.has('--all') || args.has('--include-installed');

  const { devProcs, installedProcs } = cleanLingeringProcesses({ devOnly, all });

  if (devOnly) {
    console.log(
      '🧹 Pre-dev (--dev-only): Cleaned dev Send2Me processes and freed port 5173 (installed service preserved).'
    );
  } else if (all) {
    console.log(
      '🧹 Pre-dev (--all): Cleaned all Send2Me processes (dev & installed), freed port 5173, and purged staged update flags.'
    );
  } else {
    console.log(
      '🧹 Pre-dev: Cleaned dev Send2Me processes, freed port 5173, and purged staged update flags.'
    );
  }
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

if (isMain) {
  main().catch((err) => {
    console.error('❌ Pre-dev supervisor error:', err);
    process.exit(1);
  });
}
