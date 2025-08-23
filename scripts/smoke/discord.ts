#!/usr/bin/env tsx
import 'dotenv/config';
import fs from 'fs';
import https from 'https';
import path from 'path';

const now = new Date().toISOString();

function postWebhook(
  url: string,
  content: string
): Promise<{ ok: boolean; status: number }> {
  return new Promise(resolve => {
    const body = JSON.stringify({ content });
    const req = https.request(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      res => {
        res.on('data', () => {});
        res.on('end', () =>
          resolve({
            ok: res.statusCode! >= 200 && res.statusCode! < 300,
            status: res.statusCode || 0,
          })
        );
      }
    );
    req.on('error', () => resolve({ ok: false, status: 0 }));
    req.write(body);
    req.end();
  });
}

async function main() {
  const dryRun = process.env.PUBLISH_TO_DISCORD !== 'true';
  const payload: any = { ok: true, dryRun, timestamp: now };

  if (!dryRun) {
    const webhook = process.env.DISCORD_WEBHOOK_URL;
    if (webhook) {
      const res = await postWebhook(webhook, `UnitTalk smoke OK @ ${now}`);
      payload.webhook = { status: res.status };
      payload.ok = payload.ok && res.ok;
    } else {
      // Minimal bot-token path omitted to avoid extra deps; recommend webhook for CI safety
      payload.webhook = {
        status: 0,
        note: 'No DISCORD_WEBHOOK_URL set; skipped',
      };
    }
  }

  const outDir = path.join(process.cwd(), 'out', 'smoke');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, 'discord.json'),
    JSON.stringify(payload, null, 2)
  );
  process.exit(payload.ok ? 0 : 1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
