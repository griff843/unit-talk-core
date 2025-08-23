/* Auto-ticket to Linear from GitHub Actions failures or ops breaches.
   Env: LINEAR_API_KEY, LINEAR_TEAM_ID, GITHUB_RUN_ID, GITHUB_REPOSITORY, GITHUB_SHA
   Optional: BREACH_NAME, FAILING_JOBS
*/
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');

const nowIso = new Date().toISOString();

function getenv(name, required = false) {
  const v = process.env[name];
  if (required && (!v || v.trim() === '')) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

function mask(s) {
  if (!s) return '';
  return s.length <= 8 ? '***' : `${s.slice(0, 2)}***${s.slice(-2)}`;
}

function readLastLines(filePath, maxLines = 200) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/);
    const tail = lines.slice(-maxLines).join('\n');
    return tail;
  } catch {
    return '(no logs found)';
  }
}

function linearRequest(apiKey, body) {
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
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.errors) {
              return reject(new Error('Linear GraphQL error: ' + JSON.stringify(json.errors)));
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

async function findExistingIssue(apiKey, teamId, signature) {
  const query = {
    query: `query Issues($teamId: String!, $first: Int!) {
      issues(filter: { team: { id: { eq: $teamId } }, state: { type: { neq: completed } } }, first: $first) {
        nodes { id identifier title url description state { name type } }
      }
    }`,
    variables: { teamId, first: 50 },
  };
  const res = await linearRequest(apiKey, query);
  const nodes = (res && res.data && res.data.issues && res.data.issues.nodes) || [];
  return nodes.find((n) =>
    (n.title && n.title.includes(signature)) || (n.description && n.description.includes(signature))
  );
}

function createIssue(apiKey, teamId, title, description) {
  const mutation = {
    query: `mutation Create($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id url identifier title } } }`,
    variables: { input: { teamId, title, description } },
  };
  return linearRequest(apiKey, mutation);
}

function addComment(apiKey, issueId, body) {
  const mutation = {
    query: `mutation Comment($input: CommentCreateInput!) { commentCreate(input: $input) { success comment { id } } }`,
    variables: { input: { issueId, body } },
  };
  return linearRequest(apiKey, mutation);
}

(async function main() {
  const repo = getenv('GITHUB_REPOSITORY', true);
  const runId = getenv('GITHUB_RUN_ID', true);
  const sha = getenv('GITHUB_SHA', true);
  const apiKey = getenv('LINEAR_API_KEY', true);
  const teamId = getenv('LINEAR_TEAM_ID', true);

  const failingJobs = (getenv('FAILING_JOBS') || '').trim();
  const breachEnv = getenv('BREACH_NAME');
  let breachName = breachEnv || (failingJobs ? `CI failure in: ${failingJobs}` : 'Ops failure detected');

  const dateStr = new Date().toISOString().slice(0, 10);
  const signature = crypto.createHash('sha1').update(`${breachName}|${dateStr}|${repo}`).digest('hex');

  const artifactUrl = `https://github.com/${repo}/actions/runs/${runId}/artifacts`;
  const runUrl = `https://github.com/${repo}/actions/runs/${runId}`;
  const opsLogPath = path.join(process.cwd(), 'out', 'ops', 'ops.log');
  const tailLogs = readLastLines(opsLogPath, 200);

  const title = `[OPS][${repo}] ${breachName} @ ${nowIso} [${signature.slice(0, 7)}]`;

  const summaryLines = [];
  summaryLines.push(`Repository: ${repo}`);
  summaryLines.push(`Run: ${runUrl}`);
  summaryLines.push(`Commit: ${sha.substring(0,7)}…`);
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

  console.log('Preparing Linear issue creation/update');
  console.log(`Repo: ${repo}, Run: ${runId}, SHA: ${sha.slice(0,7)}...`);
  console.log(`Linear team: ${mask(teamId)}, API key: ${mask(apiKey)}`);
  console.log(`Signature: ${signature}`);

  try {
    const existing = await findExistingIssue(apiKey, teamId, signature);
    if (existing) {
      console.log(`Found existing Linear issue ${existing.identifier} (${existing.url}), adding comment`);
      await addComment(apiKey, existing.id, `Another occurrence at ${nowIso}: ${runUrl}`);
    } else {
      console.log('No existing issue with same signature. Creating new issue...');
      await createIssue(apiKey, teamId, `${title} <${signature}>`, description + `\n\nSignature: ${signature}`);
      console.log('Linear issue created successfully');
    }
  } catch (err) {
    console.error('Failed to create/update Linear issue:', err && err.message);
    process.exitCode = 0; // don't fail the job further
  }
})();

