-- Atomic folder operations. Invoker permissions retain existing table/RLS boundaries.
create or replace function public.dimension_folder_action(
  folder_id text, operation text default 'inspect', target_id text default '',
  expected_token text default '', actor jsonb default '{}'::jsonb
) returns jsonb language plpgsql security invoker set search_path = public
as $$
declare
  source public.academy_progress%rowtype;
  ids text[]; project_ids text[]; fingerprint text; result jsonb;
  parent text; target text := coalesce(target_id, '');
begin
  if operation not in ('inspect','move','delete_keep','delete_all') or folder_id is null or folder_id = '' then
    raise exception '无效的文件夹操作';
  end if;
  -- Short, bounded transaction excludes concurrent inserts and CAS writes while
  -- checking the tree and mutating it; no network calls occur while holding it.
  lock table public.academy_progress in share row exclusive mode;
  select * into source from public.academy_progress where user_id = 'doc:dimension-folder:' || folder_id;
  if not found then raise exception '文件夹已不存在，请刷新'; end if;
  parent := coalesce(source.payload->'meta'->>'parentId','');
  with recursive subtree(id) as (
    select folder_id
    union
    select a.payload->'meta'->>'id' from public.academy_progress a join subtree s
      on a.payload->'meta'->>'parentId' = s.id
      where a.user_id like 'doc:dimension-folder:%'
  ) select array_agg(id order by id) into ids from subtree;
  select coalesce(array_agg(user_id order by user_id),array[]::text[]) into project_ids
    from public.academy_progress where user_id like 'doc:dimensions:%' and payload->'meta'->>'folderId' = any(ids);
  select md5(coalesce(string_agg(user_id || ':' || ts::text, ',' order by user_id),'')) into fingerprint
    from public.academy_progress where user_id = any(project_ids)
    or (user_id like 'doc:dimension-folder:%' and payload->'meta'->>'id' = any(ids));
  result := jsonb_build_object('token',fingerprint,'name',source.payload->'meta'->>'name',
    'folders',cardinality(ids)-1,'projects',cardinality(project_ids),'parentId',parent);
  if operation = 'inspect' then return result; end if;
  if expected_token is distinct from fingerprint then raise exception '目录内容已变化，请重新确认'; end if;
  if operation = 'move' then
    if target = any(ids) then raise exception '不能移入自身或子目录'; end if;
    if target <> '' and not exists(select 1 from public.academy_progress where user_id='doc:dimension-folder:'||target) then
      raise exception '目标目录已不存在';
    end if;
    if exists(select 1 from public.academy_progress where user_id like 'doc:dimension-folder:%'
      and user_id <> source.user_id and coalesce(payload->'meta'->>'parentId','')=target
      and payload->'meta'->>'name'=source.payload->'meta'->>'name') then raise exception '目标目录已有同名文件夹'; end if;
    update public.academy_progress set payload=jsonb_set(payload,'{meta}',(payload->'meta')||jsonb_build_object(
      'parentId',target,'updatedAt',now(),'updatedBy',actor)), ts=greatest(ts+1,(extract(epoch from clock_timestamp())*1000)::bigint),updated_at=now()
      where user_id=source.user_id;
  else
    if operation = 'delete_keep' then
      update public.academy_progress set payload=jsonb_set(payload,'{meta}',(payload->'meta')||jsonb_build_object(
        'folderId',parent,'updatedAt',now(),'updatedBy',actor)),ts=greatest(ts+1,(extract(epoch from clock_timestamp())*1000)::bigint),updated_at=now()
        where user_id=any(project_ids);
    else
      delete from public.academy_progress where user_id=any(project_ids);
    end if;
    delete from public.academy_progress where user_id like 'doc:dimension-folder:%' and payload->'meta'->>'id'=any(ids);
  end if;
  return result || jsonb_build_object('done',true);
end $$;
revoke all on function public.dimension_folder_action(text,text,text,text,jsonb) from public;
grant execute on function public.dimension_folder_action(text,text,text,text,jsonb) to anon, authenticated;

-- Stale clients must not upload/move projects into a directory removed meanwhile.
create or replace function public.dimension_parent_guard() returns trigger
language plpgsql security invoker set search_path = public as $$
declare parent text;
begin
  if new.user_id like 'doc:dimension-folder:%' then parent := new.payload->'meta'->>'parentId';
  elsif new.user_id like 'doc:dimensions:%' then parent := new.payload->'meta'->>'folderId';
  else return new;
  end if;
  if coalesce(parent,'') <> '' and not exists(select 1 from public.academy_progress where user_id='doc:dimension-folder:'||parent) then
    raise exception '目标目录已不存在，请返回资料库重新选择';
  end if;
  return new;
end $$;
drop trigger if exists dimension_parent_guard on public.academy_progress;
create trigger dimension_parent_guard before insert or update on public.academy_progress
for each row execute function public.dimension_parent_guard();
notify pgrst, 'reload schema';
