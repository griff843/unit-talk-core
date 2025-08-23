-- Safe patch: only adds columns if missing
alter table public.raw_props
  add column if not exists inserted_at timestamptz not null default now(),
  add column if not exists processed_at timestamptz;
