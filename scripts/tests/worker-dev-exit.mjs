#!/usr/bin/env node
// Windows-safe Node script to spawn dev:worker briefly with a temporary .env.local
// It does not assert via a test framework; it writes an artifact JSON summarizing the run

import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';

const ROOT = process.cwd();
const OUT = join(ROOT, 'out', 'ops');
const ENV_FILE = join(ROOT, '.env.local');
const BAK_FILE = join(ROOT, `.env.local.bak.${process.pid}`);
const ARTIFACT = join(OUT, 'worker-dev-exit.json');

function safeWriteEnv() {
  const content = [
    'SHADOW_MODE=true',
    'PUBLISH_TO_DISCORD=false',
    'ALLOW_PROMOTION_IN_SHADOW=false',
    'TEMPORAL_ADDRESS=127.0.0.1:7233',
    'TEMPORAL_NAMESPACE=default',
  ].join('\n');
  if (existsSync(ENV_FILE)) renameSync(ENV_FILE, BAK_FILE);
  writeFileSync(ENV_FILE, content, 'utf8');
}

function restoreEnv() {
  try { if (existsSync(ENV_FILE)) unlinkSync(ENV_FILE); } catch {}
  try { if (existsSync(BAK_FILE)) renameSync(BAK_FILE, ENV_FILE); } catch {}
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  safeWriteEnv();

  const start = Date.now();
  let exited = false;
  let exitCode = null;
  let signal = null;
  let logs = '';

  try {
    const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'dev:worker'], {
      cwd: ROOT,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const timeoutMs = 2500;
    const killTimeoutMs = 2500;

    child.stdout.on('data', (d) => { logs += d.toString(); });
    child.stderr.on('data', (d) => { logs += d.toString(); });

    const killTimer = setTimeout(() => {
      // Send SIGINT first for graceful shutdown
      try { child.kill('SIGINT'); } catch {}
      // Force kill after grace period
      setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, killTimeoutMs);
    }, timeoutMs);

    await new Promise((resolve) => {
      child.on('exit', (code, sig) => { exitCode = code; signal = sig; });
      child.on('close', () => { exited = true; clearTimeout(killTimer); resolve(); });
    });
  } catch (e) {
    logs += `\nEXC: ${e?.message || String(e)}`;
  } finally {
    restoreEnv();
  }

  const durationMs = Date.now() - start;
  const passed = exited && (exitCode === 0 || signal === 'SIGINT' || signal === 'SIGTERM');

  const result = { timestamp: new Date().toISOString(), passed, exited, exitCode, signal, durationMs };
  writeFileSync(ARTIFACT, JSON.stringify(result, null, 2), 'utf8');

  // Do not fail CI; this is a soft test artifact
  console.log(JSON.stringify(result));
}

main().catch((e) => {
  mkdirSync(dirname(ARTIFACT), { recursive: true });
  writeFileSync(ARTIFACT, JSON.stringify({ timestamp: new Date().toISOString(), passed: false, error: String(e) }, null, 2));
  process.exit(0);
});

