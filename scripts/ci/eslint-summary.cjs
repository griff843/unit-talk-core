const fs = require('fs');
const path = require('path');

function main() {
  const reportPath = path.join(process.cwd(), 'out', 'quality', 'eslint-report.json');
  if (!fs.existsSync(reportPath)) {
    console.error('eslint-report.json not found at', reportPath);
    process.exit(0);
  }
  const text = fs.readFileSync(reportPath, 'utf8');
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    console.error('Failed to parse eslint-report.json:', e.message);
    process.exit(0);
  }
  const counts = new Map();
  for (const file of data) {
    if (!file || !Array.isArray(file.messages)) continue;
    for (const m of file.messages) {
      const rule = m.ruleId || 'internal';
      counts.set(rule, (counts.get(rule) || 0) + 1);
    }
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, 20);

  const lines = [];
  lines.push('# ESLint Summary');
  lines.push('');
  lines.push(`Total files: ${data.length}`);
  lines.push('');
  lines.push('## Top 20 rules remaining:');
  for (const [r, c] of top) {
    lines.push(`- ${r}: ${c}`);
  }

  const outDir = path.join(process.cwd(), 'out', 'quality');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'summary.md'), lines.join('\n'));
}

main();

