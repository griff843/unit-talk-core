/*
Enterprise-grade Linear auto-ticketing for GitHub Actions failures and ops breaches.
- Inputs (env): LINEAR_API_KEY, LINEAR_TEAM_ID
- Inputs (env, provided by Actions): GITHUB_RUN_ID, GITHUB_REPOSITORY, GITHUB_SHA
- Optional (env): BREACH_NAME, FAILING_JOBS (space-separated), OPS_JSON_GLOB

Behavior:
- Compute a 24h signature = sha1(breachName + YYYY-MM-DD + repo)
- If an open issue with the same signature exists in the Linear team, add a comment; else create a new issue
- Title: [OPS][${repo}] ${breachName} @ ${timestamp}
- Body: summary + last 200 lines of logs (if out/ops/ops.log exists) + artifact links
- Never print secrets
*/

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import https from 'https';

const nowIso = new Date().toISOString();

function getenv(name: string, required = false): string | undefined {
  const v = process.env[name];
  if (required && (!v || v.trim() === '')) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

function mask(s: string | undefined): string {
  if (!s) return '';
  return s.length <= 8 ? '***' : `${s.slice(0, 2)}***${s.slice(-2)}`;
}

function readLastLines(filePath: string, maxLines = 200): string {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/);
    const tail = lines.slice(-maxLines).join('\n');
    return tail;
  } catch {
    return '(no logs found)';
  }
}

async function linearRequest<T>(apiKey: string, body: any): Promise<T> {
  const payload = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        method: 'POST',
        hostname: 'api.linear.app',
        path: '/graphql',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          Authorization: apiKey,
        },
      },
      res => {
        let data = '';
        res.on('data', chunk => (data += chunk));
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.errors) {
              return reject(
                new Error(
                  'Linear GraphQL error: ' + JSON.stringify(json.errors)
                )
              );
            }
            resolve(json);
          } catch (err) {
            reject(err);
          }
        });
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function findExistingIssue(
  apiKey: string,
  teamId: string,
  signature: string
) {
  const query = {
    query: `query Issues($teamId: String!, $first: Int!) {
      issues(filter: { team: { id: { eq: $teamId } }, state: { type: { neq: completed } } }, first: $first) {
        nodes { id identifier title url description state { name type } }
      }
    }`,
    variables: { teamId, first: 50 },
  };
  type Resp = {
    data: {
      issues: {
        nodes: Array<{
          id: string;
          identifier: string;
          title: string;
          url: string;
          description?: string;
          state: { name: string; type: string };
        }>;
      };
    };
  };
  const res = await linearRequest<Resp>(apiKey, query);
  const nodes = res?.data?.issues?.nodes ?? [];
  return nodes.find(
    n =>
      (n.title && n.title.includes(signature)) ||
      (n.description && n.description.includes(signature))
  );
}

async function createIssue(
  apiKey: string,
  teamId: string,
  title: string,
  description: string
) {
  const mutation = {
    query: `mutation Create($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id url identifier title } } }`,
    variables: { input: { teamId, title, description } },
  };
  return linearRequest(apiKey, mutation);
}

async function addComment(apiKey: string, issueId: string, body: string) {
  const mutation = {
    query: `mutation Comment($input: CommentCreateInput!) { commentCreate(input: $input) { success comment { id } } }`,
    variables: { input: { issueId, body } },
  };
  return linearRequest(apiKey, mutation);
}

function main() {
  const repo = getenv('GITHUB_REPOSITORY', true)!; // e.g., owner/repo
  const runId = getenv('GITHUB_RUN_ID', true)!;
  const sha = getenv('GITHUB_SHA', true)!;
  const apiKey = getenv('LINEAR_API_KEY', true)!;
  const teamId = getenv('LINEAR_TEAM_ID', true)!;

  const failingJobs = (getenv('FAILING_JOBS') || '').trim();
  const breachEnv = getenv('BREACH_NAME');

  const breachName =
    breachEnv ||
    (failingJobs ? `CI failure in: ${failingJobs}` : 'Ops failure detected');
  const dateStr = new Date().toISOString().slice(0, 10);
  const signature = crypto
    .createHash('sha1')
    .update(`${breachName}|${dateStr}|${repo}`)
    .digest('hex');

  const artifactUrl = `https://github.com/${repo}/actions/runs/${runId}/artifacts`;
  const runUrl = `https://github.com/${repo}/actions/runs/${runId}`;

  const opsLogPath = path.join(process.cwd(), 'out', 'ops', 'ops.log');
  const tailLogs = readLastLines(opsLogPath, 200);

  const title = `[OPS][${repo}] ${breachName} @ ${nowIso} [${signature.slice(0, 7)}]`;

  const summaryLines: string[] = [];
  summaryLines.push(`Repository: ${repo}`);
  summaryLines.push(`Run: ${runUrl}`);
  summaryLines.push(`Commit: ${sha}`);
  if (failingJobs) summaryLines.push(`Failing jobs: ${failingJobs}`);
  summaryLines.push(`Signature (24h): ${signature}`);
  summaryLines.push('');
  summaryLines.push('Artifacts:');
  summaryLines.push(`- ${artifactUrl}`);
  summaryLines.push('');
  summaryLines.push('Last 200 lines of ops logs (if available):');
  summaryLines.push('---');
  summaryLines.push(tailLogs);
  summaryLines.push('---');

  const description = summaryLines.join('\n');

  // Mask in console
  console.log('Preparing Linear issue creation/update');
  console.log(`Repo: ${repo}, Run: ${runId}, SHA: ${sha.slice(0, 7)}...`);
  console.log(`Linear team: ${mask(teamId)}, API key: ${mask(apiKey)}`);
  console.log(`Signature: ${signature}`);

  (async () => {
    try {
      const existing = await findExistingIssue(apiKey, teamId, signature);
      if (existing) {
        console.log(
          `Found existing Linear issue ${existing.identifier} (${existing.url}), adding comment`
        );
        await addComment(
          apiKey,
          existing.id,
          `Another occurrence at ${nowIso}: ${runUrl}`
        );
        return;
      }
      console.log(
        'No existing issue with same signature. Creating new issue...'
      );
      await createIssue(
        apiKey,
        teamId,
        `${title} <${signature}>`,
        description + `\n\nSignature: ${signature}`
      );
      console.log('Linear issue created successfully');
    } catch (err) {
      console.error(
        'Failed to create/update Linear issue:',
        (err as Error).message
      );
      process.exitCode = 0; // Do not fail the job further
    }
  })();
}

main();
