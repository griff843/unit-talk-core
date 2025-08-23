#!/usr/bin/env tsx
import '../shared/bootstrapEnv';
import fs from 'fs';
import path from 'path';

async function main() {
  const isPR = !!process.env.GITHUB_REF || !!process.env.GITHUB_HEAD_REF || process.env.GITHUB_EVENT_NAME === 'pull_request';
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!isPR || !token) {
    console.log('Not in PR context or missing GITHUB_TOKEN; skipping comment.');
    return;
  }

  const repo = process.env.GITHUB_REPOSITORY || '';
  const [owner, repoName] = repo.split('/');
  const prNumber = process.env.GITHUB_REF?.match(/\d+$/)?.[0] || process.env.PR_NUMBER;
  if (!owner || !repoName || !prNumber) {
    console.log('Missing owner/repo/pr number; skipping comment.');
    return;
  }

  const dashPath = path.join(process.cwd(), 'out', 'ops', 'dashboard.json');
  if (!fs.existsSync(dashPath)) {
    console.log('dashboard.json not found; skipping');
    return;
  }
  const dash = JSON.parse(fs.readFileSync(dashPath, 'utf8'));

  const shadow = String(process.env.SHADOW_MODE) !== 'false';
  const mode = shadow ? 'shadow' : 'live';

  const rows: Array<[string, string, string, string]> = [];
  const c = dash.components || {};
  const pushRow = (k: string, notes: string = '') => {
    if (!c[k]) return rows.push([k, mode, 'n/a', notes]);
    rows.push([k, mode, c[k].ok ? '✅' : '❌', notes]);
  };
  pushRow('parity');
  pushRow('rls');
  pushRow('temporal');
  pushRow('supabase');
  pushRow('discord');
  pushRow('db');

  const table = [
    '| Component | Mode | OK | Notes |',
    '|---|---|---|---|',
    ...rows.map(r => `| ${r[0]} | ${r[1]} | ${r[2]} | ${r[3]} |`),
  ].join('\n');

  const body = `### Ops Dashboard Summary\n\nUpdated: ${dash.timestamp}\n\n${table}`;

  const headers: Record<string, string> = {
    Authorization: `token ${token}`,
    'Content-Type': 'application/json',
    'User-Agent': 'unit-talk-ops-bot',
  };

  const api = async (url: string, init: RequestInit = {}) => {
    const res = await fetch(`https://api.github.com${url}`, { ...init, headers });
    if (!res.ok) throw new Error(`GitHub API ${url} failed: ${res.status}`);
    return res.json();
  };

  // Find existing comment by bot marker
  const marker = '<!-- unit-talk-ops-dashboard -->';
  const comments: Array<{ id: number; body: string } & Record<string, any>> = await api(`/repos/${owner}/${repoName}/issues/${prNumber}/comments`);
  const existing = comments.find((c) => typeof c.body === 'string' && c.body.includes(marker));
  const newBody = `${marker}\n${body}`;

  if (existing) {
    await api(`/repos/${owner}/${repoName}/issues/comments/${existing.id}`, { method: 'PATCH', body: JSON.stringify({ body: newBody }) });
    console.log('Updated PR ops dashboard comment.');
  } else {
    await api(`/repos/${owner}/${repoName}/issues/${prNumber}/comments`, { method: 'POST', body: JSON.stringify({ body: newBody }) });
    console.log('Posted PR ops dashboard comment.');
  }
}

main().catch(err => { console.error(err); process.exit(1); });

