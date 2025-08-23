-- Idempotent hygiene + retention pack
BEGIN;

-- Ensure RLS on unified_picks
ALTER TABLE IF EXISTS public.unified_picks ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_raw_props_inserted_at ON public.raw_props(inserted_at);
CREATE INDEX IF NOT EXISTS idx_raw_props_processed_at ON public.raw_props(processed_at);
CREATE INDEX IF NOT EXISTS idx_unified_picks_promoted_at ON public.unified_picks(promoted_at);
CREATE INDEX IF NOT EXISTS idx_unified_picks_raw_id ON public.unified_picks(raw_id);

-- Optional unique constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_unified_picks_raw_id' AND conrelid = 'public.unified_picks'::regclass
  ) THEN
    ALTER TABLE public.unified_picks ADD CONSTRAINT uq_unified_picks_raw_id UNIQUE (raw_id);
  END IF;
END$$;

-- Retention: archive raw_props older than 21 days
CREATE TABLE IF NOT EXISTS public.historical_raw_props (LIKE public.raw_props INCLUDING ALL);

CREATE OR REPLACE FUNCTION public.archive_old_raw_props(retention_days integer DEFAULT 21)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.historical_raw_props
  SELECT * FROM public.raw_props WHERE inserted_at < now() - (retention_days || ' days')::interval
  ON CONFLICT DO NOTHING;
  DELETE FROM public.raw_props WHERE inserted_at < now() - (retention_days || ' days')::interval;
END$$;

COMMIT;

