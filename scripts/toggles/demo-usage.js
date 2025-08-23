#!/usr/bin/env node
// scripts/toggles/demo-usage.js
// Demonstration of the secure two-person rule toggle system

const { randomBytes } = require('crypto');

// Demo usage showing the complete workflow
async function runToggleSystemDemo() {
  console.log('🔒 Secure Toggle System Demo');
  console.log('=============================\n');

  // Set up environment
  process.env.TOGGLE_HMAC_KEY = randomBytes(32).toString('hex');
  
  console.log('📁 Using demo storage directory...');
  const demoDir = `./demo-${Date.now()}`;
  
  try {
    // Import the modules (would normally be from installed package)
    const { ToggleProposer } = await import('./toggle-propose.js');
    const { ToggleApprover } = await import('./toggle-approve.js');
    const { RuntimeToggleReader } = await import('./runtime-reader.js');
    const { ConfigFactory } = await import('./environment-integration.js');
    
    const proposer = new ToggleProposer(demoDir);
    const approver = new ToggleApprover(demoDir);
    const reader = new RuntimeToggleReader(demoDir);

    console.log('✅ System initialized\n');

    // Step 1: Check initial state
    console.log('🔍 Initial state:');
    const initialShadowMode = await reader.getBooleanToggle('SHADOW_MODE');
    const initialPromoteLimit = await reader.getNumberToggle('MAX_ALLOWED_PROMOTES_5MIN');
    console.log(`   SHADOW_MODE: ${initialShadowMode} (default)`);
    console.log(`   MAX_ALLOWED_PROMOTES_5MIN: ${initialPromoteLimit} (default)\n`);

    // Step 2: Create proposal (first person)
    console.log('📝 Step 1: Creating proposal (Alice)');
    const proposalId = await proposer.propose({
      toggleKey: 'SHADOW_MODE',
      proposedValue: false,
      reason: 'Disable shadow mode for production deployment',
      proposedBy: 'alice@company.com',
    });
    console.log(`   Proposal ID: ${proposalId}\n`);

    // Step 3: List pending proposals
    console.log('📋 Step 2: Checking pending proposals');
    const pending = await proposer.listProposals();
    console.log(`   Found ${pending.length} pending proposal(s)\n`);

    // Step 4: Try self-approval (should fail)
    console.log('❌ Step 3: Attempting self-approval (should fail)');
    try {
      await approver.processProposal({
        proposalId,
        decision: 'approve',
        approvedBy: 'alice@company.com', // Same as proposer
      });
      console.log('   ERROR: Self-approval should have failed!');
    } catch (error) {
      console.log(`   ✅ Correctly blocked: ${error.message}\n`);
    }

    // Step 5: Proper approval (second person)
    console.log('✅ Step 4: Proper approval (Bob)');
    await approver.processProposal({
      proposalId,
      decision: 'approve',
      approvedBy: 'bob@company.com',
      comments: 'Approved for production deployment',
    });
    console.log('   Proposal approved and toggle applied!\n');

    // Step 6: Verify change was applied
    console.log('🔍 Step 5: Verifying applied changes');
    const newShadowMode = await reader.getBooleanToggle('SHADOW_MODE');
    console.log(`   SHADOW_MODE: ${newShadowMode} (was ${initialShadowMode})\n`);

    // Step 7: Check audit trail
    console.log('📊 Step 6: Checking audit trail');
    const history = await approver.getToggleHistory('SHADOW_MODE', 5);
    console.log(`   Found ${history.length} audit entries for SHADOW_MODE`);
    history.forEach((entry, i) => {
      console.log(`   ${i + 1}. ${entry.timestamp} - ${entry.action} by ${entry.actor}`);
      if (entry.details) console.log(`      ${entry.details}`);
    });
    console.log('');

    // Step 8: Create typed configuration
    console.log('⚙️  Step 7: Creating application configuration');
    const config = await ConfigFactory.createConfig();
    console.log('   Current configuration:');
    console.log(`   - publishToDiscord: ${config.publishToDiscord}`);
    console.log(`   - shadowMode: ${config.shadowMode}`);
    console.log(`   - maxAllowedPromotes5Min: ${config.maxAllowedPromotes5Min}`);
    console.log(`   - enableMetrics: ${config.enableMetrics}\n`);

    // Step 9: System integrity check
    console.log('🔒 Step 8: Verifying system integrity');
    const integrity = await approver.verifyIntegrity();
    console.log(`   System integrity: ${integrity.valid ? '✅ VALID' : '❌ INVALID'}`);
    if (!integrity.valid) {
      console.log(`   Errors: ${integrity.errors.join(', ')}`);
    }
    console.log('');

    // Step 10: Performance snapshot
    console.log('📈 Step 9: Performance snapshot');
    const startTime = Date.now();
    for (let i = 0; i < 10; i++) {
      await reader.getToggle('SHADOW_MODE');
    }
    const duration = Date.now() - startTime;
    console.log(`   10 toggle reads: ${duration}ms (${duration/10}ms avg)\n`);

    console.log('🎉 Demo completed successfully!');
    console.log('   The secure toggle system is working correctly.');
    
    return {
      success: true,
      proposalId,
      finalConfig: config,
      integrity: integrity.valid,
      demoDir,
    };

  } catch (error) {
    console.error('❌ Demo failed:', error.message);
    return {
      success: false,
      error: error.message,
      demoDir,
    };
  }
}

// Command line interface
if (require.main === module) {
  runToggleSystemDemo()
    .then(result => {
      if (result.success) {
        console.log('\n✅ All systems operational. Toggle system ready for production.');
        process.exit(0);
      } else {
        console.log('\n❌ Demo failed. Check system configuration.');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { runToggleSystemDemo };