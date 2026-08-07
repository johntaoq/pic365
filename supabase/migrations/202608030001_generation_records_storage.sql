create table if not exists public.generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reservation_id uuid references public.generation_reservations(id) on delete set null,
  case_id integer,
  prompt text not null,
  model text not null,
  size text not null default '1024x1024',
  quality text not null default 'low',
  provider text not null default 'unikeyx',
  provider_request_id text,
  status text not null default 'processing' check (status in ('processing', 'succeeded', 'failed')),
  storage_path text,
  output_url text,
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists generations_user_id_idx
  on public.generations (user_id, created_at desc);

create index if not exists generations_status_idx
  on public.generations (status, created_at desc);

alter table public.generations enable row level security;

drop policy if exists "Users can read own generations" on public.generations;
create policy "Users can read own generations"
  on public.generations for select
  using ((select auth.uid()) = user_id);

revoke all on public.generations from anon, authenticated;
grant select on public.generations to authenticated;
