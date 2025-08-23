#!/usr/bin/env tsx
import './shared/bootstrapEnv';

import { withSession, getSupabaseAdmin, closeConnections } from './shared/db';

async function testConnections() {
  console.log('🔌 Testing database connections...');
  
  try {
    console.log('Testing pg.Pool connection...');
    await withSession(async (client) => {
      console.log('✅ pg.Pool connection successful');
      const result = await client.query('SELECT NOW() as current_time');
      console.log('Current time via pg.Pool:', result.rows[0].current_time);
    });
  } catch (error) {
    console.log('❌ pg.Pool connection failed:', error instanceof Error ? error.message : String(error));
  }

  try {
    console.log('Testing Supabase admin connection...');
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from('raw_props')
      .select('count')
      .limit(1);
    
    if (error) {
      console.log('❌ Supabase admin connection failed:', error.message);
    } else {
      console.log('✅ Supabase admin connection successful');
    }
  } catch (error) {
    console.log('❌ Supabase admin connection error:', error instanceof Error ? error.message : String(error));
  }

  await closeConnections();
  console.log('🏁 Connection test completed');
}

testConnections().catch(console.error);