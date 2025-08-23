import fs from 'fs';
import path from 'path';

export interface ContractViolation {
  timestamp: string;
  strict: boolean;
  context: string;
  error: string;
}

export function appendViolation(v: ContractViolation) {
  const outDir = path.join(process.cwd(), 'out', 'contracts');
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, 'violations.jsonl');
  const line = JSON.stringify(v);
  fs.appendFileSync(file, line + '\n', 'utf8');
}

