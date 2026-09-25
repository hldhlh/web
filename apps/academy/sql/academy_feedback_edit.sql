-- Apply after academy_auth.sql and academy_progress.sql.
-- Protect existing feedback rows even when clients bypass the UI/REST adapter.
create or replace function academy_private.guard_feedback_edit()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public, academy_private as $$
declare
  headers jsonb := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  verified jsonb;
  before_value jsonb;
  after_value jsonb;
  actor text;
begin
  if old.user_id not like 'doc:academy/daily-feedback.json:%' then
    if tg_op = 'UPDATE' and new.user_id like 'doc:academy/daily-feedback.json:%' then
      raise exception '不能将其他记录改为反馈';
    end if;
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'DELETE' then raise exception '请使用反馈删除标记'; end if;
  verified := public.academy_auth('verify', jsonb_build_object(
    'userId', headers->>'x-academy-user-id',
    'sessionToken', headers->>'x-academy-session-token'));
  if coalesce((verified->>'ok')::boolean, false) = false then raise exception '登录状态已失效'; end if;
  actor := verified->'user'->>'id';
  before_value := old.payload->'value';
  after_value := new.payload->'value';
  -- Deletions retain a null tombstone so stale devices cannot restore the row.
  if before_value is null or before_value = 'null'::jsonb then
    raise exception '已删除的反馈不能恢复或修改';
  end if;
  if after_value = 'null'::jsonb and new.user_id = old.user_id then
    if (before_value->'createdBy'->>'id') is distinct from actor or
       (to_timestamp((before_value->>'createdAt')::numeric / 1000) at time zone 'Asia/Shanghai')::date
         is distinct from (clock_timestamp() at time zone 'Asia/Shanghai')::date then
      raise exception '仅可删除本人当天提交的反馈';
    end if;
    return new;
  end if;
  if new.user_id <> old.user_id or after_value is null or
     (before_value - array['title','detail','category','status','updatedAt','updatedBy']) is distinct from
     (after_value - array['title','detail','category','status','updatedAt','updatedBy']) then
    raise exception '不能修改反馈归属或提交时间';
  end if;
  if (before_value - array['status','updatedAt','updatedBy']) is distinct from
     (after_value - array['status','updatedAt','updatedBy']) then
    if (before_value->'createdBy'->>'id') is distinct from actor or
       (to_timestamp((before_value->>'createdAt')::numeric / 1000) at time zone 'Asia/Shanghai')::date
         is distinct from (clock_timestamp() at time zone 'Asia/Shanghai')::date then
      raise exception '仅可编辑本人当天提交的反馈';
    end if;
    if coalesce(length(trim(after_value->>'title')),0) not between 1 and 40 or
       coalesce(length(trim(after_value->>'detail')),0) not between 1 and 500 or
       coalesce(after_value->>'category','') not in ('service','product','environment','equipment','wish','other') then
      raise exception '反馈内容无效';
    end if;
  end if;
  if (before_value->'status') is distinct from (after_value->'status') and
     (coalesce(verified->'user'->>'role','') <> 'manager' or
      coalesce(after_value->>'status','') not in ('open','processing','resolved')) then
    raise exception '只有店长可以修改处理状态';
  end if;
  new.payload := jsonb_set(new.payload, '{value,updatedBy}', to_jsonb(actor));
  new.payload := jsonb_set(new.payload, '{value,updatedAt}', to_jsonb(floor(extract(epoch from clock_timestamp()) * 1000)::bigint));
  return new;
end $$;
revoke all on function academy_private.guard_feedback_edit() from public;
drop trigger if exists academy_feedback_edit_guard on public.academy_progress;
create trigger academy_feedback_edit_guard before update or delete on public.academy_progress
for each row execute function academy_private.guard_feedback_edit();
