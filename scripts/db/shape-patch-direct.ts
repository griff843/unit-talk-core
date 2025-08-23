#!/usr/bin/env tsx
import 'dotenv/config';
import { Pool } from 'pg';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

interface ShapePatchOutput {
  ok: boolean;
  applied: boolean;
  statements: number;
  timestamp: string;
  error?: string;
  details?: any;
}

/**
 * Idempotent SQL statements to ensure database shape matches requirements
 */
const SHAPE_PATCH_SQL = [
  // Ensure raw_props table exists with required columns
  `CREATE TABLE IF NOT EXISTS public.raw_props (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    data JSONB NOT NULL DEFAULT '{}',
    type TEXT,
    source TEXT,
    is_canary BOOLEAN DEFAULT FALSE,
    inserted_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    is_promoted BOOLEAN DEFAULT FALSE,
    tenant_id TEXT DEFAULT 'public'
  );`,

  // Add columns if they don't exist (idempotent)
  `DO $$ 
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'raw_props' AND column_name = 'processed_at') THEN
      ALTER TABLE public.raw_props ADD COLUMN processed_at TIMESTAMPTZ;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'raw_props' AND column_name = 'is_promoted') THEN
      ALTER TABLE public.raw_props ADD COLUMN is_promoted BOOLEAN DEFAULT FALSE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'raw_props' AND column_name = 'tenant_id') THEN
      ALTER TABLE public.raw_props ADD COLUMN tenant_id TEXT DEFAULT 'public';
    END IF;
  END $$;`,

  // Ensure unified_picks table exists with required columns
  `CREATE TABLE IF NOT EXISTS public.unified_picks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    raw_id UUID REFERENCES public.raw_props(id),
    promoted_at TIMESTAMPTZ,
    settled_at TIMESTAMPTZ,
    data JSONB NOT NULL DEFAULT '{}',
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    tenant_id TEXT DEFAULT 'public'
  );`,

  // Add columns if they don't exist (idempotent)
  `DO $$ 
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'unified_picks' AND column_name = 'promoted_at') THEN
      ALTER TABLE public.unified_picks ADD COLUMN promoted_at TIMESTAMPTZ;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'unified_picks' AND column_name = 'settled_at') THEN
      ALTER TABLE public.unified_picks ADD COLUMN settled_at TIMESTAMPTZ;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'unified_picks' AND column_name = 'status') THEN
      ALTER TABLE public.unified_picks ADD COLUMN status TEXT DEFAULT 'active';
    END IF;
  END $$;`,

  // Create indexes if they don't exist (idempotent)
  `CREATE INDEX IF NOT EXISTS idx_raw_props_inserted_at ON public.raw_props(inserted_at);`,
  `CREATE INDEX IF NOT EXISTS idx_raw_props_processed_at ON public.raw_props(processed_at);`,
  `CREATE INDEX IF NOT EXISTS idx_raw_props_is_promoted ON public.raw_props(is_promoted);`,
  `CREATE INDEX IF NOT EXISTS idx_raw_props_tenant_id ON public.raw_props(tenant_id);`,
  `CREATE INDEX IF NOT EXISTS idx_unified_picks_raw_id ON public.unified_picks(raw_id);`,
  `CREATE INDEX IF NOT EXISTS idx_unified_picks_promoted_at ON public.unified_picks(promoted_at);`,
  `CREATE INDEX IF NOT EXISTS idx_unified_picks_status ON public.unified_picks(status);`,
  `CREATE INDEX IF NOT EXISTS idx_unified_picks_tenant_id ON public.unified_picks(tenant_id);`,

  // Update triggers for updated_at (idempotent)
  `CREATE OR REPLACE FUNCTION update_updated_at_column()
  RETURNS TRIGGER AS $$
  BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
  END;
  $$ language 'plpgsql';`,

  `DO $$ 
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_raw_props_updated_at') THEN
      CREATE TRIGGER update_raw_props_updated_at 
        BEFORE UPDATE ON public.raw_props 
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_unified_picks_updated_at') THEN
      CREATE TRIGGER update_unified_picks_updated_at 
        BEFORE UPDATE ON public.unified_picks 
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
  END $$;`
];

/**
 * Get direct database connection using pg library
 * Does NOT set any app.* session variables or use RLS helpers
 */
