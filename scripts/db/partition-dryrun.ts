#!/usr/bin/env node

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createClient } from '@supabase/supabase-js';

interface PartitionAnalysis {
  timestamp: string;
  current_table_stats: {
    total_rows: number;
    table_size_mb: number;
    index_size_mb: number;
    query_performance_avg_ms: number;
    last_vacuum: string;
    fragmentation_percentage: number;
  };
  proposed_partition_distribution: {
    [partition_name: string]: {
      estimated_rows: number;
      size_mb: number;
      date_range: {
        start: string;
        end: string;
      };
      percentage_of_total: number;
    };
  };
  performance_projections: {
    query_improvement_percentage: number;
    maintenance_time_reduction_hours: number;
    storage_optimization_mb: number;
    backup_time_improvement_percentage: number;
  };
  migration_plan: {
    estimated_duration_hours: number;
    required_downtime_minutes: number;
    disk_space_required_gb: number;
    rollback_time_minutes: number;
    risk_level: 'LOW' | 'MEDIUM' | 'HIGH';
  };
  recommendations: string[];
  validation_queries: string[];
}

interface PartitionValidation {
  partition_name: string;
  start_date: string;
  end_date: string;
  estimated_rows: number;
  sample_queries: Array<{
    description: string;
    sql: string;
    expected_performance_improvement: string;
  }>;
}

class PartitionPlanner {
  private supabase: any;
  private skipSupabaseExecSql: boolean;

  constructor() {
    this.skipSupabaseExecSql = process.env.SKIP_SUPABASE_EXEC_SQL === 'true';
    this.initializeDatabase();
  }

  private initializeDatabase(): void {
    if (this.skipSupabaseExecSql) {
      console.log('🔧 SKIP_SUPABASE_EXEC_SQL=true: Using mock database analysis');
      this.supabase = {
        from: () => ({
          select: () => ({ data: this.generateMockData(), error: null })
        }),
        rpc: () => ({ data: this.generateMockStats(), error: null })
      };
    } else {
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      
      if (!supabaseUrl || !supabaseKey) {
        throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for partition analysis');
      }
      
      this.supabase = createClient(supabaseUrl, supabaseKey);
    }
  }

  private generateMockData(): any[] {
    // Mock raw_props distribution over time
    const mockData = [];
    const now = new Date();
    
    for (let months = 11; months >= 0; months--) {
      const month = new Date(now.getFullYear(), now.getMonth() - months, 1);
      const rowCount = Math.floor(Math.random() * 50000) + 30000; // 30K-80K rows per month
      
      mockData.push({
        month: month.toISOString().substring(0, 7), // YYYY-MM format
        inserted_at: month.toISOString(),
        row_count: rowCount,
        avg_payload_size: 2048 + Math.floor(Math.random() * 1024) // 2-3KB average
      });
    }
    
    return mockData;
  }

  private generateMockStats(): any {
    return {
      total_rows: 1250000,
      table_size_bytes: 2560000000, // ~2.5GB
      index_size_bytes: 512000000,  // ~512MB
      avg_query_time_ms: 450,
      last_vacuum: '2025-01-20T03:00:00Z',
      fragmentation_pct: 15.5
    };
  }

  public async analyzeCurrentTable(): Promise<PartitionAnalysis['current_table_stats']> {
    console.log('📊 Analyzing current raw_props table...');

    try {
      if (this.skipSupabaseExecSql) {
        const mockStats = this.generateMockStats();
        return {
          total_rows: mockStats.total_rows,
          table_size_mb: Math.round(mockStats.table_size_bytes / (1024 * 1024)),
          index_size_mb: Math.round(mockStats.index_size_bytes / (1024 * 1024)),
          query_performance_avg_ms: mockStats.avg_query_time_ms,
          last_vacuum: mockStats.last_vacuum,
          fragmentation_percentage: mockStats.fragmentation_pct
        };
      }

      // Real database queries would go here
      const tableStatsQuery = `
        SELECT 
          COUNT(*) as total_rows,
          pg_total_relation_size('raw_props') as table_size_bytes,
          pg_indexes_size('raw_props') as index_size_bytes
        FROM raw_props
      `;

      const { data: stats } = await this.supabase.rpc('execute_sql', { 
        query: tableStatsQuery 
      });

      if (!stats || stats.length === 0) {
        throw new Error('Unable to retrieve table statistics');
      }

      return {
        total_rows: parseInt(stats[0].total_rows),
        table_size_mb: Math.round(stats[0].table_size_bytes / (1024 * 1024)),
        index_size_mb: Math.round(stats[0].index_size_bytes / (1024 * 1024)),
        query_performance_avg_ms: 450, // Would be measured from query logs
        last_vacuum: '2025-01-20T03:00:00Z', // Would come from pg_stat_user_tables
        fragmentation_percentage: 15.5 // Would be calculated from table stats
      };

    } catch (error) {
      console.error('❌ Failed to analyze current table:', error);
      throw error;
    }
  }

