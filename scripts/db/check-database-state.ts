#!/usr/bin/env tsx
import '../shared/bootstrapEnv';
import { getSupabaseAdmin } from '../shared/db';

async function main() {
  try {
    const supabase = getSupabaseAdmin();
    
    console.log('🔧 Checking current database state...');
    
    // Check raw_props structure
    console.log('\n📊 Checking raw_props table...');
    const { data: rawPropsData, error: rawPropsError } = await supabase
      .from('raw_props')
      .select('*')
      .limit(1);
      
    if (rawPropsError) {
      console.log('❌ raw_props error:', rawPropsError.message);
    } else {
      console.log('✅ raw_props exists with columns:', Object.keys(rawPropsData?.[0] || {}));
    }
    
    // Check unified_picks structure
    console.log('\n📊 Checking unified_picks table...');
    const { data: picksData, error: picksError } = await supabase
      .from('unified_picks')
      .select('*')
      .limit(1);
      
    if (picksError) {
      console.log('❌ unified_picks error:', picksError.message);
    } else {
      console.log('✅ unified_picks exists with columns:', Object.keys(picksData?.[0] || {}));
    }
    
    // Test basic counts
    console.log('\n📊 Testing count queries...');
    const { count: rawCount, error: rawCountError } = await supabase
      .from('raw_props')
      .select('*', { count: 'exact', head: true });
      
    if (rawCountError) {
      console.log('❌ raw_props count error:', rawCountError.message);
    } else {
      console.log(`✅ raw_props total count: ${rawCount}`);
    }
    
    const { count: picksCount, error: picksCountError } = await supabase
      .from('unified_picks')
      .select('*', { count: 'exact', head: true });
      
    if (picksCountError) {
      console.log('❌ unified_picks count error:', picksCountError.message);
    } else {
      console.log(`✅ unified_picks total count: ${picksCount}`);
    }
    
  } catch (error) {
    console.error('💥 Failed:', error);
  }
}

main();