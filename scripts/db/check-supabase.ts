#!/usr/bin/env tsx
import '../shared/bootstrapEnv';
import { getSupabaseAdmin } from '../shared/db';

async function main() {
  try {
    const supabase = getSupabaseAdmin();
    
    console.log('🔧 Testing Supabase connection...');
    
    // Test raw_props exists
    const { data: rawPropsData, error: rawPropsError } = await supabase
      .from('raw_props')
      .select('count')
      .limit(1);
      
    if (rawPropsError) {
      console.log('❌ raw_props error:', rawPropsError.message);
    } else {
      console.log('✅ raw_props table exists');
    }
    
    // Test _migrations 
    const { data: migrationsData, error: migrationsError } = await supabase
      .from('_migrations')
      .select('count')
      .limit(1);
      
    if (migrationsError) {
      console.log('❌ _migrations error:', migrationsError.message);
    } else {
      console.log('✅ _migrations table exists');
    }
    
    // Try to get current user info
    const { data: user } = await supabase.auth.getUser();
    console.log('👤 Current user:', user?.user?.id || 'service-role');
    
  } catch (error) {
    console.error('💥 Failed:', error);
  }
}

main();