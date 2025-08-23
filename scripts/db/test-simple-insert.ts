#!/usr/bin/env tsx
import '../shared/bootstrapEnv';
import { randomUUID } from 'crypto';

import { getSupabaseAdmin } from '../shared/db';

async function main() {
  try {
    const supabase = getSupabaseAdmin();
    
    console.log('🔧 Testing simple canary insert...');
    
    const testId = randomUUID();
    const testData = {
      canary: true,
      test: 'simple'
    };
    
    const testRow = {
      id: testId,
      metadata: testData,
      source: 'test',
      prop_category: 'player',
      player_name: 'CANARY',
      sport: 'MLB',
      team: 'TEST',
      outcome: 'OVER',
      line: 1.0,
      odds: -110
    };
    
    console.log('📦 Inserting test row:', JSON.stringify(testRow, null, 2));
    
    const { data, error } = await supabase
      .from('raw_props')
      .insert([testRow])
      .select('id');
      
    if (error) {
      console.log('❌ Insert error:', error.message);
      console.log('❌ Error details:', JSON.stringify(error, null, 2));
    } else {
      console.log('✅ Insert successful:', data);
      
      // Verify the row exists
      const { data: verifyData, error: verifyError } = await supabase
        .from('raw_props')
        .select('id, metadata, source, prop_category')
        .eq('id', testId);
        
      if (verifyError) {
        console.log('❌ Verify error:', verifyError.message);
      } else {
        console.log('✅ Row verified:', verifyData);
      }
    }
    
  } catch (error) {
    console.error('💥 Failed:', error);
  }
}

main();