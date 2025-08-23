import { spawnSync } from 'node:child_process';

const phase = process.argv[2]; // "pre" or "post"
const cmd = process.env.CLAUDE_FLOW_CMD || '';

const args = [
  'claude-flow@alpha',
  'hooks',
  phase === 'pre' ? 'pre-command' : 'post-command',
  '--command',
  cmd,
  ...(phase === 'pre'
    ? ['--validate-safety', 'true', '--prepare-resources', 'true']
    : ['--track-metrics', 'true', '--store-results', 'true']),
];

const r = spawnSync('npx', args, {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
process.exit(r.status ?? 0);
