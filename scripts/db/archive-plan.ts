#!/usr/bin/env node

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createClient } from '@supabase/supabase-js';

interface ArchiveConfig {
  retention_policy: {
    raw_props: {
      keep_days: number;
      archive_after_days: number;
      delete_after_days: number;
    };
    unified_picks: {
      keep_days: number;
      archive_after_days: number; 
      delete_after_days: number;
    };
  };
  archive_strategy: {
    method: 'export' | 'archive_table' | 'cold_storage';
    compression: boolean;
    batch_size: number;
    parallel_workers: number;
  };
  storage_targets: {
    local_path?: string;
    s3_bucket?: string;
    archive_database?: string;
  };
  safety_checks: {
    min_retention_days: number;
    max_batch_size: number;
    require_backup: boolean;
    verify_exports: boolean;
  };
}

interface ArchivePlan {
  timestamp: string;
  config: ArchiveConfig;
  analysis: {
    total_candidates: number;
    size_to_archive_mb: number;
    estimated_space_savings_mb: number;
    oldest_record_age_days: number;
    newest_archive_candidate_age_days: number;
  };
  execution_plan: {
    archive_batches: Array<{
      batch_id: string;
      table_name: string;
      date_range: {
        start: string;
        end: string;
      };
      estimated_rows: number;
      estimated_size_mb: number;
      execution_order: number;
    }>;
    estimated_duration_hours: number;
    required_storage_gb: number;
    risk_assessment: 'LOW' | 'MEDIUM' | 'HIGH';
  };
  verification: {
    pre_archive_checksums: { [table: string]: string };
    post_archive_verification_queries: string[];
    rollback_procedures: string[];
  };
  recommendations: string[];
}

class ArchivalPlanner {
  private supabase: any;
  private skipSupabaseExecSql: boolean;
  private config: ArchiveConfig;

  constructor() {
    this.skipSupabaseExecSql = process.env.SKIP_SUPABASE_EXEC_SQL === 'true';
    this.loadConfig();
    this.initializeDatabase();
  }

  private loadConfig(): void {
    // Default archival configuration
    this.config = {
      retention_policy: {
        raw_props: {
          keep_days: 90,        // Keep 3 months in main table
          archive_after_days: 90, // Archive older than 3 months
          delete_after_days: 1095  // Delete after 3 years (2 years in archive)
        },
        unified_picks: {
          keep_days: 180,       // Keep 6 months in main table  
          archive_after_days: 180, // Archive older than 6 months
          delete_after_days: 2190  // Delete after 6 years (5.5 years in archive)
        }
      },
      archive_strategy: {
        method: 'export',      // Export to files by default
        compression: true,     // Enable compression
        batch_size: 10000,     // Process in 10K record batches
        parallel_workers: 2    // Use 2 parallel workers
      },
      storage_targets: {
        local_path: join(process.cwd(), 'out', 'archives'),
        s3_bucket: process.env.ARCHIVE_S3_BUCKET,
        archive_database: process.env.ARCHIVE_DATABASE_URL
      },
      safety_checks: {
        min_retention_days: 30,   // Never archive data less than 30 days old
        max_batch_size: 50000,    // Safety limit on batch size
        require_backup: true,     // Require backup before archival
        verify_exports: true      // Verify exported data integrity
      }
    };
  }

  private initializeDatabase(): void {
    if (this.skipSupabaseExecSql) {
      console.log('🔧 SKIP_SUPABASE_EXEC_SQL=true: Using mock database for archive planning');
      this.supabase = {
        from: (table: string) => ({
          select: () => ({ data: this.generateMockArchiveCandidates(table), error: null })
        })
      };
    } else {
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      
      if (!supabaseUrl || !supabaseKey) {
        throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for archive planning');
      }
      
      this.supabase = createClient(supabaseUrl, supabaseKey);
    }
  }

