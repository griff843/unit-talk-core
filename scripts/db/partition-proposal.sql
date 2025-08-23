-- Partition Proposal for 1M+ raw_props
-- Monthly partitioning strategy for scalable data management
-- SAFETY: This file contains ONLY proposal SQL - no execution without explicit flags

-- =============================================================================
-- PARTITION STRATEGY: Monthly partitions with retention policy
-- =============================================================================

-- 1. CREATE PARTITIONED TABLE (NEW SCHEMA)
-- This would replace the current raw_props table with a partitioned version

/*
CREATE TABLE raw_props_partitioned (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inserted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE,
    payload JSONB NOT NULL,
    
    -- Partition key: inserted_at (monthly partitions)
    CONSTRAINT raw_props_partitioned_pkey PRIMARY KEY (id, inserted_at)
) PARTITION BY RANGE (inserted_at);
*/

-- 2. CREATE MONTHLY PARTITIONS (EXAMPLE FOR 2025)
-- Each partition holds one month of data

/*
-- January 2025
CREATE TABLE raw_props_2025_01 PARTITION OF raw_props_partitioned
FOR VALUES FROM ('2025-01-01'::timestamp) TO ('2025-02-01'::timestamp);

-- February 2025  
CREATE TABLE raw_props_2025_02 PARTITION OF raw_props_partitioned
FOR VALUES FROM ('2025-02-01'::timestamp) TO ('2025-03-01'::timestamp);

-- March 2025
CREATE TABLE raw_props_2025_03 PARTITION OF raw_props_partitioned
FOR VALUES FROM ('2025-03-01'::timestamp) TO ('2025-04-01'::timestamp);

-- April 2025
CREATE TABLE raw_props_2025_04 PARTITION OF raw_props_partitioned
FOR VALUES FROM ('2025-04-01'::timestamp) TO ('2025-05-01'::timestamp);

-- May 2025
CREATE TABLE raw_props_2025_05 PARTITION OF raw_props_partitioned
FOR VALUES FROM ('2025-05-01'::timestamp) TO ('2025-06-01'::timestamp);

-- June 2025
CREATE TABLE raw_props_2025_06 PARTITION OF raw_props_partitioned
FOR VALUES FROM ('2025-06-01'::timestamp) TO ('2025-07-01'::timestamp);

-- July 2025
CREATE TABLE raw_props_2025_07 PARTITION OF raw_props_partitioned
FOR VALUES FROM ('2025-07-01'::timestamp) TO ('2025-08-01'::timestamp);

-- August 2025
CREATE TABLE raw_props_2025_08 PARTITION OF raw_props_partitioned
FOR VALUES FROM ('2025-08-01'::timestamp) TO ('2025-09-01'::timestamp);

-- September 2025
CREATE TABLE raw_props_2025_09 PARTITION OF raw_props_partitioned
FOR VALUES FROM ('2025-09-01'::timestamp) TO ('2025-10-01'::timestamp);

-- October 2025
CREATE TABLE raw_props_2025_10 PARTITION OF raw_props_partitioned
FOR VALUES FROM ('2025-10-01'::timestamp) TO ('2025-11-01'::timestamp);

-- November 2025
CREATE TABLE raw_props_2025_11 PARTITION OF raw_props_partitioned
FOR VALUES FROM ('2025-11-01'::timestamp) TO ('2025-12-01'::timestamp);

-- December 2025
CREATE TABLE raw_props_2025_12 PARTITION OF raw_props_partitioned
FOR VALUES FROM ('2025-12-01'::timestamp) TO ('2026-01-01'::timestamp);
*/

-- 3. INDEXES FOR OPTIMAL PERFORMANCE
-- Each partition gets optimized indexes

