#!/usr/bin/env tsx

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

interface DevOpsAudit {
  timestamp: string;
  repository: {
    name: string;
    packageManager: string;
    nodeVersion: string;
    workspaces: string[];
  };
  existing: {
    dockerCompose: boolean;
    devScripts: {
      devSh: boolean;
      devPs1: boolean;
    };
    ciWorkflows: string[];
    opsScripts: string[];
    temporalDeps: boolean;
    envFiles: string[];
  };
  missing: {
    dockerCompose: boolean;
    devScripts: string[];
    temporalSetup: boolean;
    opsAcceptancePhases: boolean;
    ciUpdatesNeeded: boolean;
    repoHygiene: string[];
    observability: string[];
  };
  ports: {
    inUse: number[];
    required: {
      temporal: number;
      temporalUI: number;
      api?: number;
      web?: number;
    };
  };
  recommendations: string[];
}

async function auditRepository(): Promise<DevOpsAudit> {
  const rootDir = process.cwd();
  
  // Check package.json
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
  
  // Check for workspaces
  const workspaces: string[] = [];
  if (packageJson.workspaces) {
    for (const pattern of packageJson.workspaces) {
      const dirs = pattern.replace('/*', '');
      if (fs.existsSync(dirs)) {
        const subdirs = fs.readdirSync(dirs).filter(d => 
          fs.existsSync(path.join(dirs, d, 'package.json'))
        );
        workspaces.push(...subdirs.map(d => `${dirs}/${d}`));
      }
    }
  }
  
  // Check existing files
  const dockerComposeExists = fs.existsSync('docker-compose.yml');
  const devShExists = fs.existsSync('dev.sh');
  const devPs1Exists = fs.existsSync('dev.ps1');
  
  // Check CI workflows
  const workflowsDir = '.github/workflows';
  const ciWorkflows = fs.existsSync(workflowsDir) 
    ? fs.readdirSync(workflowsDir).filter(f => f.endsWith('.yml'))
    : [];
  
  // Check ops scripts
  const opsDir = 'scripts/ops';
  const opsScripts = fs.existsSync(opsDir)
    ? fs.readdirSync(opsDir).filter(f => f.endsWith('.ts') || f.endsWith('.js'))
    : [];
  
  // Check Temporal dependencies
  const workerPackageJson = fs.existsSync('apps/worker/package.json')
    ? JSON.parse(fs.readFileSync('apps/worker/package.json', 'utf-8'))
    : {};
  const hasTemporalDeps = !!(workerPackageJson.dependencies?.['@temporalio/worker']);
  
  // Check env files
  const envFiles = ['.env', '.env.local', '.env.example']
    .filter(f => fs.existsSync(f));
  
  // Check ports (simplified check)
  const portsInUse: number[] = [];
  try {
    // This is a simplified check - in production you'd use proper port scanning
    const netstatOutput = process.platform === 'win32'
      ? execSync('netstat -an | findstr LISTENING', { encoding: 'utf-8' })
      : execSync('netstat -an | grep LISTEN', { encoding: 'utf-8' });
    const portMatches = netstatOutput.match(/:(\d{4,5})\s/g) || [];
    portsInUse.push(...portMatches.map(m => parseInt(m.replace(':', '').trim())));
  } catch (e) {
    // Ignore errors in port scanning
  }
  
  // Check repo hygiene files
  const hygieneFiles = [
    '.editorconfig',
    '.gitattributes',
    'CODEOWNERS',
    'SECURITY.md',
    'renovate.json',
    '.nvmrc'
  ];
  const missingHygiene = hygieneFiles.filter(f => !fs.existsSync(f));
  
  // Build audit report
  const audit: DevOpsAudit = {
    timestamp: new Date().toISOString(),
    repository: {
      name: packageJson.name || 'unit-talk-core',
      packageManager: 'npm',
      nodeVersion: packageJson.engines?.node || '>=18.0.0',
      workspaces
    },
    existing: {
      dockerCompose: dockerComposeExists,
      devScripts: {
        devSh: devShExists,
        devPs1: devPs1Exists
      },
      ciWorkflows,
      opsScripts,
      temporalDeps: hasTemporalDeps,
      envFiles
    },
    missing: {
      dockerCompose: !dockerComposeExists,
      devScripts: [
        ...(!devShExists ? ['dev.sh'] : []),
        ...(!devPs1Exists ? ['dev.ps1'] : [])
      ],
      temporalSetup: !hasTemporalDeps,
      opsAcceptancePhases: !packageJson.scripts?.['ops:phase:a'],
      ciUpdatesNeeded: !ciWorkflows.includes('release.yml'),
      repoHygiene: missingHygiene,
      observability: [
        ...(!fs.existsSync('apps/api/src/metrics.ts') ? ['API metrics endpoint'] : []),
        ...(!fs.existsSync('apps/worker/src/metrics.ts') ? ['Worker metrics endpoint'] : [])
      ]
    },
    ports: {
      inUse: [...new Set(portsInUse)].sort((a, b) => a - b),
      required: {
        temporal: 7233,
        temporalUI: 8080,
        api: 3000,
        web: 3001
      }
    },
    recommendations: [
      'Add .nvmrc file with Node 20 LTS version',
      'Create docker-compose.yml with Temporal services',
      'Add Temporal SDK dependencies to worker',
      'Create unified dev.sh and dev.ps1 scripts',
      'Add ops acceptance phase scripts',
      'Setup GitHub Actions release workflow',
      'Add repository hygiene files',
      'Implement metrics endpoints for observability'
    ].filter((rec, idx) => {
      // Filter recommendations based on what's missing
      if (idx === 0 && fs.existsSync('.nvmrc')) return false;
      if (idx === 1 && dockerComposeExists) return false;
      if (idx === 2 && hasTemporalDeps) return false;
      if (idx === 3 && devShExists && devPs1Exists) return false;
      if (idx === 4 && packageJson.scripts?.['ops:phase:a']) return false;
      if (idx === 5 && ciWorkflows.includes('release.yml')) return false;
      if (idx === 6 && missingHygiene.length === 0) return false;
      return true;
    })
  };
  
  return audit;
}

// Main execution
(async () => {
  try {
    console.log('🔍 Running DevOps audit...');
    const audit = await auditRepository();
    
    // Write to file
    const outputPath = 'out/ops/audit-devops.json';
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(audit, null, 2));
    
    // Print summary
    console.log('✅ Audit complete!');
    console.log(`\n📊 Summary:`);
    console.log(`  - Workspaces found: ${audit.repository.workspaces.length}`);
    console.log(`  - CI workflows: ${audit.existing.ciWorkflows.length}`);
    console.log(`  - Ops scripts: ${audit.existing.opsScripts.length}`);
    console.log(`  - Missing hygiene files: ${audit.missing.repoHygiene.length}`);
    console.log(`\n📝 Full report saved to: ${outputPath}`);
    
    // Print recommendations
    if (audit.recommendations.length > 0) {
      console.log('\n🎯 Recommendations:');
      audit.recommendations.forEach((rec, idx) => {
        console.log(`  ${idx + 1}. ${rec}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Audit failed:', error);
    process.exit(1);
  }
})();