  private generateMockArchiveCandidates(table: string): any[] {
    const now = new Date();
    const mockCandidates = [];
    
    if (table === 'raw_props') {
      // Generate mock data for the last 200 days
      for (let days = 200; days >= this.config.retention_policy.raw_props.keep_days; days--) {
        const date = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
        const rowCount = Math.floor(Math.random() * 1000) + 500; // 500-1500 rows per day
        
        mockCandidates.push({
          date: date.toISOString().split('T')[0],
          row_count: rowCount,
          estimated_size_kb: rowCount * 2.5 // 2.5KB per row estimate
        });
      }
    } else if (table === 'unified_picks') {
      // Generate mock data for unified_picks
      for (let days = 300; days >= this.config.retention_policy.unified_picks.keep_days; days--) {
        const date = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
        const rowCount = Math.floor(Math.random() * 200) + 100; // 100-300 rows per day
        
        mockCandidates.push({
          date: date.toISOString().split('T')[0],
          row_count: rowCount,
          estimated_size_kb: rowCount * 3.2 // 3.2KB per row estimate (more metadata)
        });
      }
    }
    
    return mockCandidates;
  }

  public async analyzeArchiveCandidates(): Promise<ArchivePlan['analysis']> {
    console.log('🔍 Analyzing archive candidates...');

    try {
      const analysis = {
        total_candidates: 0,
        size_to_archive_mb: 0,
        estimated_space_savings_mb: 0,
        oldest_record_age_days: 0,
        newest_archive_candidate_age_days: 0
      };

      // Analyze raw_props candidates
      const rawPropsQuery = `
        SELECT 
          DATE(inserted_at) as date,
          COUNT(*) as row_count,
          AVG(LENGTH(payload::text)) as avg_row_size
        FROM raw_props
        WHERE inserted_at < NOW() - INTERVAL '${this.config.retention_policy.raw_props.archive_after_days} days'
        GROUP BY DATE(inserted_at)
        ORDER BY date
      `;

      let rawPropsCandidates;
      if (this.skipSupabaseExecSql) {
        rawPropsCandidates = this.generateMockArchiveCandidates('raw_props');
      } else {
        const { data } = await this.supabase.rpc('execute_sql', { query: rawPropsQuery });
        rawPropsCandidates = data || [];
      }

      // Analyze unified_picks candidates  
      const unifiedPicksQuery = `
        SELECT 
          DATE(promoted_at) as date,
          COUNT(*) as row_count,
          AVG(LENGTH(payload::text)) as avg_row_size
        FROM unified_picks
        WHERE promoted_at < NOW() - INTERVAL '${this.config.retention_policy.unified_picks.archive_after_days} days'
          AND promoted_at IS NOT NULL
        GROUP BY DATE(promoted_at)
        ORDER BY date
      `;

      let unifiedPicksCandidates;
      if (this.skipSupabaseExecSql) {
        unifiedPicksCandidates = this.generateMockArchiveCandidates('unified_picks');
      } else {
        const { data } = await this.supabase.rpc('execute_sql', { query: unifiedPicksQuery });
        unifiedPicksCandidates = data || [];
      }

      // Calculate totals
      const allCandidates = [
        ...rawPropsCandidates.map(r => ({ ...r, table: 'raw_props' })),
        ...unifiedPicksCandidates.map(r => ({ ...r, table: 'unified_picks' }))
      ];

      for (const candidate of allCandidates) {
        analysis.total_candidates += candidate.row_count;
        
        const sizeKb = candidate.estimated_size_kb || (candidate.row_count * (candidate.avg_row_size || 2500));
        analysis.size_to_archive_mb += sizeKb / 1024;
      }

      // Estimate space savings (compression + index removal)
      analysis.estimated_space_savings_mb = Math.round(
        analysis.size_to_archive_mb * (this.config.archive_strategy.compression ? 0.7 : 0.3)
      );

      // Calculate age ranges
      if (allCandidates.length > 0) {
        const dates = allCandidates.map(c => new Date(c.date + 'T00:00:00Z'));
        const oldestDate = new Date(Math.min(...dates.map(d => d.getTime())));
        const newestDate = new Date(Math.max(...dates.map(d => d.getTime())));
        const now = new Date();

        analysis.oldest_record_age_days = Math.floor(
          (now.getTime() - oldestDate.getTime()) / (24 * 60 * 60 * 1000)
        );
        analysis.newest_archive_candidate_age_days = Math.floor(
          (now.getTime() - newestDate.getTime()) / (24 * 60 * 60 * 1000)
        );
      }

      console.log(`📊 Found ${analysis.total_candidates.toLocaleString()} records to archive`);
      console.log(`💾 Size to archive: ${Math.round(analysis.size_to_archive_mb)}MB`);
      console.log(`💰 Estimated space savings: ${analysis.estimated_space_savings_mb}MB`);

      return analysis;

    } catch (error) {
      console.error('❌ Failed to analyze archive candidates:', error);
      throw error;
    }
  }

