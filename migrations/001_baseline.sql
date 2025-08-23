-- Baseline migration: Enable RLS and create baseline tables with policies and indexes

-- Create raw_props table
CREATE TABLE IF NOT EXISTS raw_props (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    inserted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    processed_at TIMESTAMP WITH TIME ZONE,
    data JSONB NOT NULL
);

-- Create unified_picks table
CREATE TABLE IF NOT EXISTS unified_picks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    raw_id UUID NOT NULL REFERENCES raw_props(id) ON DELETE CASCADE,
    promoted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    data JSONB NOT NULL
);

-- Enable Row Level Security on unified_picks
ALTER TABLE unified_picks ENABLE ROW LEVEL SECURITY;

-- Create policy for unified_picks with CHECK constraint
-- Only allows inserts when current_setting('request.jwt.claims', true)::jsonb->>'app.role' = 'promoter'
CREATE POLICY unified_picks_promoter_policy ON unified_picks
    FOR ALL
    USING (true)
    WITH CHECK (
        current_setting('request.jwt.claims', true)::jsonb->>'app.role' = 'promoter'
    );

-- Create function for the BEFORE trigger that blocks writes unless app.role=promoter
CREATE OR REPLACE FUNCTION enforce_promoter_role()
RETURNS TRIGGER AS $$
BEGIN
    IF current_setting('app.role', true) != 'promoter' THEN
        RAISE EXCEPTION 'Access denied: app.role must be set to promoter for write operations'
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create BEFORE trigger on unified_picks to enforce promoter role
CREATE TRIGGER unified_picks_promoter_trigger
    BEFORE INSERT OR UPDATE OR DELETE ON unified_picks
    FOR EACH ROW
    EXECUTE FUNCTION enforce_promoter_role();

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_raw_props_inserted_at 
    ON raw_props(inserted_at);

CREATE INDEX IF NOT EXISTS idx_raw_props_processed_at 
    ON raw_props(processed_at) 
    WHERE processed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_unified_picks_promoted_at 
    ON unified_picks(promoted_at);

CREATE INDEX IF NOT EXISTS idx_unified_picks_raw_id 
    ON unified_picks(raw_id);

-- Create helper function to set app.role (for use with Supabase RPC)
CREATE OR REPLACE FUNCTION set_config(setting_name TEXT, setting_value TEXT, is_local BOOLEAN DEFAULT FALSE)
RETURNS TEXT AS $$
BEGIN
    PERFORM set_config(setting_name, setting_value, is_local);
    RETURN setting_value;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON raw_props TO anon, authenticated;
GRANT ALL ON unified_picks TO anon, authenticated;
GRANT EXECUTE ON FUNCTION set_config TO anon, authenticated;

-- Insert test data (optional - for validation)
INSERT INTO raw_props (data) VALUES 
    ('{"source": "test", "type": "baseline_test"}')
ON CONFLICT DO NOTHING;