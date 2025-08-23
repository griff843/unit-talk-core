#!/usr/bin/env tsx
import '../shared/bootstrapEnv';
import { getSupabaseAdmin, closeConnections } from '../shared/db';

/**
 * Bootstrap the _migrations table using Supabase admin
 * This is needed because the table doesn't exist yet and direct pg connection fails
 */

async function main() {
  try {
    const supabase = getSupabaseAdmin();
    
    console.log('🔧 Creating _migrations table via Supabase admin...');
    
    // Use raw SQL via Supabase rpc call
    const { error } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS public._migrations (
          id INT PRIMARY KEY, 
          name TEXT, 
          filename TEXT, 
          applied_at TIMESTAMPTZ DEFAULT now()
        );
        
        -- Grant appropriate permissions
        ALTER TABLE public._migrations ENABLE ROW LEVEL SECURITY;
        
        -- Allow service role to manage migrations
        CREATE POLICY IF NOT EXISTS "Allow service role full access" ON public._migrations
          FOR ALL TO service_role USING (true);
      `
    });
    
    if (error) {
      console.error(`❌ Failed to create _migrations table: ${error.message}`);
      throw error;
    }
    
    console.log('✅ _migrations table created successfully');
    console.log('📄 Now you can run: npm run db:migrate:up');
    
  } catch (error) {
    console.error('💥 Failed to bootstrap _migrations table:', error);
    process.exit(1);
  } finally {
    await closeConnections();
  }
}

main();