/*
-- Index for processed_at queries (critical for promoter workflow)
CREATE INDEX CONCURRENTLY idx_raw_props_2025_01_processed_at 
ON raw_props_2025_01 (processed_at) WHERE processed_at IS NOT NULL;

CREATE INDEX CONCURRENTLY idx_raw_props_2025_01_unprocessed 
ON raw_props_2025_01 (inserted_at) WHERE processed_at IS NULL;

-- JSONB payload indexes for league/book queries
CREATE INDEX CONCURRENTLY idx_raw_props_2025_01_payload_league 
ON raw_props_2025_01 USING GIN ((payload->>'league'));

CREATE INDEX CONCURRENTLY idx_raw_props_2025_01_payload_book 
ON raw_props_2025_01 USING GIN ((payload->>'book'));

-- Composite index for exposure calculations
CREATE INDEX CONCURRENTLY idx_raw_props_2025_01_exposure 
ON raw_props_2025_01 ((payload->>'league'), (payload->>'book'), processed_at);

-- Repeat similar indexes for each month's partition...
*/

-- 4. ARCHIVE TABLE FOR OLD DATA
-- Long-term storage for historical data

/*
CREATE TABLE raw_props_archive (
    id UUID,
    inserted_at TIMESTAMP WITH TIME ZONE,
    processed_at TIMESTAMP WITH TIME ZONE,
    payload JSONB,
    archived_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    partition_source TEXT NOT NULL, -- Which partition this came from
    
    PRIMARY KEY (id, archived_at)
) PARTITION BY RANGE (archived_at);

-- Yearly archive partitions
CREATE TABLE raw_props_archive_2025 PARTITION OF raw_props_archive
FOR VALUES FROM ('2025-01-01'::timestamp) TO ('2026-01-01'::timestamp);

CREATE TABLE raw_props_archive_2026 PARTITION OF raw_props_archive
FOR VALUES FROM ('2026-01-01'::timestamp) TO ('2027-01-01'::timestamp);
*/

-- 5. MIGRATION STRATEGY (ZERO-DOWNTIME)
-- Step-by-step migration from current table to partitioned

/*
-- Step 1: Create partitioned table alongside existing
-- Step 2: Set up logical replication or triggers to sync data
-- Step 3: Migrate application to use new table
-- Step 4: Verify data integrity
-- Step 5: Drop old table and rename partitioned table

-- Example migration trigger (PROPOSAL ONLY):
CREATE OR REPLACE FUNCTION sync_to_partitioned()
RETURNS TRIGGER AS $$
BEGIN
    -- Insert new records into partitioned table
    IF TG_OP = 'INSERT' THEN
        INSERT INTO raw_props_partitioned (id, inserted_at, processed_at, payload)
        VALUES (NEW.id, NEW.inserted_at, NEW.processed_at, NEW.payload);
        RETURN NEW;
    END IF;
    
    -- Update records in partitioned table
    IF TG_OP = 'UPDATE' THEN
        UPDATE raw_props_partitioned 
        SET processed_at = NEW.processed_at, payload = NEW.payload
        WHERE id = NEW.id AND inserted_at = NEW.inserted_at;
        RETURN NEW;
    END IF;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to existing table during migration
CREATE TRIGGER raw_props_sync_trigger
    AFTER INSERT OR UPDATE ON raw_props
    FOR EACH ROW EXECUTE FUNCTION sync_to_partitioned();
*/

-- 6. AUTOMATED PARTITION MANAGEMENT
-- Functions to create/drop partitions automatically

/*
CREATE OR REPLACE FUNCTION create_monthly_partition(
    table_name TEXT,
    start_date DATE
) RETURNS TEXT AS $$
DECLARE
    partition_name TEXT;
    start_ts TIMESTAMP;
    end_ts TIMESTAMP;
BEGIN
    partition_name := table_name || '_' || to_char(start_date, 'YYYY_MM');
    start_ts := start_date::timestamp;
    end_ts := (start_date + INTERVAL '1 month')::timestamp;
    
    EXECUTE format(
        'CREATE TABLE IF NOT EXISTS %I PARTITION OF %I 
         FOR VALUES FROM (%L) TO (%L)',
        partition_name, table_name, start_ts, end_ts
    );
    
    -- Create indexes on new partition
    EXECUTE format(
        'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_%s_processed_at 
         ON %I (processed_at) WHERE processed_at IS NOT NULL',
        partition_name, partition_name
    );
    
    EXECUTE format(
        'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_%s_payload_league 
         ON %I USING GIN ((payload->>''league''))',
        partition_name, partition_name
    );
    
    RETURN partition_name;
END;
$$ LANGUAGE plpgsql;

-- Function to archive old partitions
CREATE OR REPLACE FUNCTION archive_partition(
    partition_name TEXT,
    archive_table TEXT DEFAULT 'raw_props_archive'
) RETURNS BIGINT AS $$
DECLARE
    rows_archived BIGINT;
BEGIN
    -- Move data to archive table
    EXECUTE format(
        'WITH archived AS (
            INSERT INTO %I (id, inserted_at, processed_at, payload, partition_source)
            SELECT id, inserted_at, processed_at, payload, %L
            FROM %I
            RETURNING 1
         )
         SELECT count(*) FROM archived',
        archive_table, partition_name, partition_name
    ) INTO rows_archived;
    
    -- Drop the partition after archiving
    EXECUTE format('DROP TABLE %I', partition_name);
    
    RETURN rows_archived;
END;
$$ LANGUAGE plpgsql;
*/