  public createExecutionPlan(analysis: ArchivePlan['analysis']): ArchivePlan['execution_plan'] {
    console.log('📋 Creating archive execution plan...');

    const archiveBatches = [];
    const now = new Date();

    // Create batches for raw_props
    const rawPropsArchiveDate = new Date(
      now.getTime() - this.config.retention_policy.raw_props.archive_after_days * 24 * 60 * 60 * 1000
    );

    let batchId = 1;
    let executionOrder = 1;

    // Weekly batches for raw_props (going back from archive threshold)
    for (let weeks = 0; weeks < 52; weeks++) { // Up to 1 year of weekly batches
      const weekEnd = new Date(rawPropsArchiveDate.getTime() - weeks * 7 * 24 * 60 * 60 * 1000);
      const weekStart = new Date(weekEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
      
      // Stop if we go too far back
      if (weekEnd < new Date(now.getTime() - this.config.retention_policy.raw_props.delete_after_days * 24 * 60 * 60 * 1000)) {
        break;
      }

      const estimatedRows = Math.floor(Math.random() * 7000) + 3000; // 3K-10K rows per week
      const estimatedSizeMb = Math.round((estimatedRows * 2.5) / 1024); // 2.5KB per row

      archiveBatches.push({
        batch_id: `raw_props_${batchId.toString().padStart(3, '0')}`,
        table_name: 'raw_props',
        date_range: {
          start: weekStart.toISOString(),
          end: weekEnd.toISOString()
        },
        estimated_rows: estimatedRows,
        estimated_size_mb: estimatedSizeMb,
        execution_order: executionOrder++
      });

      batchId++;
    }

    // Create batches for unified_picks (monthly for longer retention)
    const unifiedPicksArchiveDate = new Date(
      now.getTime() - this.config.retention_policy.unified_picks.archive_after_days * 24 * 60 * 60 * 1000
    );

    for (let months = 0; months < 24; months++) { // Up to 2 years of monthly batches
      const monthEnd = new Date(unifiedPicksArchiveDate.getFullYear(), unifiedPicksArchiveDate.getMonth() - months + 1, 1);
      const monthStart = new Date(unifiedPicksArchiveDate.getFullYear(), unifiedPicksArchiveDate.getMonth() - months, 1);
      
      // Stop if we go too far back
      if (monthEnd < new Date(now.getTime() - this.config.retention_policy.unified_picks.delete_after_days * 24 * 60 * 60 * 1000)) {
        break;
      }

      const estimatedRows = Math.floor(Math.random() * 5000) + 2000; // 2K-7K rows per month
      const estimatedSizeMb = Math.round((estimatedRows * 3.2) / 1024); // 3.2KB per row

      archiveBatches.push({
        batch_id: `unified_picks_${batchId.toString().padStart(3, '0')}`,
        table_name: 'unified_picks',
        date_range: {
          start: monthStart.toISOString(),
          end: monthEnd.toISOString()
        },
        estimated_rows: estimatedRows,
        estimated_size_mb: estimatedSizeMb,
        execution_order: executionOrder++
      });

      batchId++;
    }

    // Calculate totals and estimates
    const totalBatches = archiveBatches.length;
    const totalSize = archiveBatches.reduce((sum, batch) => sum + batch.estimated_size_mb, 0);
    
    // Estimate duration (1 minute per 1000 records + overhead)
    const estimatedDurationHours = Math.ceil(
      (analysis.total_candidates / 1000) / 60 + (totalBatches * 0.1) // 0.1 hour overhead per batch
    );

    // Required storage (with compression and safety margin)
    const requiredStorageGb = Math.ceil(
      totalSize * (this.config.archive_strategy.compression ? 0.6 : 1.0) * 1.2 / 1024 // 20% safety margin
    );

    // Risk assessment
    let riskAssessment: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
    if (analysis.total_candidates > 500000 || totalSize > 1000) {
      riskAssessment = 'HIGH';
    } else if (analysis.total_candidates > 100000 || totalSize > 500) {
      riskAssessment = 'MEDIUM';
    }

    return {
      archive_batches: archiveBatches,
      estimated_duration_hours: estimatedDurationHours,
      required_storage_gb: requiredStorageGb,
      risk_assessment: riskAssessment
    };
  }

  public generateVerificationPlan(): ArchivePlan['verification'] {
    console.log('🔍 Generating verification plan...');

    const preArchiveChecksums = {
      'raw_props': 'SELECT COUNT(*), SUM(LENGTH(payload::text)) FROM raw_props WHERE inserted_at < $archive_date',
      'unified_picks': 'SELECT COUNT(*), SUM(LENGTH(payload::text)) FROM unified_picks WHERE promoted_at < $archive_date'
    };

    const postArchiveQueries = [
      `-- Verify archive file integrity
       SELECT 
         archive_file,
         record_count,
         file_size_bytes,
         checksum
       FROM archive_manifest 
       WHERE created_at >= $archive_start_time;`,

      `-- Verify no data loss during archive
       SELECT 
         table_name,
         records_before,
         records_after,
         records_archived,
         (records_before - records_after - records_archived) as missing_records
       FROM archive_verification_log
       WHERE missing_records != 0;`,

      `-- Verify archive completeness
       SELECT 
         batch_id,
         status,
         records_processed,
         records_expected,
         error_message
       FROM archive_batch_log
       WHERE status != 'completed' OR records_processed != records_expected;`,

      `-- Check for orphaned records
       SELECT COUNT(*) as orphaned_count
       FROM raw_props r
       LEFT JOIN unified_picks u ON u.raw_id = r.id
       WHERE r.inserted_at < $archive_date AND u.id IS NULL;`
    ];

    const rollbackProcedures = [
      '1. Stop archival process immediately',
      '2. Restore from pre-archive backup if data loss detected',
      '3. Re-import archived data from export files',
      '4. Verify data integrity with checksums',
      '5. Resume normal operations after verification',
      '6. Investigate root cause of archive failure',
      '7. Update archive procedures based on findings'
    ];

    return {
      pre_archive_checksums: preArchiveChecksums,
      post_archive_verification_queries: postArchiveQueries,
      rollback_procedures: rollbackProcedures
    };
  }

  public generateRecommendations(
    analysis: ArchivePlan['analysis'],
    executionPlan: ArchivePlan['execution_plan']
  ): string[] {
    const recommendations: string[] = [];

    // Size-based recommendations
    if (analysis.size_to_archive_mb < 100) {
      recommendations.push('⚠️  Archive size is small - consider increasing retention period');
    } else if (analysis.size_to_archive_mb > 5000) {
      recommendations.push('🚨 Large archive size - consider splitting into smaller batches');
      recommendations.push('💾 Ensure sufficient storage capacity before starting');
    } else {
      recommendations.push('✅ Archive size is manageable for standard procedures');
    }

    // Risk-based recommendations
    if (executionPlan.risk_assessment === 'HIGH') {
      recommendations.push('🚨 High-risk archive - test thoroughly in staging environment');
      recommendations.push('⏰ Schedule during low-traffic period with extended maintenance window');
      recommendations.push('👥 Ensure multiple team members available during execution');
    } else if (executionPlan.risk_assessment === 'MEDIUM') {
      recommendations.push('⚠️  Medium-risk archive - ensure backup and monitoring procedures');
    }

    // Performance recommendations
    if (executionPlan.estimated_duration_hours > 8) {
      recommendations.push('⏱️  Long-running archive - implement progress monitoring');
      recommendations.push('🔄 Consider increasing parallel workers if resources allow');
    }

    // Storage recommendations
    if (this.config.storage_targets.s3_bucket) {
      recommendations.push('☁️  S3 storage configured - enable versioning for additional safety');
      recommendations.push('💰 Configure S3 lifecycle policies for cost optimization');
    }

    if (this.config.archive_strategy.compression) {
      recommendations.push('🗜️  Compression enabled - verify decompression tools available');
    }

    // Operational recommendations
    recommendations.push('📊 Monitor database performance during archive execution');
    recommendations.push('🔍 Implement archive job status dashboard');
    recommendations.push('📝 Document archive execution for future reference');
    recommendations.push('🔄 Plan regular archive schedule (monthly/quarterly)');
    recommendations.push('🧪 Test restore procedures from archived data');

    return recommendations;
  }

  public async createArchivePlan(): Promise<ArchivePlan> {
    const startTime = Date.now();
    console.log('📋 Creating comprehensive archive plan...');

    try {
      // Analyze what needs to be archived
      const analysis = await this.analyzeArchiveCandidates();
      
      // Create execution plan
      const executionPlan = this.createExecutionPlan(analysis);
      
      // Generate verification procedures
      const verification = this.generateVerificationPlan();
      
      // Generate recommendations
      const recommendations = this.generateRecommendations(analysis, executionPlan);

      const plan: ArchivePlan = {
        timestamp: new Date().toISOString(),
        config: this.config,
        analysis,
        execution_plan: executionPlan,
        verification,
        recommendations
      };

      const duration = Date.now() - startTime;
      console.log(`✅ Archive plan created in ${duration}ms`);
      console.log(`📊 ${analysis.total_candidates.toLocaleString()} records planned for archival`);
      console.log(`💾 ${Math.round(analysis.size_to_archive_mb)}MB to archive`);
      console.log(`⏱️  Estimated duration: ${executionPlan.estimated_duration_hours}h`);
      console.log(`⚠️  Risk level: ${executionPlan.risk_assessment}`);

      return plan;

    } catch (error) {
      console.error('❌ Archive planning failed:', error);
      throw error;
    }
  }

  public async saveArchivePlan(plan: ArchivePlan): Promise<void> {
    const outputPath = join(process.cwd(), 'out', 'ops', 'archive-plan.json');
    
    try {
      writeFileSync(outputPath, JSON.stringify(plan, null, 2));
      console.log(`📁 Archive plan saved to ${outputPath}`);
    } catch (error) {
      console.error('❌ Failed to save archive plan:', error);
      throw error;
    }
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'plan';

  // Safety check - prevent accidental execution
  if (process.env.APPLY_ARCHIVE === 'true') {
    console.log('🚨 APPLY_ARCHIVE=true detected - this is a planning tool only!');
    console.log('   For actual archival, use dedicated execution scripts');
    process.exit(1);
  }

  try {
    const planner = new ArchivalPlanner();

    switch (command) {
      case 'plan':
        const plan = await planner.createArchivePlan();
        await planner.saveArchivePlan(plan);
        break;

      case 'analyze':
        const analysis = await planner.analyzeArchiveCandidates();
        console.log('📊 Archive Analysis Results:');
        console.log(`   Candidates: ${analysis.total_candidates.toLocaleString()} records`);
        console.log(`   Size: ${Math.round(analysis.size_to_archive_mb)}MB`);
        console.log(`   Savings: ${analysis.estimated_space_savings_mb}MB`);
        console.log(`   Age range: ${analysis.newest_archive_candidate_age_days}-${analysis.oldest_record_age_days} days`);
        break;

      case 'config':
        console.log('⚙️  Current Archive Configuration:');
        console.log(JSON.stringify(planner.config, null, 2));
        break;

      default:
        console.log('Usage: archive-plan.ts [plan|analyze|config]');
        console.log('');
        console.log('Commands:');
        console.log('  plan     - Create comprehensive archive plan (default)');
        console.log('  analyze  - Analyze archive candidates only');
        console.log('  config   - Show current configuration');
        console.log('');
        console.log('Note: This is a planning tool. No data is archived.');
        console.log('      Set APPLY_ARCHIVE=true only for actual execution scripts.');
        process.exit(1);
    }

  } catch (error) {
    console.error('❌ Archive planning failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { ArchivalPlanner, ArchivePlan, ArchiveConfig };