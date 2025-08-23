#!/usr/bin/env tsx
import '../shared/bootstrapEnv';

/**
 * @fileoverview Acceptance Artifacts Validation
 * @version 1.0.0
 * @author Unit Talk E2E Validation Team
 *
 * Validates that acceptance artifacts are written correctly:
 * - out/acceptance/shadow-pipeline.json with required fields
 * - out/ops/ops.json with required structure
 * - Ensures promoted_count > 0 and parity_validation_passed: true
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

interface ArtifactValidation {
  valid: boolean;
  artifacts: {
    shadow_pipeline: {
      exists: boolean;
      valid_structure: boolean;
      promoted_count_gt_zero: boolean;
      parity_validation_passed: boolean;
      single_writer_validated: boolean;
      canary_id_present: boolean;
      error?: string;
    };
    ops_result: {
      exists: boolean;
      valid_structure: boolean;
      ok_status: boolean;
      error?: string;
    };
  };
  overall_score: number;
  errors: string[];
}

/**
 * Validate shadow pipeline artifact
 */
function validateShadowPipelineArtifact(filePath: string) {
  const result = {
    exists: false,
    valid_structure: false,
    promoted_count_gt_zero: false,
    parity_validation_passed: false,
    single_writer_validated: false,
    canary_id_present: false,
  };

  try {
    if (!existsSync(filePath)) {
      return { ...result, error: 'File does not exist' };
    }

    result.exists = true;

    const content = readFileSync(filePath, 'utf8');
    const data = JSON.parse(content);

    // Check required structure
    if (
      typeof data.success === 'boolean' &&
      data.timestamp &&
      data.pipeline &&
      data.metrics &&
      data.evidence
    ) {
      result.valid_structure = true;
    }

    // Check promoted count > 0
    if (data.pipeline?.promoted_count > 0) {
      result.promoted_count_gt_zero = true;
    }

    // Check parity validation passed
    if (data.pipeline?.parity_validation_passed === true) {
      result.parity_validation_passed = true;
    }

    // Check single writer validated
    if (data.pipeline?.single_writer_validated === true) {
      result.single_writer_validated = true;
    }

    // Check canary ID present
    if (data.details?.canary_id || data.details?.feed_result?.canaryId) {
      result.canary_id_present = true;
    }

    return result;
  } catch (error) {
    return {
      ...result,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Validate ops result artifact
 */
function validateOpsArtifact(filePath: string) {
  const result = {
    exists: false,
    valid_structure: false,
    ok_status: false,
  };

  try {
    if (!existsSync(filePath)) {
      return { ...result, error: 'File does not exist' };
    }

    result.exists = true;

    const content = readFileSync(filePath, 'utf8');
    const data = JSON.parse(content);

    // Check required structure
    if (typeof data.ok === 'boolean' && data.timestamp) {
      result.valid_structure = true;
    }

    // Check OK status
    if (data.ok === true) {
      result.ok_status = true;
    }

    return result;
  } catch (error) {
    return {
      ...result,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Run comprehensive artifact validation
 */
export async function validateArtifacts(): Promise<ArtifactValidation> {
  const shadowPipelinePath = join(
    process.cwd(),
    'out',
    'acceptance',
    'shadow-pipeline.json'
  );
  const opsResultPath = join(process.cwd(), 'out', 'ops', 'ops.json');

  console.log('🔍 Validating acceptance artifacts...');
  console.log(`Shadow pipeline: ${shadowPipelinePath}`);
  console.log(`Ops result: ${opsResultPath}`);

  const shadowPipelineResult =
    validateShadowPipelineArtifact(shadowPipelinePath);
  const opsResult = validateOpsArtifact(opsResultPath);

  const errors: string[] = [];

  if (shadowPipelineResult.error) {
    errors.push(`Shadow pipeline: ${shadowPipelineResult.error}`);
  }
  if (opsResult.error) {
    errors.push(`Ops result: ${opsResult.error}`);
  }

  // Calculate overall score (percentage of validations passed)
  const totalChecks = 8; // 6 shadow + 2 ops checks
  let passedChecks = 0;

  // Shadow pipeline checks
  if (shadowPipelineResult.exists) passedChecks++;
  if (shadowPipelineResult.valid_structure) passedChecks++;
  if (shadowPipelineResult.promoted_count_gt_zero) passedChecks++;
  if (shadowPipelineResult.parity_validation_passed) passedChecks++;
  if (shadowPipelineResult.single_writer_validated) passedChecks++;
  if (shadowPipelineResult.canary_id_present) passedChecks++;

  // Ops checks
  if (opsResult.exists) passedChecks++;
  if (opsResult.ok_status) passedChecks++;

  const overallScore = (passedChecks / totalChecks) * 100;
  const valid = overallScore === 100 && errors.length === 0;

  const validation: ArtifactValidation = {
    valid,
    artifacts: {
      shadow_pipeline: shadowPipelineResult,
      ops_result: opsResult,
    },
    overall_score: overallScore,
    errors,
  };

  // Log results
  console.log('\n📊 Artifact Validation Results:');
  console.log(`Overall Score: ${overallScore.toFixed(1)}%`);
  console.log(`Valid: ${valid ? '✅' : '❌'}`);

  console.log('\n🔍 Shadow Pipeline Artifact:');
  console.log(`  Exists: ${shadowPipelineResult.exists ? '✅' : '❌'}`);
  console.log(
    `  Valid Structure: ${shadowPipelineResult.valid_structure ? '✅' : '❌'}`
  );
  console.log(
    `  Promoted Count > 0: ${shadowPipelineResult.promoted_count_gt_zero ? '✅' : '❌'}`
  );
  console.log(
    `  Parity Validation Passed: ${shadowPipelineResult.parity_validation_passed ? '✅' : '❌'}`
  );
  console.log(
    `  Single Writer Validated: ${shadowPipelineResult.single_writer_validated ? '✅' : '❌'}`
  );
  console.log(
    `  Canary ID Present: ${shadowPipelineResult.canary_id_present ? '✅' : '❌'}`
  );

  console.log('\n📋 Ops Result Artifact:');
  console.log(`  Exists: ${opsResult.exists ? '✅' : '❌'}`);
  console.log(`  OK Status: ${opsResult.ok_status ? '✅' : '❌'}`);

  if (errors.length > 0) {
    console.log('\n❌ Errors:');
    errors.forEach(error => console.log(`  - ${error}`));
  }

  return validation;
}

/**
 * Main execution function
 */
async function main(): Promise<void> {
  try {
    console.log('🚀 Starting acceptance artifacts validation');

    const result = await validateArtifacts();

    // Output JSON for programmatic use
    console.log('\n📄 Validation Result:');
    console.log(JSON.stringify(result, null, 2));

    if (result.valid) {
      console.log('\n✅ Acceptance artifacts validation PASSED');
      process.exit(0);
    } else {
      console.log('\n❌ Acceptance artifacts validation FAILED');
      console.log(`Score: ${result.overall_score.toFixed(1)}%`);
      console.log(`Errors: ${result.errors.length}`);
      process.exit(1);
    }
  } catch (error) {
    console.error(
      '\n💥 Artifacts validation execution failed:',
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
}

// Execute if run directly
if (require.main === module) {
  main();
}

export { validateArtifacts, type ArtifactValidation };
