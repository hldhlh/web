-- 今岭学堂：每人一行学习记录，Realtime 全端共享。
create table if not exists public.academy_progress (
  user_id text primary key,
  payload jsonb not null default '{}'::jsonb,
  ts bigint not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists academy_progress_updated_at_idx
  on public.academy_progress (updated_at desc);

alter table public.academy_progress replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'academy_progress'
  ) then
    execute 'alter publication supabase_realtime add table public.academy_progress';
  end if;
end $$;

alter table public.academy_progress enable row level security;

drop policy if exists academy_progress_all on public.academy_progress;
create policy academy_progress_all on public.academy_progress
  for all using (true) with check (true);

grant select, insert, update, delete on public.academy_progress to anon, authenticated;