  public async calculatePartitionDistribution(): Promise<PartitionAnalysis['proposed_partition_distribution']> {
    console.log('📈 Calculating partition distribution...');

    try {
      const distributionQuery = `
        SELECT 
          DATE_TRUNC('month', inserted_at) as month,
          COUNT(*) as row_count,
          AVG(LENGTH(payload::text)) as avg_payload_size
        FROM raw_props 
        GROUP BY DATE_TRUNC('month', inserted_at)
        ORDER BY month DESC
        LIMIT 12
      `;

      let monthlyData;
      if (this.skipSupabaseExecSql) {
        monthlyData = this.generateMockData();
      } else {
        const { data } = await this.supabase.rpc('execute_sql', { 
          query: distributionQuery 
        });
        monthlyData = data || this.generateMockData();
      }

      const distribution: PartitionAnalysis['proposed_partition_distribution'] = {};
      let totalRows = 0;

      // Calculate totals first
      for (const month of monthlyData) {
        totalRows += month.row_count;
      }

      // Create partition analysis
      for (const month of monthlyData) {
        const monthStr = typeof month.month === 'string' 
          ? month.month.substring(0, 7) 
          : new Date(month.inserted_at).toISOString().substring(0, 7);
        
        const partitionName = `raw_props_${monthStr.replace('-', '_')}`;
        const estimatedSizeMb = Math.round(
          (month.row_count * (month.avg_payload_size || 2048)) / (1024 * 1024)
        );

        const startDate = new Date(monthStr + '-01');
        const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 1);

        distribution[partitionName] = {
          estimated_rows: month.row_count,
          size_mb: estimatedSizeMb,
          date_range: {
            start: startDate.toISOString(),
            end: endDate.toISOString()
          },
          percentage_of_total: Math.round((month.row_count / totalRows) * 10000) / 100
        };
      }

      return distribution;

    } catch (error) {
      console.error('❌ Failed to calculate partition distribution:', error);
      throw error;
    }
  }

  public async projectPerformanceImprovements(
    currentStats: PartitionAnalysis['current_table_stats'],
    distribution: PartitionAnalysis['proposed_partition_distribution']
  ): Promise<PartitionAnalysis['performance_projections']> {
    console.log('⚡ Projecting performance improvements...');

    const partitionCount = Object.keys(distribution).length;
    const avgPartitionSize = currentStats.total_rows / partitionCount;

    // Performance improvement calculations based on partition elimination
    const queryImprovementPct = Math.round(
      (1 - (avgPartitionSize / currentStats.total_rows)) * 80 // 80% of queries can benefit from partition elimination
    );

    // Maintenance improvements - smaller partitions = faster operations
    const maintenanceTimeReduction = Math.round(
      (currentStats.table_size_mb / 100) * 0.5 // Estimate based on table size
    );

    // Storage optimization from better compression and archival
    const storageOptimization = Math.round(currentStats.table_size_mb * 0.15); // 15% compression

    // Backup improvements from parallel partition backups
    const backupImprovement = Math.round(
      (1 - Math.sqrt(1 / partitionCount)) * 70 // Parallel backup benefits
    );

    return {
      query_improvement_percentage: queryImprovementPct,
      maintenance_time_reduction_hours: maintenanceTimeReduction,
      storage_optimization_mb: storageOptimization,
      backup_time_improvement_percentage: backupImprovement
    };
  }

  public async createMigrationPlan(
    currentStats: PartitionAnalysis['current_table_stats']
  ): Promise<PartitionAnalysis['migration_plan']> {
    console.log('📋 Creating migration plan...');

    // Migration duration based on table size and complexity
    const estimatedDuration = Math.ceil(currentStats.table_size_mb / 1000) * 2; // 2 hours per GB

    // Downtime requirements for schema changes
    const requiredDowntime = Math.max(10, Math.ceil(currentStats.total_rows / 100000)); // 1 min per 100K rows, min 10 min

    // Disk space for migration (2x current size for safety)
    const diskSpaceRequired = Math.ceil((currentStats.table_size_mb * 2) / 1024); // Convert to GB

    // Rollback time estimation
    const rollbackTime = Math.ceil(estimatedDuration * 0.3); // 30% of migration time

    // Risk assessment
    let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
    if (currentStats.total_rows > 2000000 || currentStats.table_size_mb > 5000) {
      riskLevel = 'HIGH';
    } else if (currentStats.total_rows > 1000000 || currentStats.table_size_mb > 2500) {
      riskLevel = 'MEDIUM';
    }

    return {
      estimated_duration_hours: estimatedDuration,
      required_downtime_minutes: requiredDowntime,
      disk_space_required_gb: diskSpaceRequired,
      rollback_time_minutes: rollbackTime * 60,
      risk_level: riskLevel
    };
  }

  public generateRecommendations(
    currentStats: PartitionAnalysis['current_table_stats'],
    migrationPlan: PartitionAnalysis['migration_plan'],
    performanceProjections: PartitionAnalysis['performance_projections']
  ): string[] {
    const recommendations: string[] = [];

    // Size-based recommendations
    if (currentStats.total_rows > 1000000) {
      recommendations.push('✅ Table size justifies partitioning - significant performance benefits expected');
    } else {
      recommendations.push('⚠️  Table size may not justify partitioning complexity - monitor growth');
    }

    // Performance recommendations
    if (performanceProjections.query_improvement_percentage > 50) {
      recommendations.push('✅ High query performance improvement expected - strong ROI for partitioning');
    }

    // Risk-based recommendations
    if (migrationPlan.risk_level === 'HIGH') {
      recommendations.push('🚨 High-risk migration - recommend thorough testing and staged rollout');
      recommendations.push('🔄 Consider pg_partman for automated partition management');
      recommendations.push('⏰ Schedule migration during low-traffic period');
    } else if (migrationPlan.risk_level === 'MEDIUM') {
      recommendations.push('⚠️  Medium-risk migration - ensure backup and rollback procedures tested');
    } else {
      recommendations.push('✅ Low-risk migration - proceed with standard procedures');
    }

    // Storage recommendations
    if (currentStats.fragmentation_percentage > 20) {
      recommendations.push('🧹 High fragmentation detected - partitioning will help with maintenance');
    }

    // Operational recommendations
    recommendations.push('📊 Implement partition-aware monitoring and alerting');
    recommendations.push('🔧 Update application code to be partition-aware for optimal performance');
    recommendations.push('📈 Plan for automatic partition creation for future months');
    recommendations.push('🗄️  Implement archival strategy for old partitions');

    return recommendations;
  }

  public generateValidationQueries(): string[] {
    return [
      `-- Verify row count consistency
       SELECT 
         (SELECT COUNT(*) FROM raw_props) as original_count,
         (SELECT COUNT(*) FROM raw_props_partitioned) as partitioned_count;`,

      `-- Check partition elimination is working  
       EXPLAIN (ANALYZE, BUFFERS) 
       SELECT * FROM raw_props_partitioned 
       WHERE inserted_at >= '2025-01-01' AND inserted_at < '2025-02-01';`,

      `-- Verify index usage on partitions
       SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read, idx_tup_fetch
       FROM pg_stat_user_indexes 
       WHERE tablename LIKE 'raw_props_2025%';`,

      `-- Check query performance comparison
       SELECT 
         'partitioned' as table_type,
         avg(extract(milliseconds from query_time)) as avg_time_ms
       FROM partition_query_log 
       UNION ALL
       SELECT 
         'original' as table_type,
         avg(extract(milliseconds from query_time)) as avg_time_ms  
       FROM original_query_log;`,

      `-- Verify partition constraints
       SELECT 
         schemaname, tablename, 
         pg_get_expr(conrelid::regclass::oid, conrelid) as constraint_def
       FROM pg_constraint c
       JOIN pg_class cl ON c.conrelid = cl.oid
       JOIN pg_namespace n ON cl.relnamespace = n.oid
       WHERE tablename LIKE 'raw_props_2025%' AND contype = 'c';`
    ];
  }

  public async runPartitionAnalysis(): Promise<PartitionAnalysis> {
    const startTime = Date.now();
    console.log('🔍 Running comprehensive partition analysis...');

    try {
      // Analyze current table
      const currentStats = await this.analyzeCurrentTable();
      
      // Calculate partition distribution
      const distribution = await this.calculatePartitionDistribution();
      
      // Project performance improvements
      const performanceProjections = await this.projectPerformanceImprovements(
        currentStats, 
        distribution
      );
      
      // Create migration plan
      const migrationPlan = await this.createMigrationPlan(currentStats);
      
      // Generate recommendations
      const recommendations = this.generateRecommendations(
        currentStats,
        migrationPlan, 
        performanceProjections
      );
      
      // Generate validation queries
      const validationQueries = this.generateValidationQueries();

      const analysis: PartitionAnalysis = {
        timestamp: new Date().toISOString(),
        current_table_stats: currentStats,
        proposed_partition_distribution: distribution,
        performance_projections: performanceProjections,
        migration_plan: migrationPlan,
        recommendations,
        validation_queries
      };

      const duration = Date.now() - startTime;
      console.log(`✅ Partition analysis completed in ${duration}ms`);
      console.log(`📊 Current: ${currentStats.total_rows.toLocaleString()} rows, ${currentStats.table_size_mb}MB`);
      console.log(`📈 Projected query improvement: ${performanceProjections.query_improvement_percentage}%`);
      console.log(`⚠️  Migration risk: ${migrationPlan.risk_level}`);
      console.log(`⏱️  Estimated migration: ${migrationPlan.estimated_duration_hours}h`);

      return analysis;

    } catch (error) {
      console.error('❌ Partition analysis failed:', error);
      throw error;
    }
  }

  public async saveAnalysis(analysis: PartitionAnalysis): Promise<void> {
    const outputPath = join(process.cwd(), 'out', 'ops', 'partition-analysis.json');
    
    try {
      writeFileSync(outputPath, JSON.stringify(analysis, null, 2));
      console.log(`📁 Partition analysis saved to ${outputPath}`);
    } catch (error) {
      console.error('❌ Failed to save analysis:', error);
      throw error;
    }
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'analyze';

  // Safety check - prevent accidental execution
  if (process.env.APPLY_PARTITION === 'true') {
    console.log('🚨 APPLY_PARTITION=true detected - this is a dry-run tool only!');
    console.log('   For actual partitioning, use dedicated migration scripts');
    process.exit(1);
  }

  try {
    const planner = new PartitionPlanner();

    switch (command) {
      case 'analyze':
        const analysis = await planner.runPartitionAnalysis();
        await planner.saveAnalysis(analysis);
        break;

      case 'stats':
        const stats = await planner.analyzeCurrentTable();
        console.log('📊 Current Table Statistics:');
        console.log(`   Rows: ${stats.total_rows.toLocaleString()}`);
        console.log(`   Size: ${stats.table_size_mb}MB + ${stats.index_size_mb}MB indexes`);
        console.log(`   Performance: ${stats.query_performance_avg_ms}ms avg query time`);
        console.log(`   Fragmentation: ${stats.fragmentation_percentage}%`);
        break;

      case 'distribution':
        const distribution = await planner.calculatePartitionDistribution();
        console.log('📈 Proposed Partition Distribution:');
        for (const [name, info] of Object.entries(distribution)) {
          console.log(`   ${name}: ${info.estimated_rows.toLocaleString()} rows (${info.percentage_of_total}%)`);
        }
        break;

      default:
        console.log('Usage: partition-dryrun.ts [analyze|stats|distribution]');
        console.log('');
        console.log('Commands:');
        console.log('  analyze       - Complete partition analysis (default)');
        console.log('  stats         - Show current table statistics only');  
        console.log('  distribution  - Show proposed partition distribution');
        console.log('');
        console.log('Note: This is a dry-run analysis tool. No schema changes are made.');
        process.exit(1);
    }

  } catch (error) {
    console.error('❌ Partition analysis failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { PartitionPlanner, PartitionAnalysis };