-- 7. PERFORMANCE BENEFITS ESTIMATION
-- Expected improvements from partitioning

/*
PERFORMANCE ANALYSIS:

Current single table with 1M+ rows:
- Full table scan: ~500ms-2s depending on query
- Index scan: ~50-200ms depending on selectivity
- Vacuum/maintenance: Increasingly slow, affects all data

With monthly partitions (avg 85K rows/partition):
- Partition elimination: Only scan relevant month(s)
- Query performance: 60-80% faster for time-based queries
- Maintenance: Vacuum/reindex per partition (parallel possible)
- Archive operations: Drop entire partitions instantly

DISK SPACE MANAGEMENT:
- Current: Single large table, difficult to manage
- Partitioned: Drop old partitions = instant space reclaim
- Archive: Compress old data in archive partitions
- Backup: Backup individual partitions, parallel operations

OPERATIONAL BENEFITS:
- Rolling maintenance: Work on one partition at a time
- Targeted operations: Replay/repair specific time windows
- Monitoring: Per-partition metrics and health checks
- Scaling: Add partitions as needed, no schema changes
*/

-- 8. ROLLBACK STRATEGY
-- How to revert partitioning if needed

/*
ROLLBACK PROCEDURE (PROPOSAL):

1. Stop application writes
2. Create single table with same schema
3. Copy all data from partitioned table:
   INSERT INTO raw_props_single 
   SELECT id, inserted_at, processed_at, payload 
   FROM raw_props_partitioned;
4. Verify data integrity
5. Switch application to single table
6. Drop partitioned table after verification period

ROLLBACK SAFETY:
- Keep original table as backup during migration
- Test rollback procedure in staging environment
- Have monitoring to detect performance issues
- Gradual rollout with feature flags
*/

-- =============================================================================
-- IMPLEMENTATION CHECKLIST
-- =============================================================================

/*
PREREQUISITES:
[ ] PostgreSQL 10+ (native partitioning support)
[ ] Sufficient disk space for migration (2x current data)
[ ] Maintenance window for schema changes
[ ] Application code review for partition awareness
[ ] Backup of current data
[ ] Testing environment with production-like data volume

MIGRATION PHASES:
[ ] Phase 1: Create partitioned table structure
[ ] Phase 2: Set up data synchronization
[ ] Phase 3: Migrate application queries gradually
[ ] Phase 4: Switch primary traffic to partitioned table
[ ] Phase 5: Verify performance and data integrity
[ ] Phase 6: Clean up old table and migration artifacts

VALIDATION STEPS:
[ ] Row count verification between old and new tables
[ ] Query performance benchmarking
[ ] Application functionality testing
[ ] Backup/restore testing with partitioned data
[ ] Monitoring and alerting updates
[ ] Documentation updates for operations team

SAFETY GATES:
[ ] APPLY_PARTITION=true environment variable required
[ ] Manual approval for each migration phase
[ ] Rollback procedure tested and documented
[ ] Performance monitoring during migration
[ ] Immediate rollback triggers defined
*/

-- =============================================================================
-- THIS IS A PROPOSAL ONLY
-- EXECUTION REQUIRES: APPLY_PARTITION=true AND MANUAL APPROVAL
-- =============================================================================