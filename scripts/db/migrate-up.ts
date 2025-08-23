#!/usr/bin/env tsx
import '../shared/bootstrapEnv';
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { withSession, closeConnections } from '../shared/db';

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

    await withSession(async (client) => {
      // Create migrations table if it doesn't exist
      await client.query(`
        CREATE TABLE IF NOT EXISTS _migrations (
          id INT PRIMARY KEY, 
          name TEXT, 
          filename TEXT, 
          applied_at TIMESTAMPTZ DEFAULT now()
        )
      `);

      // Get applied migrations
      const appliedRows = await client.query('SELECT id FROM _migrations ORDER BY id');
      const applied = new Set<number>(appliedRows.rows.map((r: any) => r.id));

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
    });

    console.log(`\n📊 Migration Summary:`);
    console.log(`- Total files: ${results.length}`);
    console.log(`- Successfully applied: ${results.filter(r => r.applied).length}`);
    console.log(`- Skipped/Failed: ${results.filter(r => !r.applied).length}`);

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
