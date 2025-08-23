#!/usr/bin/env tsx
import '../shared/bootstrapEnv';
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

import { getPgPoolDirect, getSupabaseAdmin, closeConnections } from '../shared/db';

const MIGRATIONS_DIR = join(process.cwd(), 'migrations');
const OUT_DIR = join(process.cwd(), 'out', 'db');

interface MigrationResult {
  filename: string;
  applied: boolean;
  error?: string;
  timestamp: string;
}

async function main() {
  const results: MigrationResult[] = [];
  
  try {
    // Ensure output directory exists
    if (!existsSync(OUT_DIR)) {
      mkdirSync(OUT_DIR, { recursive: true });
    }

    // Try direct PostgreSQL connection first, fallback to Supabase
    let usePg = true;
    let client: any = null;
    let supabase: any = null;
    
    try {
      console.log('🔧 Attempting direct PostgreSQL connection...');
      const pool = getPgPoolDirect();
      client = await pool.connect();
      console.log('✅ Direct PostgreSQL connection established');
    } catch (pgError) {
      console.log(`⚠️  Direct PostgreSQL connection failed: ${pgError instanceof Error ? pgError.message : pgError}`);
      console.log('🔧 Falling back to Supabase service client...');
      usePg = false;
      try {
        supabase = getSupabaseAdmin();
        console.log('✅ Supabase service client ready');
      } catch (supabaseError) {
        throw new Error(`Both PostgreSQL and Supabase connections failed. PG: ${pgError instanceof Error ? pgError.message : pgError}, Supabase: ${supabaseError instanceof Error ? supabaseError.message : supabaseError}`);
      }
    }
    
    try {
      console.log('🔧 Setting up migration environment...');
      
      // Setup depends on connection type
      let applied: Set<number>;
      
      if (usePg) {
        // PostgreSQL direct connection setup (no RLS, no session vars)
        // Disable RLS for migrations and use superuser privileges
        try {
          await client.query('SET row_security = off');
          await client.query('SET role postgres'); // Use postgres superuser
          
          // Create migrations table if it doesn't exist
          await client.query(`
            CREATE TABLE IF NOT EXISTS public._migrations (
              id INT PRIMARY KEY, 
              name TEXT, 
              filename TEXT, 
              applied_at TIMESTAMPTZ DEFAULT now()
            )
          `);
          console.log('✅ Migrations table ready');
        } catch (tableError) {
          console.error(`❌ Failed to create migrations table: ${tableError instanceof Error ? tableError.message : tableError}`);
          throw tableError;
        }

        try {
          // Get applied migrations
          const appliedRows = await client.query('SELECT id FROM _migrations ORDER BY id');
          applied = new Set<number>(appliedRows.rows.map((r: any) => r.id));
          console.log(`✅ Found ${applied.size} previously applied migrations`);
        } catch (queryError) {
          console.error(`❌ Failed to query applied migrations: ${queryError instanceof Error ? queryError.message : queryError}`);
          throw queryError;
        }
      } else {
        // Supabase connection setup
        try {
          // Try to query the migrations table first, create it if it doesn't exist
          const { error: queryError } = await supabase
            .from('_migrations')
            .select('count')
            .limit(1);
            
          if (queryError && queryError.message.includes('relation "_migrations" does not exist')) {
            // Table doesn't exist, create it via Supabase RPC
            console.log('🔧 Creating _migrations table via Supabase...');
            
            const { error: createError } = await supabase.rpc('exec_sql', {
              sql: `
                CREATE TABLE IF NOT EXISTS public._migrations (
                  id INT PRIMARY KEY, 
                  name TEXT, 
                  filename TEXT, 
                  applied_at TIMESTAMPTZ DEFAULT now()
                );
                ALTER TABLE public._migrations ENABLE ROW LEVEL SECURITY;
                CREATE POLICY IF NOT EXISTS "migrations_service_role" ON public._migrations
                  FOR ALL TO service_role USING (true);
              `
            });
            
            if (createError) {
              throw new Error(`Failed to create _migrations table: ${createError.message}`);
            }
            
            console.log('✅ _migrations table created successfully');
          } else if (queryError) {
            throw new Error(`Supabase query error: ${queryError.message}`);
          }
          
          console.log('✅ Migrations table verified (via Supabase)');
        } catch (tableError) {
          console.error(`❌ Failed to access migrations table via Supabase: ${tableError instanceof Error ? tableError.message : tableError}`);
          throw tableError;
        }

        try {
          // Get applied migrations via Supabase
          const { data: appliedRows, error: queryError } = await supabase
            .from('_migrations')
            .select('id')
            .order('id');
            
          if (queryError) {
            throw new Error(`Supabase query error: ${queryError.message}`);
          }
          
          applied = new Set<number>(appliedRows?.map((r: any) => r.id) || []);
          console.log(`✅ Found ${applied.size} previously applied migrations (via Supabase)`);
        } catch (queryError) {
          console.error(`❌ Failed to query applied migrations via Supabase: ${queryError instanceof Error ? queryError.message : queryError}`);
          throw queryError;
        }
      }

      // Get all migration files
      const files = readdirSync(MIGRATIONS_DIR)
        .filter(f => f.endsWith('.sql'))
        .sort();

      console.log(`Found ${files.length} migration files, ${applied.size} already applied`);

      for (const f of files) {
        const timestamp = new Date().toISOString();
        
        // Extract migration ID and name - handle both formats
        const basicMatch = f.match(/^(\d+)_([^.]+)\.sql$/);
        const dateMatch = f.match(/^(\d{4}-\d{2}-\d{2})_([^.]+)\.sql$/);
        
        let id: number;
        let name: string;
        
        if (basicMatch) {
          id = parseInt(basicMatch[1], 10);
          name = basicMatch[2];
        } else if (dateMatch) {
          // Convert date to numeric ID for consistency
          const dateStr = dateMatch[1].replace(/-/g, '');
          id = parseInt(dateStr, 10);
          name = dateMatch[2];
        } else {
          console.log(`Skipping ${f}: Invalid filename format`);
          results.push({
            filename: f,
            applied: false,
            error: 'Invalid filename format',
            timestamp
          });
          continue;
        }

        if (applied.has(id)) {
          console.log(`Skipping ${f}: Already applied`);
          results.push({
            filename: f,
            applied: false,
            error: 'Already applied',
            timestamp
          });
          continue;
        }

        try {
          const sqlText = readFileSync(join(MIGRATIONS_DIR, f), 'utf8');
          
          await client.query('BEGIN');
          try {
            // Execute the migration SQL
            await client.query(sqlText);
            
            // Record the migration as applied
            await client.query(
              'INSERT INTO _migrations (id, name, filename) VALUES ($1, $2, $3)',
              [id, name, f]
            );
            
            await client.query('COMMIT');
            
            console.log(`✅ Applied ${f}`);
            results.push({
              filename: f,
              applied: true,
              timestamp
            });
            
          } catch (error) {
            await client.query('ROLLBACK');
            throw error;
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(`❌ Failed to apply ${f}: ${errorMessage}`);
          results.push({
            filename: f,
            applied: false,
            error: errorMessage,
            timestamp
          });
        }
      }
    } finally {
      if (usePg && client) {
        client.release();
      }
      // Supabase client doesn't need explicit cleanup
    }

    console.log(`\n📊 Migration Summary:`);
    console.log(`- Total files: ${results.length}`);
    console.log(`- Successfully applied: ${results.filter(r => r.applied).length}`);
    console.log(`- Skipped/Failed: ${results.filter(r => !r.applied).length}`);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : String(error);
    console.error(`💥 Migration runner failed: ${errorMessage}`);
    console.error(`💥 Full error details:`, errorStack);
    
    results.push({
      filename: 'RUNNER_ERROR',
      applied: false,
      error: errorMessage,
      timestamp: new Date().toISOString()
    });
  } finally {
    // Write results to JSON file
    const outputFile = join(OUT_DIR, 'migrate-up.json');
    const output = {
      success: results.length > 0 && results.every(r => r.applied || r.error === 'Already applied'),
      timestamp: new Date().toISOString(),
      migrations: results,
      summary: {
        total: results.length,
        applied: results.filter(r => r.applied).length,
        skipped: results.filter(r => !r.applied && r.error === 'Already applied').length,
        failed: results.filter(r => !r.applied && r.error !== 'Already applied').length
      }
    };
    
    writeFileSync(outputFile, JSON.stringify(output, null, 2));
    console.log(`📄 Results written to: ${outputFile}`);
    
    await closeConnections();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
