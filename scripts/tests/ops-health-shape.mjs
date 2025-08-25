#!/usr/bin/env node
// Validate shape of ops health JSONs. Writes a consolidated artifact and exits 0.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = join(process.cwd(), 'out', 'ops');
const ARTIFACT = join(OUT, 'ops-health-shape.json');

function readJson(p) {
  try {
    if (!existsSync(p)) return { missing: true };
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch (e) {
    return { invalid: true, error: String(e) };
  }
}

function hasBasicShape(obj) {
  return obj && typeof obj === 'object'
    && typeof obj.timestamp === 'string'
    && Object.prototype.hasOwnProperty.call(obj, 'up');
}

function validateOne(name) {
  const file = join(OUT, `${name}.json`);
  const data = readJson(file);
  const ok = hasBasicShape(data) || data.missing === true;
  const error = (!ok && data && data.error) ? data.error : undefined;
  return { file, ok, missing: !!data.missing, error: error || null };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const db = validateOne('health-db');
  const api = validateOne('health-api');
  const worker = validateOne('health-worker');
  const summary = { timestamp: new Date().toISOString(), db, api, worker };
  writeFileSync(ARTIFACT, JSON.stringify(summary, null, 2), 'utf8');
  console.log(JSON.stringify(summary));
  process.exit(0);
}

main().catch((e) => {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(ARTIFACT, JSON.stringify({ timestamp: new Date().toISOString(), error: String(e) }, null, 2));
  process.exit(0);
});

