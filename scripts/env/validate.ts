#!/usr/bin/env tsx
import '../shared/bootstrapEnv';
import fs from 'fs';
import path from 'path';

/**
 * Env validation for staging/production. Writes out/env/validate.json
 */

const REQUIRED_BASE = [
  'NODE_ENV',
  'DATABASE_URL',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_KEY',
  'SHADOW_MODE',
  'PUBLISH_TO_DISCORD',
];

const REQUIRED_TEMPORAL = ['TEMPORAL_SERVER_ADDRESS', 'TEMPORAL_TASK_QUEUE'];

function printTable(rows: Array<[string, string]>) {
  const col1 = Math.max(...rows.map(r => r[0].length), 10);
  for (const [k, v] of rows) {
    console.log(`${k.padEnd(col1)}  ${v}`);
  }
}

function main() {
  const env = process.env as Record<string, string | undefined>;
  const missing: string[] = [];

  const required = new Set<string>([...REQUIRED_BASE, ...REQUIRED_TEMPORAL]);
  for (const key of required) {
    if (!env[key] || env[key]!.trim() === '') missing.push(key);
  }

  // Discord requirement is conditional; we don't require in SHADOW_MODE
  const requireDiscord = env['PUBLISH_TO_DISCORD'] === 'true';
  if (requireDiscord) {
    const hasWebhook = !!env['DISCORD_WEBHOOK_URL'];
    const hasToken = !!env['DISCORD_BOT_TOKEN'] && !!env['DISCORD_CHANNEL_ID'];
    if (!hasWebhook && !hasToken) {
      missing.push(
        'DISCORD_WEBHOOK_URL or (DISCORD_BOT_TOKEN + DISCORD_CHANNEL_ID)'
      );
    }
  }

  const ok = missing.length === 0;

  console.log('Environment Validation');
  console.log('=======================');
  const rows: Array<[string, string]> = [];
  for (const key of Array.from(required).sort()) {
    const present = env[key] && env[key]!.trim() !== '' ? 'OK' : 'MISSING';
    rows.push([key, present]);
  }
  if (requireDiscord) {
    rows.push([
      'DISCORD_WEBHOOK_URL or token+channel',
      env['DISCORD_WEBHOOK_URL'] ||
      (env['DISCORD_BOT_TOKEN'] && env['DISCORD_CHANNEL_ID'])
        ? 'OK'
        : 'MISSING',
    ]);
  } else {
    rows.push(['Discord (dry-run)', 'OK (PUBLISH_TO_DISCORD=false)']);
  }
  printTable(rows);

  const out = {
    ok,
    missing,
    timestamp: new Date().toISOString(),
  };

  const outDir = path.join(process.cwd(), 'out', 'env');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, 'validate.json'),
    JSON.stringify(out, null, 2)
  );

  process.exit(ok ? 0 : 1);
}

main();
