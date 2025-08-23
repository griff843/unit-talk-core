#!/usr/bin/env tsx
import '../shared/bootstrapEnv';
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { getSupabaseAdmin, closeConnections } from '../shared/db';

const MIGRATIONS_DIR = join(process.cwd(), 'migrations');
const OUT_DIR = join(process.cwd(), 'out', 'db');

interface MigrationResult {
  filename: string;
  applied: boolean;
  error?: string;
  timestamp: string;
}

/**
 * Simple migration runner that executes migrations without tracking
 * This bypasses the _migrations table issue
 */
async function main() {
  const results: MigrationResult[] = [];
  
  try {
    // Ensure output directory exists
    if (!existsSync(OUT_DIR)) {
      mkdirSync(OUT_DIR, { recursive: true });
    }

    console.log('🔧 Starting simple migration runner (no _migrations tracking)');
    
    const supabase = getSupabaseAdmin();
    
    // Get all migration files
    const files = readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort();

    console.log(`Found ${files.length} migration files`);

    for (const f of files) {
      const timestamp = new Date().toISOString();
      
      console.log(`🔄 Processing ${f}...`);
      
      try {
        const sqlText = readFileSync(join(MIGRATIONS_DIR, f), 'utf8');
        
        // Execute via Supabase REST API
        const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
            'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY!
          },
          body: JSON.stringify({ sql: sqlText })
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        
        const result = await response.json();
        console.log(`✅ Applied ${f} successfully`);
        
        results.push({
          filename: f,
          applied: true,
          timestamp
        });
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`❌ Failed to apply ${f}: ${errorMessage}`);
        results.push({
          filename: f,
          applied: false,
          error: errorMessage,
          timestamp
        });
        
        // Continue with other migrations even if one fails
      }
    }

    console.log(`\n📊 Migration Summary:`);
    console.log(`- Total files: ${results.length}`);
    console.log(`- Successfully applied: ${results.filter(r => r.applied).length}`);
    console.log(`- Failed: ${results.filter(r => !r.applied).length}`);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`💥 Migration runner failed: ${errorMessage}`);
    
    results.push({
      filename: 'RUNNER_ERROR',
      applied: false,
      error: errorMessage,
      timestamp: new Date().toISOString()
    });
  } finally {
    // Write results to JSON file
    const outputFile = join(OUT_DIR, 'simple-migrate-up.json');
    const output = {
      success: results.length > 0 && results.every(r => r.applied),
      timestamp: new Date().toISOString(),
      migrations: results,
      summary: {
        total: results.length,
        applied: results.filter(r => r.applied).length,
        failed: results.filter(r => !r.applied).length
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