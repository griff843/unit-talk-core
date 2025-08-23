#!/usr/bin/env tsx

/**
 * CI/CD Pipeline Validation Script
 *
 * This script validates the complete CI/CD pipeline configuration and provides
 * evidence-based reporting of the pipeline readiness.
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

interface ValidationResult {
  category: string;
  test: string;
  status: 'pass' | 'fail' | 'warning';
  evidence?: string;
  recommendation?: string;
}

class PipelineValidator {
  private results: ValidationResult[] = [];
  private projectRoot: string;

  constructor(projectRoot: string = process.cwd()) {
    this.projectRoot = projectRoot;
  }

  private addResult(result: ValidationResult): void {
    this.results.push(result);
    const icon =
      result.status === 'pass'
        ? '✅'
        : result.status === 'warning'
          ? '⚠️'
          : '❌';
    console.log(`${icon} ${result.category}: ${result.test}`);
    if (result.evidence) {
      console.log(`   Evidence: ${result.evidence}`);
    }
    if (result.recommendation) {
      console.log(`   💡 Recommendation: ${result.recommendation}`);
    }
  }

  /**
   * Validate workflow files exist and are properly configured
   */
  async validateWorkflowFiles(): Promise<void> {
    console.log('\n🔍 Validating Workflow Files...');

    const workflowFiles = [
      '.github/workflows/ci.yml',
      '.github/workflows/ops-nightly.yml',
      '.github/workflows/branch-protection.yml',
    ];

    for (const file of workflowFiles) {
      const filePath = join(this.projectRoot, file);
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const lineCount = content.split('\n').length;

        this.addResult({
          category: 'Workflow Files',
          test: `${file} exists and has content`,
          status: 'pass',
          evidence: `File exists with ${lineCount} lines`,
        });

        // Check for required CI elements
        if (file.includes('ci.yml')) {
          const requiredElements = [
            'SHADOW_MODE: true',
            'PUBLISH_TO_DISCORD: false',
            'build-and-lint:',
            'type-check:',
            'unit-tests:',
            'e2e-shadow-tests:',
          ];

          for (const element of requiredElements) {
            if (content.includes(element)) {
              this.addResult({
                category: 'CI Configuration',
                test: `Contains required element: ${element}`,
                status: 'pass',
                evidence: 'Found in workflow file',
              });
            } else {
              this.addResult({
                category: 'CI Configuration',
                test: `Contains required element: ${element}`,
                status: 'fail',
                recommendation: 'Add missing configuration to workflow',
              });
            }
          }
        }
      } catch (error) {
        this.addResult({
          category: 'Workflow Files',
          test: `${file} exists`,
          status: 'fail',
          evidence: `File not found: ${error}`,
          recommendation: 'Create missing workflow file',
        });
      }
    }
  }

  /**
   * Validate package.json scripts are properly configured
   */
  async validatePackageScripts(): Promise<void> {
    console.log('\n🔍 Validating Package Scripts...');

    try {
      const packageJsonPath = join(this.projectRoot, 'package.json');
      const content = await fs.readFile(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(content);

      const requiredScripts = [
        'build',
        'test',
        'lint',
        'type-check',
        'e2e:shadow',
        'ops:all',
      ];

      for (const script of requiredScripts) {
        if (packageJson.scripts && packageJson.scripts[script]) {
          this.addResult({
            category: 'Package Scripts',
            test: `Script '${script}' exists`,
            status: 'pass',
            evidence: `Command: ${packageJson.scripts[script]}`,
          });
        } else {
          this.addResult({
            category: 'Package Scripts',
            test: `Script '${script}' exists`,
            status: 'fail',
            recommendation: `Add '${script}' script to package.json`,
          });
        }
      }

      // Check for Windows compatibility (cross-env usage)
      const crossEnvScripts = Object.entries(packageJson.scripts || {}).filter(
        ([_, command]) => (command as string).includes('cross-env')
      ).length;

      if (crossEnvScripts > 0) {
        this.addResult({
          category: 'Windows Compatibility',
          test: 'Uses cross-env for Windows compatibility',
          status: 'pass',
          evidence: `${crossEnvScripts} scripts use cross-env`,
        });
      } else {
        this.addResult({
          category: 'Windows Compatibility',
          test: 'Uses cross-env for Windows compatibility',
          status: 'warning',
          recommendation: 'Consider using cross-env for environment variables',
        });
      }
    } catch (error) {
      this.addResult({
        category: 'Package Scripts',
        test: 'Package.json is valid',
        status: 'fail',
        evidence: `Error reading package.json: ${error}`,
        recommendation: 'Fix package.json syntax errors',
      });
    }
  }

  /**
   * Validate TypeScript configuration
   */
  async validateTypeScriptConfig(): Promise<void> {
    console.log('\n🔍 Validating TypeScript Configuration...');

    try {
      const tsconfigPath = join(this.projectRoot, 'tsconfig.json');
      const content = await fs.readFile(tsconfigPath, 'utf-8');
      const tsconfig = JSON.parse(content);

      this.addResult({
        category: 'TypeScript Config',
        test: 'tsconfig.json exists and is valid',
        status: 'pass',
        evidence: 'File parsed successfully',
      });

      // Check for strict settings
      const strictSettings = ['strict', 'noImplicitAny', 'strictNullChecks'];
      for (const setting of strictSettings) {
        if (tsconfig.compilerOptions?.[setting] === true) {
          this.addResult({
            category: 'TypeScript Strictness',
            test: `${setting} is enabled`,
            status: 'pass',
            evidence: 'Strict typing enforced',
          });
        } else {
          this.addResult({
            category: 'TypeScript Strictness',
            test: `${setting} is enabled`,
            status: 'warning',
            recommendation: `Consider enabling ${setting} for better type safety`,
          });
        }
      }

      // Check for workspaces
      if (tsconfig.references && tsconfig.references.length > 0) {
        this.addResult({
          category: 'TypeScript Workspaces',
          test: 'Project references configured',
          status: 'pass',
          evidence: `${tsconfig.references.length} project references found`,
        });
      }
    } catch (error) {
      this.addResult({
        category: 'TypeScript Config',
        test: 'tsconfig.json is valid',
        status: 'fail',
        evidence: `Error: ${error}`,
        recommendation: 'Fix tsconfig.json syntax errors',
      });
    }
  }

  /**
   * Validate environment configuration
   */
  async validateEnvironmentConfig(): Promise<void> {
    console.log('\n🔍 Validating Environment Configuration...');

    // Check for required environment files
    const envFiles = ['.env.example'];

    for (const file of envFiles) {
      try {
        const content = await fs.readFile(
          join(this.projectRoot, file),
          'utf-8'
        );
        const lines = content
          .split('\n')
          .filter(line => line.trim() && !line.startsWith('#'));

        this.addResult({
          category: 'Environment Files',
          test: `${file} exists`,
          status: 'pass',
          evidence: `${lines.length} environment variables documented`,
        });

        // Check for critical variables
        const criticalVars = [
          'DATABASE_URL',
          'SHADOW_MODE',
          'PUBLISH_TO_DISCORD',
          'NODE_ENV',
        ];

        for (const varName of criticalVars) {
          if (content.includes(varName)) {
            this.addResult({
              category: 'Environment Variables',
              test: `${varName} documented`,
              status: 'pass',
              evidence: 'Found in .env.example',
            });
          } else {
            this.addResult({
              category: 'Environment Variables',
              test: `${varName} documented`,
              status: 'warning',
              recommendation: `Document ${varName} in .env.example`,
            });
          }
        }
      } catch (error) {
        this.addResult({
          category: 'Environment Files',
          test: `${file} exists`,
          status: 'fail',
          recommendation: `Create ${file} with example environment variables`,
        });
      }
    }
  }

  /**
   * Validate dependencies and security
   */
  async validateDependencies(): Promise<void> {
    console.log('\n🔍 Validating Dependencies...');

    try {
      // Check for security-related dependencies
      const packageJsonPath = join(this.projectRoot, 'package.json');
      const content = await fs.readFile(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(content);

      const securityDeps = [
        'helmet',
        '@types/helmet',
        'cors',
        'express-rate-limit',
      ];
      const devDeps = ['eslint', 'prettier', 'typescript', 'cross-env', 'tsx'];

      for (const dep of securityDeps) {
        if (
          packageJson.dependencies?.[dep] ||
          packageJson.devDependencies?.[dep]
        ) {
          this.addResult({
            category: 'Security Dependencies',
            test: `${dep} is installed`,
            status: 'pass',
            evidence: 'Found in dependencies',
          });
        } else {
          this.addResult({
            category: 'Security Dependencies',
            test: `${dep} is installed`,
            status: 'warning',
            recommendation: `Consider installing ${dep} for security`,
          });
        }
      }

      for (const dep of devDeps) {
        if (packageJson.devDependencies?.[dep]) {
          this.addResult({
            category: 'Development Dependencies',
            test: `${dep} is installed`,
            status: 'pass',
            evidence: 'Found in devDependencies',
          });
        } else {
          this.addResult({
            category: 'Development Dependencies',
            test: `${dep} is installed`,
            status: 'fail',
            recommendation: `Install ${dep} for development workflow`,
          });
        }
      }

      // Try to run npm audit
      try {
        const auditResult = execSync('npm audit --json', {
          cwd: this.projectRoot,
          encoding: 'utf-8',
        });

        const audit = JSON.parse(auditResult);
        const vulnerabilities = audit.metadata?.vulnerabilities || {};
        const totalVulns = Object.values(vulnerabilities).reduce(
          (sum: number, count) => sum + (count as number),
          0
        );

        if (totalVulns === 0) {
          this.addResult({
            category: 'Security Audit',
            test: 'No vulnerabilities found',
            status: 'pass',
            evidence: 'npm audit completed successfully',
          });
        } else {
          this.addResult({
            category: 'Security Audit',
            test: 'No vulnerabilities found',
            status: 'warning',
            evidence: `${totalVulns} vulnerabilities found`,
            recommendation: 'Run npm audit --fix to resolve vulnerabilities',
          });
        }
      } catch (auditError) {
        this.addResult({
          category: 'Security Audit',
          test: 'npm audit runs successfully',
          status: 'warning',
          evidence: 'Could not run npm audit',
          recommendation:
            'Ensure npm is installed and dependencies are installed',
        });
      }
    } catch (error) {
      this.addResult({
        category: 'Dependencies',
        test: 'Package.json is valid',
        status: 'fail',
        evidence: `Error: ${error}`,
      });
    }
  }

  /**
   * Validate build process
   */
  async validateBuildProcess(): Promise<void> {
    console.log('\n🔍 Validating Build Process...');

    try {
      // Try to run the build
      console.log('   Running build test...');
      const buildResult = execSync('npm run build', {
        cwd: this.projectRoot,
        encoding: 'utf-8',
        timeout: 60000, // 1 minute timeout
      });

      this.addResult({
        category: 'Build Process',
        test: 'Build completes successfully',
        status: 'pass',
        evidence: 'Build command executed without errors',
      });

      // Check for TypeScript compilation
      if (
        buildResult.includes('Successfully compiled') ||
        buildResult.includes('Build completed')
      ) {
        this.addResult({
          category: 'TypeScript Compilation',
          test: 'TypeScript compiles without errors',
          status: 'pass',
          evidence: 'Compilation successful',
        });
      }
    } catch (error) {
      this.addResult({
        category: 'Build Process',
        test: 'Build completes successfully',
        status: 'fail',
        evidence: `Build failed: ${error}`,
        recommendation: 'Fix build errors before proceeding',
      });
    }

    try {
      // Try to run type checking
      console.log('   Running type check...');
      execSync('npm run type-check', {
        cwd: this.projectRoot,
        encoding: 'utf-8',
        timeout: 30000, // 30 seconds timeout
      });

      this.addResult({
        category: 'Type Checking',
        test: 'TypeScript type check passes',
        status: 'pass',
        evidence: 'Type checking completed without errors',
      });
    } catch (error) {
      this.addResult({
        category: 'Type Checking',
        test: 'TypeScript type check passes',
        status: 'fail',
        evidence: `Type check failed: ${error}`,
        recommendation: 'Fix TypeScript type errors',
      });
    }
  }

  /**
   * Validate documentation exists
   */
  async validateDocumentation(): Promise<void> {
    console.log('\n🔍 Validating Documentation...');

    const requiredDocs = [
      '.github/CI_CD_PIPELINE.md',
      '.github/ENVIRONMENTS_SETUP.md',
      'CLAUDE.md',
    ];

    for (const doc of requiredDocs) {
      try {
        const content = await fs.readFile(join(this.projectRoot, doc), 'utf-8');
        const wordCount = content.split(/\s+/).length;

        this.addResult({
          category: 'Documentation',
          test: `${doc} exists and has content`,
          status: 'pass',
          evidence: `Document contains ~${wordCount} words`,
        });
      } catch (error) {
        this.addResult({
          category: 'Documentation',
          test: `${doc} exists`,
          status: 'fail',
          recommendation: `Create ${doc} documentation`,
        });
      }
    }
  }

  /**
   * Generate comprehensive validation report
   */
  generateReport(): void {
    console.log('\n📊 Pipeline Validation Report');
    console.log('='.repeat(50));

    const categories = [...new Set(this.results.map(r => r.category))];
    const summary = {
      total: this.results.length,
      passed: this.results.filter(r => r.status === 'pass').length,
      warnings: this.results.filter(r => r.status === 'warning').length,
      failed: this.results.filter(r => r.status === 'fail').length,
    };

    console.log(`\nSummary:`);
    console.log(`✅ Passed: ${summary.passed}/${summary.total}`);
    console.log(`⚠️  Warnings: ${summary.warnings}/${summary.total}`);
    console.log(`❌ Failed: ${summary.failed}/${summary.total}`);

    const successRate =
      ((summary.passed + summary.warnings) / summary.total) * 100;
    console.log(`\n📈 Overall Success Rate: ${successRate.toFixed(1)}%`);

    // Category breakdown
    console.log('\nCategory Breakdown:');
    for (const category of categories) {
      const categoryResults = this.results.filter(r => r.category === category);
      const categoryPassed = categoryResults.filter(
        r => r.status === 'pass'
      ).length;
      const categoryTotal = categoryResults.length;
      const categoryRate = (categoryPassed / categoryTotal) * 100;

      console.log(
        `  ${category}: ${categoryPassed}/${categoryTotal} (${categoryRate.toFixed(1)}%)`
      );
    }

    // Recommendations
    const failures = this.results.filter(r => r.status === 'fail');
    const warnings = this.results.filter(r => r.status === 'warning');

    if (failures.length > 0) {
      console.log('\n🚨 Critical Issues (Must Fix):');
      failures.forEach((failure, index) => {
        console.log(`${index + 1}. ${failure.category}: ${failure.test}`);
        if (failure.recommendation) {
          console.log(`   💡 ${failure.recommendation}`);
        }
      });
    }

    if (warnings.length > 0) {
      console.log('\n⚠️  Recommendations:');
      warnings.forEach((warning, index) => {
        console.log(`${index + 1}. ${warning.category}: ${warning.test}`);
        if (warning.recommendation) {
          console.log(`   💡 ${warning.recommendation}`);
        }
      });
    }

    // Overall assessment
    console.log('\n🎯 Pipeline Readiness Assessment:');
    if (summary.failed === 0 && successRate >= 95) {
      console.log('✅ READY: Pipeline is ready for production use');
    } else if (summary.failed === 0 && successRate >= 85) {
      console.log(
        '⚠️  MOSTLY READY: Pipeline is mostly ready, address warnings for optimal performance'
      );
    } else if (summary.failed <= 3 && successRate >= 75) {
      console.log(
        '🔧 NEEDS WORK: Pipeline needs attention, fix critical issues before use'
      );
    } else {
      console.log(
        '❌ NOT READY: Pipeline has significant issues, extensive work required'
      );
    }

    console.log('\n📅 Next Steps:');
    console.log('1. Fix all critical issues (failed tests)');
    console.log('2. Address warnings for optimal performance');
    console.log('3. Run validation again after fixes');
    console.log('4. Test pipeline in staging environment');
    console.log('5. Configure GitHub Environments per ENVIRONMENTS_SETUP.md');
  }

  /**
   * Run all validations
   */
  async runAll(): Promise<void> {
    console.log('🚀 Starting CI/CD Pipeline Validation...\n');

    await this.validateWorkflowFiles();
    await this.validatePackageScripts();
    await this.validateTypeScriptConfig();
    await this.validateEnvironmentConfig();
    await this.validateDependencies();
    await this.validateBuildProcess();
    await this.validateDocumentation();

    this.generateReport();
  }
}

// Run validation if called directly
if (require.main === module) {
  const validator = new PipelineValidator();
  validator.runAll().catch(error => {
    console.error('❌ Validation failed:', error);
    process.exit(1);
  });
}

export { PipelineValidator };
