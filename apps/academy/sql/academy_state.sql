-- Auto Office：单行共享状态，Realtime 推全端。
create table if not exists public.academy_state (
  id text primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.academy_state replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'academy_state'
  ) then
    execute 'alter publication supabase_realtime add table public.academy_state';
  end if;
end $$;

alter table public.academy_state enable row level security;

drop policy if exists academy_state_all on public.academy_state;
create policy academy_state_all on public.academy_state
  for all using (true) with check (true);

grant select, insert, update, delete on public.academy_state to anon, authenticated;

insert into public.academy_state (id, payload)
values ('shared', '{}'::jsonb)
on conflict (id) do nothing;
