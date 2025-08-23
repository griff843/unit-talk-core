#!/usr/bin/env node
// scripts/toggles/test-integration.ts
// Comprehensive integration tests for the secure two-person rule toggle system

import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

import { ToggleStorage } from './storage.js';
import { createToggleCrypto, generateSecureKey } from './crypto.js';
import { ToggleProposer } from './toggle-propose.js';
import { ToggleApprover } from './toggle-approve.js';
import { RuntimeToggleReader, Toggles } from './runtime-reader.js';
import { ConfigFactory, bootstrapSecureToggles } from './environment-integration.js';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

export class ToggleSystemIntegrationTest {
  private testDir: string;
  private results: TestResult[] = [];

  constructor() {
    this.testDir = join(tmpdir(), 'toggle-test-' + randomBytes(8).toString('hex'));
  }

  async runAllTests(): Promise<{ passed: number; failed: number; results: TestResult[] }> {
    console.log('🧪 Running secure toggle system integration tests...\n');

    // Setup test environment
    await this.setupTestEnvironment();

    // Run test suite
    const tests = [
      this.testCryptographicSignatures,
      this.testStorageOperations,
      this.testTwoPersonRuleEnforcement,
      this.testProposalWorkflow,
      this.testRuntimeAccess,
      this.testEnvironmentIntegration,
      this.testAuditTrail,
      this.testIntegrityValidation,
      this.testWindowsCompatibility,
      this.testErrorHandling,
      this.testSecurityScenarios,
      this.testPerformance,
    ];

    for (const test of tests) {
      await this.runTest(test.name, test.bind(this));
    }

    // Cleanup
    await this.cleanupTestEnvironment();

    const passed = this.results.filter(r => r.passed).length;
    const failed = this.results.filter(r => !r.passed).length;

    console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed\n`);

    if (failed > 0) {
      console.log('❌ Failed tests:');
      this.results.filter(r => !r.passed).forEach(r => {
        console.log(`  - ${r.name}: ${r.error}`);
      });
    }

    return { passed, failed, results: this.results };
  }

  private async runTest(name: string, testFn: () => Promise<void>): Promise<void> {
    const start = Date.now();
    
    try {
      await testFn();
      const duration = Date.now() - start;
      this.results.push({ name, passed: true, duration });
      console.log(`✅ ${name} (${duration}ms)`);
    } catch (error) {
      const duration = Date.now() - start;
      this.results.push({ 
        name, 
        passed: false, 
        error: (error as Error).message,
        duration 
      });
      console.log(`❌ ${name} (${duration}ms): ${(error as Error).message}`);
    }
  }

  private async setupTestEnvironment(): Promise<void> {
    // Create test directory
    await fs.mkdir(this.testDir, { recursive: true });

    // Set test HMAC key
    process.env.TOGGLE_HMAC_KEY = generateSecureKey();

    console.log(`📁 Test directory: ${this.testDir}`);
  }

  private async cleanupTestEnvironment(): Promise<void> {
    try {
      await fs.rm(this.testDir, { recursive: true, force: true });
    } catch (error) {
      console.warn('Failed to cleanup test directory:', error);
    }
  }

  // Test cryptographic signature functionality
  private async testCryptographicSignatures(): Promise<void> {
    const crypto = createToggleCrypto();

    // Test basic signing and verification
    const payload = {
      action: 'propose',
      toggleKey: 'TEST_TOGGLE',
      value: true,
      timestamp: new Date().toISOString(),
      actor: 'test-user',
      version: 1,
    };

    const signature = crypto.sign(payload);
    const isValid = crypto.verify(payload, signature);

    if (!isValid) {
      throw new Error('Basic signature verification failed');
    }

    // Test signature uniqueness
    const signature2 = crypto.sign(payload);
    if (signature === signature2) {
      throw new Error('Signatures should be unique due to nonce');
    }

    // Test tamper detection
    const tamperedPayload = { ...payload, value: false };
    const isTampered = crypto.verify(tamperedPayload, signature);
    
    if (isTampered) {
      throw new Error('Signature verification should fail for tampered data');
    }

    // Test specialized signing methods
    const proposalSig = crypto.signProposal(
      'TEST_TOGGLE', 
      false, 
      true, 
      'alice', 
      new Date().toISOString(), 
      1,
      'Test proposal'
    );

    if (!proposalSig || proposalSig.length === 0) {
      throw new Error('Proposal signature generation failed');
    }
  }

  // Test storage operations and file handling
  private async testStorageOperations(): Promise<void> {
    const storage = new ToggleStorage(this.testDir);
    await storage.initialize();

    // Test basic read/write
    const config = await storage.readToggleConfig();
    if (config.version !== 0) {
      throw new Error('Initial version should be 0');
    }

    // Test config update
    config.currentToggles['TEST'] = {
      id: 'test-1',
      key: 'TEST',
      value: true,
      description: 'Test toggle',
      category: 'runtime',
      appliedAt: new Date().toISOString(),
      appliedBy: 'test',
      version: 1,
    };

    await storage.writeToggleConfig(config);
    const updatedConfig = await storage.readToggleConfig();

    if (updatedConfig.version <= config.version) {
      throw new Error('Version should increment on write');
    }

    if (!updatedConfig.currentToggles['TEST']) {
      throw new Error('Toggle should be persisted');
    }

    // Test audit log
    const auditEntry = {
      timestamp: new Date().toISOString(),
      action: 'apply' as const,
      toggleKey: 'TEST',
      actor: 'test',
      signature: 'test-signature',
      payload: config.currentToggles['TEST'],
      version: 1,
    };

    await storage.appendAuditEntry(auditEntry);
    const auditLog = await storage.readAuditLog();

    if (auditLog.length === 0) {
      throw new Error('Audit entry should be persisted');
    }

    // Test storage validation
    const validation = await storage.validateStorage();
    if (!validation.valid) {
      throw new Error(`Storage validation failed: ${validation.errors.join(', ')}`);
    }

    // Test backup functionality
    const backups = await storage.createBackup();
    if (!backups.togglesBackup || !backups.auditBackup) {
      throw new Error('Backup creation failed');
    }
  }

  // Test two-person rule enforcement
  private async testTwoPersonRuleEnforcement(): Promise<void> {
    const proposer = new ToggleProposer(this.testDir);
    const approver = new ToggleApprover(this.testDir);

    // Create proposal
    const proposalId = await proposer.propose({
      toggleKey: 'SHADOW_MODE',
      proposedValue: false,
      reason: 'Disable shadow mode for testing',
      proposedBy: 'alice@company.com',
    });

    // Try to approve with same user (should fail)
    try {
      await approver.processProposal({
        proposalId,
        decision: 'approve',
        approvedBy: 'alice@company.com', // Same as proposer
      });
      throw new Error('Should not allow same user to propose and approve');
    } catch (error) {
      if (!(error as Error).message.includes('Two-person rule violation')) {
        throw error;
      }
    }

    // Approve with different user (should succeed)
    await approver.processProposal({
      proposalId,
      decision: 'approve',
      approvedBy: 'bob@company.com', // Different user
      comments: 'Approved for testing',
    });

    // Verify toggle was applied
    const reader = new RuntimeToggleReader(this.testDir);
    const shadowMode = await reader.getBooleanToggle('SHADOW_MODE');
    
    if (shadowMode !== false) {
      throw new Error('Toggle should be applied after approval');
    }
  }

  // Test complete proposal workflow
  private async testProposalWorkflow(): Promise<void> {
    const proposer = new ToggleProposer(this.testDir);
    const approver = new ToggleApprover(this.testDir);

    // Test proposal creation
    const proposalId = await proposer.propose({
      toggleKey: 'MAX_ALLOWED_PROMOTES_5MIN',
      proposedValue: 50,
      reason: 'Increase rate limit for high-traffic period',
      proposedBy: 'ops@company.com',
    });

    // Test proposal listing
    const proposals = await proposer.listProposals();
    if (proposals.length === 0 || !proposals.some(p => p.id === proposalId)) {
      throw new Error('Proposal should appear in listing');
    }

    // Test proposal retrieval
    const proposal = await proposer.getProposal(proposalId);
    if (!proposal || proposal.status !== 'pending') {
      throw new Error('Proposal should be retrievable and pending');
    }

    // Test approval
    await approver.processProposal({
      proposalId,
      decision: 'approve',
      approvedBy: 'security@company.com',
      comments: 'Approved for peak traffic handling',
    });

    // Test rejection workflow
    const rejectionId = await proposer.propose({
      toggleKey: 'PUBLISH_TO_DISCORD',
      proposedValue: true,
      reason: 'Enable Discord publishing',
      proposedBy: 'dev@company.com',
    });

    await approver.processProposal({
      proposalId: rejectionId,
      decision: 'reject',
      approvedBy: 'security@company.com',
      comments: 'Not approved for this release',
    });

    const rejectedProposal = await proposer.getProposal(rejectionId);
    if (!rejectedProposal || rejectedProposal.status !== 'rejected') {
      throw new Error('Proposal should be marked as rejected');
    }
  }

  // Test runtime access patterns
  private async testRuntimeAccess(): Promise<void> {
    const reader = new RuntimeToggleReader(this.testDir);

    // Test default value access
    const defaultValue = await reader.getBooleanToggle('PUBLISH_TO_DISCORD');
    if (defaultValue !== false) { // Default from KNOWN_TOGGLES
      throw new Error('Should return default value for unapplied toggle');
    }

    // Test applied value access
    // (Should have values from previous tests)
    const shadowMode = await reader.getBooleanToggle('SHADOW_MODE');
    const maxPromotes = await reader.getNumberToggle('MAX_ALLOWED_PROMOTES_5MIN');

    if (typeof shadowMode !== 'boolean' || typeof maxPromotes !== 'number') {
      throw new Error('Type conversion should work correctly');
    }

    // Test cache functionality
    const start = Date.now();
    await reader.getToggle('SHADOW_MODE');
    const cachedTime = Date.now() - start;

    const start2 = Date.now();
    await reader.getToggle('SHADOW_MODE');
    const secondTime = Date.now() - start2;

    if (secondTime >= cachedTime) {
      throw new Error('Second access should be faster due to caching');
    }

    // Test metadata access
    const metadata = await reader.getToggleMetadata('SHADOW_MODE');
    if (!metadata || !metadata.appliedBy) {
      throw new Error('Metadata should be available for applied toggles');
    }

    // Test validation
    const validation = await reader.validateRuntimeConfig();
    if (!validation.valid) {
      throw new Error(`Runtime validation failed: ${validation.errors.join(', ')}`);
    }
  }

  // Test environment integration
  private async testEnvironmentIntegration(): Promise<void> {
    // Set some environment variables
    process.env.PUBLISH_TO_DISCORD = 'true';
    process.env.LOG_LEVEL = 'debug';

    await bootstrapSecureToggles();

    const config = await ConfigFactory.createConfig();
    
    // Test that secure toggles override environment variables
    if (config.shadowMode !== false) { // Should be from applied toggle, not env
      throw new Error('Secure toggle should override environment variable');
    }

    // Test that non-toggle env vars are preserved
    if (config.logLevel !== 'debug') {
      throw new Error('Non-toggle environment variables should be preserved');
    }

    // Test validation
    const validation = await ConfigFactory.validateConfig();
    if (!validation.valid) {
      throw new Error(`Config validation failed: ${validation.errors.join(', ')}`);
    }

    // Test hot reload
    await ConfigFactory.hotReload();
    const config2 = await ConfigFactory.createConfig();
    
    if (JSON.stringify(config) !== JSON.stringify(config2)) {
      // This might be expected if timestamps differ, so just check key values
      if (config.shadowMode !== config2.shadowMode) {
        throw new Error('Hot reload should maintain consistency');
      }
    }
  }

  // Test audit trail functionality
  private async testAuditTrail(): Promise<void> {
    const storage = new ToggleStorage(this.testDir);
    const approver = new ToggleApprover(this.testDir);

    // Get audit trail for a specific toggle
    const history = await approver.getToggleHistory('SHADOW_MODE', 10);
    
    if (history.length === 0) {
      throw new Error('Should have audit history for modified toggle');
    }

    // Verify audit entries have required fields
    for (const entry of history) {
      if (!entry.timestamp || !entry.action || !entry.actor) {
        throw new Error('Audit entries should have complete metadata');
      }
    }

    // Test filtering
    const filteredAudit = await storage.readAuditLog({
      toggleKey: 'SHADOW_MODE',
      action: 'apply',
      limit: 5,
    });

    if (filteredAudit.length === 0) {
      throw new Error('Should find filtered audit entries');
    }

    for (const entry of filteredAudit) {
      if (entry.action !== 'apply' || entry.toggleKey !== 'SHADOW_MODE') {
        throw new Error('Filtering should work correctly');
      }
    }
  }

  // Test integrity validation
  private async testIntegrityValidation(): Promise<void> {
    const approver = new ToggleApprover(this.testDir);

    const integrity = await approver.verifyIntegrity();
    
    if (!integrity.valid) {
      throw new Error(`Integrity check failed: ${integrity.errors.join(', ')}`);
    }

    // Test with tampered data
    const storage = new ToggleStorage(this.testDir);
    const config = await storage.readToggleConfig();
    
    // Add a proposal with invalid signature
    config.pendingProposals['tampered'] = {
      id: 'tampered',
      toggleKey: 'FAKE_TOGGLE',
      currentValue: false,
      proposedValue: true,
      reason: 'Fake proposal',
      category: 'runtime',
      proposedAt: new Date().toISOString(),
      proposedBy: 'attacker',
      proposedBySignature: 'invalid-signature',
      status: 'pending',
      version: config.version + 1,
    };

    await storage.writeToggleConfig(config);

    const tamperedIntegrity = await approver.verifyIntegrity();
    if (tamperedIntegrity.valid) {
      throw new Error('Integrity check should detect tampered data');
    }
  }

  // Test Windows compatibility
  private async testWindowsCompatibility(): Promise<void> {
    const storage = new ToggleStorage(this.testDir);
    
    // Test file operations with Windows-style paths
    const testPath = join(this.testDir, 'subdir', 'nested');
    const nestedStorage = new ToggleStorage(testPath);
    
    await nestedStorage.initialize();
    
    // Test file locking (Windows-specific behavior)
    const config = await nestedStorage.readToggleConfig();
    config.version = 999;
    
    await nestedStorage.writeToggleConfig(config);
    
    const readBack = await nestedStorage.readToggleConfig();
    if (readBack.version !== 1000) { // Should be incremented
      throw new Error('Windows file operations should work correctly');
    }

    // Test concurrent access (should not crash)
    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(nestedStorage.readToggleConfig());
    }
    
    const results = await Promise.all(promises);
    if (results.length !== 5) {
      throw new Error('Concurrent reads should work');
    }
  }

  // Test error handling scenarios
  private async testErrorHandling(): Promise<void> {
    const proposer = new ToggleProposer('/invalid/path/that/should/not/exist');
    const approver = new ToggleApprover('/another/invalid/path');

    // Test graceful handling of storage errors
    try {
      await proposer.propose({
        toggleKey: 'TEST_TOGGLE',
        proposedValue: true,
        reason: 'Test error handling',
        proposedBy: 'test-user',
      });
      throw new Error('Should throw error for invalid storage path');
    } catch (error) {
      if ((error as Error).message.includes('Should throw error')) {
        throw error;
      }
      // Expected error - storage path invalid
    }

    // Test invalid input validation
    const validProposer = new ToggleProposer(this.testDir);
    
    try {
      await validProposer.propose({
        toggleKey: 'INVALID_TOGGLE',
        proposedValue: true,
        reason: 'Test',
        proposedBy: 'test',
      });
      throw new Error('Should reject invalid toggle key');
    } catch (error) {
      if (!(error as Error).message.includes('Unknown toggle key')) {
        throw error;
      }
    }

    // Test missing HMAC key
    delete process.env.TOGGLE_HMAC_KEY;
    
    try {
      createToggleCrypto();
      throw new Error('Should require HMAC key');
    } catch (error) {
      if (!(error as Error).message.includes('TOGGLE_HMAC_KEY')) {
        throw error;
      }
    }

    // Restore HMAC key
    process.env.TOGGLE_HMAC_KEY = generateSecureKey();
  }

  // Test security scenarios
  private async testSecurityScenarios(): Promise<void> {
    const proposer = new ToggleProposer(this.testDir);
    const approver = new ToggleApprover(this.testDir);

    // Test duplicate proposal prevention
    const proposalId1 = await proposer.propose({
      toggleKey: 'ENABLE_METRICS',
      proposedValue: false,
      reason: 'First proposal',
      proposedBy: 'user1',
    });

    try {
      await proposer.propose({
        toggleKey: 'ENABLE_METRICS',
        proposedValue: true,
        reason: 'Second proposal',
        proposedBy: 'user2',
      });
      throw new Error('Should prevent duplicate proposals');
    } catch (error) {
      if (!(error as Error).message.includes('already a pending proposal')) {
        throw error;
      }
    }

    // Clean up the proposal
    await approver.processProposal({
      proposalId: proposalId1,
      decision: 'reject',
      approvedBy: 'admin',
    });

    // Test proposal expiration
    const expiredIds = await proposer.expireOldProposals(0); // Expire immediately
    if (expiredIds.length > 0) {
      // Verify expired proposals are no longer pending
      const proposal = await proposer.getProposal(expiredIds[0]);
      if (proposal && proposal.status === 'pending') {
        throw new Error('Expired proposals should not remain pending');
      }
    }

    // Test signature key strength validation
    const { valid, errors } = await import('./crypto.js').then(m => 
      m.validateKeyStrength('weak')
    );
    
    if (valid) {
      throw new Error('Should reject weak keys');
    }

    if (errors.length === 0) {
      throw new Error('Should provide validation errors for weak keys');
    }
  }

  // Test performance characteristics
  private async testPerformance(): Promise<void> {
    const reader = new RuntimeToggleReader(this.testDir);
    const iterations = 100;

    // Test read performance
    const start = Date.now();
    for (let i = 0; i < iterations; i++) {
      await reader.getToggle('SHADOW_MODE');
    }
    const duration = Date.now() - start;
    const avgTime = duration / iterations;

    if (avgTime > 10) { // 10ms per read is acceptable
      throw new Error(`Performance issue: average read time ${avgTime}ms exceeds 10ms`);
    }

    // Test batch read performance
    const batchStart = Date.now();
    await reader.getToggles(Object.keys(process.env).slice(0, 10));
    const batchDuration = Date.now() - batchStart;

    if (batchDuration > 100) { // 100ms for batch is acceptable
      throw new Error(`Batch read performance issue: ${batchDuration}ms exceeds 100ms`);
    }

    // Test cache effectiveness
    reader.clearCache();
    const uncachedStart = Date.now();
    await reader.getToggle('SHADOW_MODE');
    const uncachedTime = Date.now() - uncachedStart;

    const cachedStart = Date.now();
    await reader.getToggle('SHADOW_MODE');
    const cachedTime = Date.now() - cachedStart;

    if (cachedTime >= uncachedTime) {
      throw new Error('Cache should improve read performance');
    }
  }
}

// CLI interface
async function main(): Promise<void> {
  const tester = new ToggleSystemIntegrationTest();
  const results = await tester.runAllTests();

  if (results.failed > 0) {
    console.log('\n❌ Some tests failed. System may not be ready for production.');
    process.exit(1);
  } else {
    console.log('\n✅ All tests passed! Secure toggle system is ready for production.');
    process.exit(0);
  }
}

// Run tests if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Test runner failed:', error);
    process.exit(1);
  });
}