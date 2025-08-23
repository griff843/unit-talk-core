#!/usr/bin/env tsx
import '../shared/bootstrapEnv';
import { getSupabaseAdmin } from '../shared/db';

/**
 * Manually create the _migrations table using raw SQL through Supabase
 * This will allow the migration runner to work properly
 */
async function main() {
  try {
    const supabase = getSupabaseAdmin();
    
    console.log('🔧 Creating _migrations table manually...');
    
    // Use the REST API to execute raw SQL
    const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY!
      },
      body: JSON.stringify({
        sql: `
          CREATE TABLE IF NOT EXISTS public._migrations (
            id INT PRIMARY KEY, 
            name TEXT, 
            filename TEXT, 
            applied_at TIMESTAMPTZ DEFAULT now()
          );
          
          -- Enable RLS but allow service role access
          ALTER TABLE public._migrations ENABLE ROW LEVEL SECURITY;
          
          -- Create policy for service role
          CREATE POLICY IF NOT EXISTS "migrations_service_role_policy" 
          ON public._migrations FOR ALL 
          TO service_role 
          USING (true);
        `
      })
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`HTTP ${response.status}: ${error}`);
    }
    
    const result = await response.json();
    console.log('✅ _migrations table created successfully');
    console.log('📄 Result:', result);
    
    // Test the table exists now
    const { data, error } = await supabase
      .from('_migrations')
      .select('count')
      .limit(1);
      
    if (error) {
      console.log('⚠️ Table verification failed:', error.message);
    } else {
      console.log('✅ _migrations table verified and accessible');
    }
    
  } catch (error) {
    console.error('💥 Failed to create _migrations table:', error);
    
    // Fallback: try to create via direct insert
    console.log('🔧 Trying fallback approach...');
    try {
      const supabase = getSupabaseAdmin();
      
      // Try to create the table by executing a dummy query that will fail but might create table
      await supabase.schema('public').createTable('_migrations', (table) => {
        table.integer('id').primary();
        table.text('name');
        table.text('filename');
        table.timestamp('applied_at').defaultTo(supabase.fn.now());
      });
      
      console.log('✅ Fallback table creation succeeded');
    } catch (fallbackError) {
      console.error('💥 Fallback also failed:', fallbackError);
    }
  }
}

main();