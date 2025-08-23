-- Canary seed script for E2E testing
-- Inserts a single safe test candidate into raw_props

-- Only insert if no recent canary exists (prevents duplicate seeding)
INSERT INTO raw_props (
    id,
    inserted_at, 
    processed_at, 
    data
)
SELECT 
    'canary-test-' || extract(epoch from now())::text || '-' || gen_random_uuid()::text,
    now() - interval '30 minutes', -- 30 minutes ago for freshness
    now() - interval '15 minutes', -- Processed 15 minutes ago
    jsonb_build_object(
        'source', 'official',
        'type', 'canary_test',
        'content', 'E2E canary test proposition for promotion workflow validation at ' || now()::text,
        'timestamp', (now() - interval '30 minutes')::text,
        'test_metadata', jsonb_build_object(
            'canary', true,
            'test_run', extract(epoch from now()),
            'quality_indicators', jsonb_build_array('official_source', 'complete_data', 'fresh_content')
        )
    )
WHERE NOT EXISTS (
    -- Only seed if no recent canary exists (last 5 minutes)
    SELECT 1 FROM raw_props 
    WHERE data->>'type' = 'canary_test' 
    AND inserted_at > now() - interval '5 minutes'
);

-- Verify the seed operation
SELECT 
    id,
    inserted_at,
    processed_at,
    data->>'type' as type,
    data->>'source' as source,
    (data->'test_metadata'->>'canary')::boolean as is_canary
FROM raw_props 
WHERE data->>'type' = 'canary_test'
ORDER BY inserted_at DESC 
LIMIT 1;