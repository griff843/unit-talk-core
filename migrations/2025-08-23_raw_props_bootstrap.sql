-- Raw Props Bootstrap Migration
-- Ensures raw_props table has all expected columns with proper types and defaults
-- This migration is idempotent and safe to run multiple times

-- Create table if missing (minimal shape used by seed + metrics)
CREATE TABLE IF NOT EXISTS public.raw_props (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inserted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  data JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Add missing columns idempotently
-- Note: We use IF NOT EXISTS for new columns to prevent errors
DO $$ 
BEGIN
  -- Add type column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'raw_props' 
    AND column_name = 'type'
  ) THEN
    ALTER TABLE public.raw_props ADD COLUMN type TEXT;
  END IF;

  -- Add source column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'raw_props' 
    AND column_name = 'source'
  ) THEN
    ALTER TABLE public.raw_props ADD COLUMN source TEXT;
  END IF;

  -- Add is_canary column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'raw_props' 
    AND column_name = 'is_canary'
  ) THEN
    ALTER TABLE public.raw_props ADD COLUMN is_canary BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

-- Ensure data column exists and has proper type
-- Handle the case where it might be named 'payload' in some versions
DO $$
BEGIN
  -- If we have 'payload' but not 'data', rename it
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'raw_props' 
    AND column_name = 'payload'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'raw_props' 
    AND column_name = 'data'
  ) THEN
    ALTER TABLE public.raw_props RENAME COLUMN payload TO data;
  END IF;

  -- Ensure data column exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'raw_props' 
    AND column_name = 'data'
  ) THEN
    ALTER TABLE public.raw_props ADD COLUMN data JSONB NOT NULL DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- Create helpful indexes (idempotent)
CREATE INDEX IF NOT EXISTS idx_raw_props_inserted_at 
  ON public.raw_props(inserted_at);

CREATE INDEX IF NOT EXISTS idx_raw_props_processed_at 
  ON public.raw_props(processed_at) 
  WHERE processed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_raw_props_is_canary 
  ON public.raw_props(is_canary) 
  WHERE is_canary = true;

CREATE INDEX IF NOT EXISTS idx_raw_props_type 
  ON public.raw_props(type) 
  WHERE type IS NOT NULL;

-- Also ensure unified_picks has the right column name
DO $$
BEGIN
  -- If we have 'payload' but not 'data' in unified_picks, rename it
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'unified_picks' 
    AND column_name = 'payload'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'unified_picks' 
    AND column_name = 'data'
  ) THEN
    ALTER TABLE public.unified_picks RENAME COLUMN payload TO data;
  END IF;

  -- Ensure data column exists in unified_picks
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'unified_picks' 
    AND column_name = 'data'
  ) THEN
    ALTER TABLE public.unified_picks ADD COLUMN data JSONB NOT NULL DEFAULT '{}'::jsonb;
  END IF;
END $$;