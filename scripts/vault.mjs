#!/usr/bin/env node

/**
 * Send2Me — Encrypted Workspace Vault Pipeline
 *
 * Securely compresses and encrypts private workspace assets into send2me-vault.enc:
 * - Environment files (.env.local, .env*, secrets)
 * - Release signing keys (.tauri/)
 * - Proprietary shipping & deployment pipelines (scripts/ship.mjs, deploy-base.mjs, check-files.mjs)
 * - Project rules and specifications (AGENTS.md, GEMINI.md)
 *
 * Encryption: AES-256-GCM + scrypt (N=16384, r=8, p=1) + Gzip level 9.
 * Defense: 2 failed unpack attempts intentionally scramble the local vault container.
 *
 * Usage:
 *   node scripts/vault.mjs pack [--pass <password>]
 *   node scripts/vault.mjs unpack [--pass <password>]
 *   node scripts/vault.mjs status
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const vaultFilePath = path.join(rootDir, 'send2me-vault.enc');
const defenseFilePath = path.join(rootDir, '.vault_attempts');

const MAGIC_HEADER = Buffer.from('S2MEVLT1', 'utf8'); // 8 bytes
const FORMAT_VERSION = 0x01;
const SALT_LEN = 32;
const IV_LEN = 12;
const TAG_LEN = 16;
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

const EXCLUDE_DIR_NAMES = new Set([
  'node_modules',
  'target',
  'dist',
  '.git',
  '.cache',
  'all-base-app',
  'send2me-immutable-base',
]);

const EXCLUDE_FILE_NAMES = new Set([
  'send2me-vault.enc',
  '.vault_attempts',
]);

async function resolvePassword(action) {
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === '--pass' || arg === '--password' || arg === '-p') {
      const val = process.argv[i + 1];
      if (val) return val;
    } else if (arg.startsWith('--pass=')) {
      return arg.slice('--pass='.length);
    } else if (arg.startsWith('--password=')) {
      return arg.slice('--password='.length);
    }
  }

  if (process.env.SEND2ME_VAULT_PASS) return process.env.SEND2ME_VAULT_PASS;
  if (process.env.VAULT_PASSWORD) return process.env.VAULT_PASSWORD;

  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    if (process.stdin.isTTY && typeof process.stdin.setRawMode === 'function') {
      process.stdout.write(`\n[Send2Me Vault] Enter master passphrase to ${action}: `);
      let password = '';

      const onData = (chunk) => {
        const str = chunk.toString('utf8');
        if (str === '\n' || str === '\r' || str === '\u0004') {
          process.stdin.removeListener('data', onData);
          process.stdin.setRawMode(false);
          process.stdout.write('\n');
          rl.close();
          const trimmed = password.trim();
          if (!trimmed) {
            console.error('\n[Error] Passphrase cannot be empty.');
            process.exit(1);
          }
          resolve(trimmed);
        } else if (str === '\u0003') {
          process.stdout.write('\n');
          process.exit(130);
        } else if (str === '\u007f' || str === '\b') {
          if (password.length > 0) {
            password = password.slice(0, -1);
            process.stdout.write('\b \b');
          }
        } else {
          password += str;
          process.stdout.write('*');
        }
      };

      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.on('data', onData);
    } else {
      rl.question(`\n[Send2Me Vault] Enter master passphrase to ${action}: `, (answer) => {
        rl.close();
        const trimmed = answer.trim();
        if (!trimmed) {
          console.error('\n[Error] Passphrase cannot be empty.');
          process.exit(1);
        }
        resolve(trimmed);
      });
    }
  });
}

function collectFiles(baseDir, relativePrefix = '') {
  const results = [];
  if (!fs.existsSync(baseDir)) return results;

  const entries = fs.readdirSync(baseDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(baseDir, entry.name);
    const relPath = relativePrefix ? path.posix.join(relativePrefix, entry.name) : entry.name;

    if (entry.isDirectory()) {
      if (EXCLUDE_DIR_NAMES.has(entry.name)) continue;
      results.push(...collectFiles(fullPath, relPath));
    } else if (entry.isFile()) {
      if (EXCLUDE_FILE_NAMES.has(entry.name)) continue;
      results.push({ fullPath, relPath });
    }
  }
  return results;
}

function checkAndRecordFailure() {
  let count = 0;
  if (fs.existsSync(defenseFilePath)) {
    try {
      count = parseInt(fs.readFileSync(defenseFilePath, 'utf8').trim(), 10) || 0;
    } catch {
      count = 0;
    }
  }
  count += 1;
  fs.writeFileSync(defenseFilePath, count.toString(), 'utf8');

  if (count >= 2) {
    console.error('\n🚨 [SECURITY BREACH DETECTED] Multiple invalid attempts on vault.');
    console.error('🔒 Activating vault defense: container scrambled.');
    if (fs.existsSync(vaultFilePath)) {
      const junk = crypto.randomBytes(fs.statSync(vaultFilePath).size || 65536);
      fs.writeFileSync(vaultFilePath, junk);
    }
    process.exit(1);
  } else {
    console.warn(`\n⚠️  [Warning] Incorrect passphrase (Attempt ${count}/2). Next failure scrambles vault.`);
  }
}

function clearFailureCount() {
  if (fs.existsSync(defenseFilePath)) {
    try {
      fs.unlinkSync(defenseFilePath);
    } catch {}
  }
}

async function packVault() {
  console.log('\n===============================================================');
  console.log('   Send2Me — Packaging Encrypted Workspace Vault');
  console.log('===============================================================\n');

  const password = await resolvePassword('PACK');
  const filesMap = new Map();

  function addFile(fullPath, relPath) {
    const normalizedRel = relPath.replace(/\\/g, '/');
    if (!filesMap.has(normalizedRel) && fs.existsSync(fullPath)) {
      filesMap.set(normalizedRel, { fullPath, relPath: normalizedRel });
    }
  }

  // Root & Apps environment files
  const searchDirs = [
    { dir: rootDir, prefix: '' },
    { dir: path.join(rootDir, 'apps', 'desktop'), prefix: 'apps/desktop' },
  ];

  for (const { dir, prefix } of searchDirs) {
    if (fs.existsSync(dir)) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isFile()) continue;
        const name = entry.name.toLowerCase();
        if (
          (name.startsWith('.env') && !name.includes('.example') && !name.includes('.sample')) ||
          name.endsWith('.local') ||
          name.includes('.local.')
        ) {
          const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
          addFile(path.join(dir, entry.name), rel);
        }
      }
    }
  }

  // Scripts, .tauri, rules, docs
  const targetedDirs = [
    { dir: path.join(rootDir, 'scripts'), prefix: 'scripts' },
    { dir: path.join(rootDir, 'apps', 'desktop', 'scripts'), prefix: 'apps/desktop/scripts' },
    { dir: path.join(rootDir, 'apps', 'desktop', '.tauri'), prefix: 'apps/desktop/.tauri' },
    { dir: path.join(rootDir, '.agents'), prefix: '.agents' },
    { dir: path.join(rootDir, 'docs'), prefix: 'docs' },
  ];

  for (const { dir, prefix } of targetedDirs) {
    if (fs.existsSync(dir)) {
      for (const item of collectFiles(dir, prefix)) {
        addFile(item.fullPath, item.relPath);
      }
    }
  }

  for (const fileName of ['AGENTS.md', 'GEMINI.md', 'PROJECT_RULES.md', 'PROJECT_MAP.json']) {
    const filePath = path.join(rootDir, fileName);
    if (fs.existsSync(filePath)) {
      addFile(filePath, fileName);
    }
  }

  if (filesMap.size === 0) {
    console.error('[Error] No private workspace files found to pack.');
    process.exit(1);
  }

  const manifest = {
    app: 'send2me',
    version: '0.0.1',
    createdAt: new Date().toISOString(),
    files: [],
  };

  let rawBytes = 0;
  for (const [, { fullPath, relPath }] of filesMap.entries()) {
    const buf = fs.readFileSync(fullPath);
    rawBytes += buf.length;
    manifest.files.push({
      path: relPath,
      data: buf.toString('base64'),
    });
    console.log(`  + ${relPath} (${buf.length} bytes)`);
  }

  const compressedData = zlib.gzipSync(Buffer.from(JSON.stringify(manifest), 'utf8'), { level: 9 });
  const salt = crypto.randomBytes(SALT_LEN);
  const iv = crypto.randomBytes(IV_LEN);
  const key = crypto.scryptSync(password, salt, 32, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(compressedData), cipher.final()]);
  const tag = cipher.getAuthTag();

  const container = Buffer.concat([
    MAGIC_HEADER,
    Buffer.from([FORMAT_VERSION]),
    salt,
    iv,
    tag,
    ciphertext,
  ]);

  fs.writeFileSync(vaultFilePath, container);
  clearFailureCount();

  const sha256 = crypto.createHash('sha256').update(container).digest('hex');
  console.log('\n===============================================================');
  console.log(`  Vault Created: ${path.basename(vaultFilePath)}`);
  console.log(`  Raw -> Packed: ${(rawBytes / 1024).toFixed(1)} KB -> ${(container.length / 1024).toFixed(1)} KB`);
  console.log(`  Files Packed : ${manifest.files.length}`);
  console.log(`  SHA-256      : ${sha256.slice(0, 16)}...`);
  console.log('===============================================================\n');
}

async function unpackVault() {
  console.log('\n===============================================================');
  console.log('   Send2Me — Unpacking Encrypted Workspace Vault');
  console.log('===============================================================\n');

  if (!fs.existsSync(vaultFilePath)) {
    console.error(`[Error] Vault container ${vaultFilePath} does not exist.`);
    process.exit(1);
  }

  const container = fs.readFileSync(vaultFilePath);
  const headerLen = MAGIC_HEADER.length + 1 + SALT_LEN + IV_LEN + TAG_LEN;
  if (container.length < headerLen) {
    console.error('[Error] Invalid or corrupt vault container.');
    process.exit(1);
  }

  let offset = 0;
  const magic = container.subarray(offset, offset + MAGIC_HEADER.length);
  offset += MAGIC_HEADER.length;
  if (!magic.equals(MAGIC_HEADER)) {
    console.error('[Error] Invalid magic header. Container is corrupted or wrong type.');
    process.exit(1);
  }

  const version = container[offset];
  offset += 1;
  if (version !== FORMAT_VERSION) {
    console.error(`[Error] Unsupported vault version ${version}.`);
    process.exit(1);
  }

  const salt = container.subarray(offset, offset + SALT_LEN);
  offset += SALT_LEN;
  const iv = container.subarray(offset, offset + IV_LEN);
  offset += IV_LEN;
  const tag = container.subarray(offset, offset + TAG_LEN);
  offset += TAG_LEN;
  const ciphertext = container.subarray(offset);

  const password = await resolvePassword('UNPACK');
  const key = crypto.scryptSync(password, salt, 32, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });

  let plaintext;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch (err) {
    checkAndRecordFailure();
    console.error('\n[Error] Decryption failed: Invalid passphrase or corrupted tag.');
    process.exit(1);
  }

  clearFailureCount();

  let manifest;
  try {
    const uncompressed = zlib.gunzipSync(plaintext);
    manifest = JSON.parse(uncompressed.toString('utf8'));
  } catch (err) {
    console.error('\n[Error] Failed to decompress manifest:', err.message);
    process.exit(1);
  }

  console.log(`Unpacking ${manifest.files.length} private assets (Created: ${manifest.createdAt})...\n`);
  for (const item of manifest.files) {
    const targetPath = path.join(rootDir, item.path);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    const content = Buffer.from(item.data, 'base64');
    fs.writeFileSync(targetPath, content);
    console.log(`  ✓ Restored: ${item.path} (${content.length} bytes)`);
  }

  console.log('\n===============================================================');
  console.log('  [SUCCESS] All private workspace assets unpacked successfully!');
  console.log('===============================================================\n');
}

function showStatus() {
  console.log('\n===============================================================');
  console.log('   Send2Me — Encrypted Vault Status');
  console.log('===============================================================\n');
  if (!fs.existsSync(vaultFilePath)) {
    console.log('Vault File : NOT FOUND');
    return;
  }
  const stat = fs.statSync(vaultFilePath);
  const container = fs.readFileSync(vaultFilePath);
  const sha256 = crypto.createHash('sha256').update(container).digest('hex');
  console.log(`Vault File : ${path.basename(vaultFilePath)}`);
  console.log(`Size       : ${(stat.size / 1024).toFixed(2)} KB`);
  console.log(`Modified   : ${stat.mtime.toISOString()}`);
  console.log(`SHA-256    : ${sha256}`);
  console.log('\nVault is ready to be committed to GitHub or unpacked on another machine.\n');
}

const action = (process.argv[2] || '').toLowerCase();
if (action === 'pack') {
  packVault().catch((err) => {
    console.error('[Pack Error]', err);
    process.exit(1);
  });
} else if (action === 'unpack') {
  unpackVault().catch((err) => {
    console.error('[Unpack Error]', err);
    process.exit(1);
  });
} else if (action === 'status') {
  showStatus();
} else {
  console.log('Usage: node scripts/vault.mjs [pack|unpack|status] [--pass <password>]');
}