function createDirectConnection(): Pool {
  const connectionString = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;
  
  if (!connectionString) {
    throw new Error('Missing DATABASE_URL_DIRECT or DATABASE_URL environment variable. Set one of these to connect to your database.');
  }

  if (connectionString.includes('localhost') || connectionString.includes('127.0.0.1')) {
    // Local connection - don't use SSL
    return new Pool({
      connectionString,
      application_name: 'unit-talk-shape-patcher',
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
  } else {
    // Remote connection (Supabase/cloud) - use SSL
    return new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false }, // Required for Supabase pooler
      application_name: 'unit-talk-shape-patcher',
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
  }
}

/**
 * Apply idempotent shape patch to database
 */
async function applyShapePatch(): Promise<ShapePatchOutput> {
  const result: ShapePatchOutput = {
    ok: false,
    applied: false,
    statements: 0,
    timestamp: new Date().toISOString(),
  };

  let pool: Pool | null = null;

  try {
    console.log('🔧 Creating direct database connection...');
    pool = createDirectConnection();
    const client = await pool.connect();
    
    try {
      console.log('🚀 Applying shape patch statements...');
      
      // Execute each SQL statement
      for (let i = 0; i < SHAPE_PATCH_SQL.length; i++) {
        const sql = SHAPE_PATCH_SQL[i];
        console.log(`  📝 Executing statement ${i + 1}/${SHAPE_PATCH_SQL.length}...`);
        
        try {
          await client.query(sql);
          result.statements++;
        } catch (sqlError) {
          const errorMsg = sqlError instanceof Error ? sqlError.message : String(sqlError);
          console.error(`  ❌ Statement ${i + 1} failed: ${errorMsg}`);
          throw new Error(`SQL statement ${i + 1} failed: ${errorMsg}`);
        }
      }
      
      console.log('✅ All statements executed successfully');
      result.ok = true;
      result.applied = true;
      
      // Verification queries
      const verification = await client.query(`
        SELECT 
          (SELECT count(*) FROM information_schema.tables 
           WHERE table_schema = 'public' AND table_name IN ('raw_props', 'unified_picks')) as tables_count,
          (SELECT count(*) FROM information_schema.columns 
           WHERE table_schema = 'public' AND table_name = 'raw_props' 
           AND column_name IN ('id', 'data', 'processed_at', 'is_promoted')) as raw_props_cols,
          (SELECT count(*) FROM information_schema.columns 
           WHERE table_schema = 'public' AND table_name = 'unified_picks' 
           AND column_name IN ('id', 'raw_id', 'promoted_at', 'status')) as unified_picks_cols
      `);
      
      result.details = {
        verification: verification.rows[0],
        statements_executed: result.statements,
        connection_string_source: process.env.DATABASE_URL_DIRECT ? 'DATABASE_URL_DIRECT' : 'DATABASE_URL'
      };
      
      console.log('📊 Verification results:', result.details.verification);
      
    } finally {
      client.release();
    }
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('❌ Shape patch failed:', errorMsg);
    
    result.ok = false;
    result.applied = false;
    result.error = errorMsg;
    result.details = {
      error_type: error instanceof Error ? error.constructor.name : 'Unknown',
      statements_attempted: result.statements
    };
  } finally {
    if (pool) {
      try {
        await pool.end();
      } catch (closeError) {
        console.warn('⚠️ Warning: Failed to close connection pool:', closeError);
      }
    }
  }

  return result;
}

/**
 * Main execution function
 */
async function main(): Promise<void> {
  console.log('🎯 Unit Talk Database Shape Patcher');
  console.log('📅 Timestamp:', new Date().toISOString());
  
  // Check environment variables before proceeding
  const connectionString = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('❌ Missing database connection string');
    console.error('   Set DATABASE_URL_DIRECT or DATABASE_URL environment variable');
    console.error('   Example: DATABASE_URL_DIRECT="postgresql://user:password@host:5432/database"');
    process.exit(1);
  }
  
  console.log('🔗 Connection source:', process.env.DATABASE_URL_DIRECT ? 'DATABASE_URL_DIRECT' : 'DATABASE_URL');
  
  const result = await applyShapePatch();
  
  // Ensure output directory exists
  const outDir = join(process.cwd(), 'out', 'db');
  mkdirSync(outDir, { recursive: true });
  
  // Write result to JSON file
  const outPath = join(outDir, 'shape-patch.json');
  writeFileSync(outPath, JSON.stringify(result, null, 2));
  
  console.log('📁 Output written to:', outPath);
  
  // Log summary
  if (result.ok) {
    console.log(`✅ SUCCESS: Shape patch applied successfully`);
    console.log(`📊 Statements executed: ${result.statements}`);
    console.log(`🕐 Completed at: ${result.timestamp}`);
  } else {
    console.error(`❌ FAILURE: Shape patch failed`);
    console.error(`💥 Error: ${result.error}`);
    console.error(`📊 Statements attempted: ${result.statements}`);
    process.exit(1);
  }
}

// Execute main function with proper error handling
if (require.main === module) {
  main().catch((error) => {
    console.error('💥 Unhandled error in shape patcher:', error);
    process.exit(1);
  });
}