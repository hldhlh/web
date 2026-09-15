-- Install additively first. Import existing accounts privately, then activate.
-- No existing Storage objects, employee records, or application data are changed here.
begin;
create schema if not exists academy_private;
revoke all on schema academy_private from public, anon, authenticated;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists academy_private.accounts (
  id text primary key,
  name_key text not null unique,
  profile jsonb not null,
  password_hash text not null,
  legacy_salt text,
  updated_at timestamptz not null default now()
);
create table if not exists academy_private.sessions (
  user_id text primary key references academy_private.accounts(id),
  token text not null,
  device_hash text not null,
  version bigint not null default 1,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  revoked_at timestamptz,
  reason text
);
create table if not exists academy_private.login_events (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default clock_timestamp(),
  user_id text,
  account_name text not null default '',
  event text not null,
  reason text not null default '',
  device_fingerprint text not null default '',
  forwarded_for text not null default '',
  user_agent text not null default '',
  source text not null default 'server'
);
create index if not exists login_events_time_idx on academy_private.login_events (occurred_at desc, id desc);
create index if not exists login_events_account_idx on academy_private.login_events (account_name, occurred_at desc);
create index if not exists login_events_ip_idx on academy_private.login_events (forwarded_for, occurred_at desc);
create table if not exists academy_private.settings (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  import_fingerprint text
);
insert into academy_private.settings(id) values (true) on conflict do nothing;
alter table academy_private.accounts enable row level security;
alter table academy_private.sessions enable row level security;
alter table academy_private.login_events enable row level security;
alter table academy_private.settings enable row level security;
revoke all on all tables in schema academy_private from public, anon, authenticated;
revoke all on all sequences in schema academy_private from public, anon, authenticated;

create or replace function academy_private.name_key(value text) returns text
language sql immutable set search_path = '' as $$
  select lower(regexp_replace(trim(normalize(coalesce(value, ''), NFKC)), '\s+', ' ', 'g'));
$$;
create or replace function academy_private.fingerprint(value text) returns text
language sql immutable set search_path = '' as $$
  select encode(extensions.digest(coalesce(value, ''), 'sha256'), 'hex');
$$;
create or replace function academy_private.password_matches(a academy_private.accounts, password text) returns boolean
language plpgsql set search_path = '' as $$
begin
  if password is null or length(password) > 128 then return false; end if;
  if a.legacy_salt is not null then
    return a.password_hash = academy_private.fingerprint(a.legacy_salt || ':' || (a.profile->>'name') || ':' || password);
  end if;
  return a.password_hash = extensions.crypt(academy_private.fingerprint(password), a.password_hash);
end;
$$;
create or replace function academy_private.record_event(uid text, account text, kind text, cause text, device text)
returns void language plpgsql set search_path = '' as $$
declare h jsonb := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
begin
  insert into academy_private.login_events(user_id, account_name, event, reason, device_fingerprint, forwarded_for, user_agent)
  values(uid, left(coalesce(account,''),64), kind, cause, left(academy_private.fingerprint(device),16),
    left(coalesce(h->>'x-forwarded-for',''),256), left(coalesce(h->>'user-agent',''),512));
  -- Bounded retention; this never deletes current account/session records.
  delete from academy_private.login_events where occurred_at < now() - interval '90 days';
end;
$$;

-- Only the database owner can call this importer. It never accepts browser input.
-- Existing IDs, display names and permissions survive; credentials never enter public tables.
create or replace function academy_private.import_accounts(document jsonb) returns integer
language plpgsql set search_path = '' as $$
declare u jsonb; total integer := 0;
begin
  if (select enabled from academy_private.settings where id) then raise exception 'Import is disabled after activation'; end if;
  if jsonb_typeof(document->'users') is distinct from 'array' then raise exception 'Invalid account document'; end if;
  for u in select value from jsonb_array_elements(document->'users') loop
    if coalesce(u->>'id','') = '' or coalesce(u->>'name','') = '' or
       coalesce(u->>'pass','') !~ '^[a-f0-9]{64}$' or coalesce(u->>'salt','') = '' or
       coalesce(u->>'role','') not in ('manager','staff') then raise exception 'Invalid legacy account'; end if;
    insert into academy_private.accounts(id, name_key, profile, password_hash, legacy_salt)
    values(u->>'id', academy_private.name_key(u->>'name'), u - 'pass' - 'salt', u->>'pass', u->>'salt');
    total := total + 1;
  end loop;
  if not exists(select 1 from academy_private.accounts where profile->>'role'='manager' and profile->>'access'<>'blocked') then
    raise exception 'An active manager is required';
  end if;
  update academy_private.settings set import_fingerprint=academy_private.fingerprint(document::text) where id;
  return total;
end;
$$;

-- One narrow RPC boundary. Every privileged action revalidates a private session.
-- SECURITY DEFINER is necessary because API roles have no access to the private schema.
create or replace function public.academy_auth(p_action text, p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  a academy_private.accounts; s academy_private.sessions; target academy_private.accounts;
  name text := academy_private.name_key(p_data->>'name');
  password text := p_data->>'password'; new_password text := p_data->>'newPassword';
  device text := left(coalesce(p_data->>'deviceId',''),128);
  h jsonb := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  ip text; token text; rows jsonb; failure text; event_kind text; cursor_id bigint;
begin
  if p_action = 'health' then
    return jsonb_build_object('ok',true,'version',1,'enabled',(select enabled from academy_private.settings where id));
  end if;
  if not coalesce((select enabled from academy_private.settings where id),false) then
    return jsonb_build_object('ok',false,'code','AUTH_NOT_READY');
  end if;
  if octet_length(p_data::text) > 8192 then return jsonb_build_object('ok',false,'code','INVALID_REQUEST'); end if;

  if p_action in ('login','register','change_password') then
    if length(name) < 2 or length(name) > 16 or length(device) < 8 or length(coalesce(password,'')) < 1 or length(password) > 128 then
      return jsonb_build_object('ok',false,'code','INVALID_CREDENTIALS');
    end if;
    -- Serialize attempts for the same name, including simultaneous first registrations.
    perform pg_advisory_xact_lock(hashtextextended('academy-auth:' || name, 0));
    ip := left(coalesce(h->>'x-forwarded-for',''),256);
    if (select count(*) from academy_private.login_events where occurred_at > now()-interval '10 minutes'
        and account_name = name and event in ('login_failed','password_change_failed','register_failed')) >= 8 or
       (ip <> '' and (select count(*) from academy_private.login_events where occurred_at > now()-interval '10 minutes'
        and forwarded_for = ip and event in ('login_failed','password_change_failed','register_failed')) >= 40) then
      return jsonb_build_object('ok',false,'code','RATE_LIMITED');
    end if;
    select * into a from academy_private.accounts where name_key = name for update;
    event_kind := case p_action when 'change_password' then 'password_change_failed' when 'register' then 'register_failed' else 'login_failed' end;
    if p_action = 'register' then
      if a.id is not null then
        perform academy_private.record_event(a.id,name,event_kind,'account_exists',device);
        return jsonb_build_object('ok',false,'code','ACCOUNT_EXISTS');
      end if;
      if length(password) < 10 then return jsonb_build_object('ok',false,'code','WEAK_PASSWORD'); end if;
      insert into academy_private.accounts(id,name_key,profile,password_hash)
      values(gen_random_uuid()::text,name,jsonb_build_object('name',trim(normalize(p_data->>'name',NFKC)),
        'role','staff','access','basic','createdAt',clock_timestamp(),'shortcutAccess','{}'::jsonb),
        extensions.crypt(academy_private.fingerprint(password),extensions.gen_salt('bf',12))) returning * into a;
      update academy_private.accounts set profile = profile || jsonb_build_object('id',a.id) where id=a.id returning * into a;
    else
      if a.id is null or not academy_private.password_matches(a,password) then
        perform academy_private.record_event(a.id,name,event_kind,'invalid_credentials',device);
        return jsonb_build_object('ok',false,'code','INVALID_CREDENTIALS');
      end if;
      if a.profile->>'access' = 'blocked' then
        perform academy_private.record_event(a.id,name,event_kind,'account_blocked',device);
        return jsonb_build_object('ok',false,'code','ACCOUNT_BLOCKED');
      end if;
    end if;
    if p_action = 'change_password' then
      if coalesce(length(new_password),0) < 10 or length(new_password) > 128 then
        return jsonb_build_object('ok',false,'code','WEAK_PASSWORD');
      end if;
      if new_password = password then return jsonb_build_object('ok',false,'code','PASSWORD_UNCHANGED'); end if;
      update academy_private.accounts set password_hash=extensions.crypt(academy_private.fingerprint(new_password),extensions.gen_salt('bf',12)),
        legacy_salt=null,updated_at=clock_timestamp() where id=a.id;
      update academy_private.sessions set revoked_at=clock_timestamp(),reason='password_changed' where user_id=a.id and revoked_at is null;
      perform academy_private.record_event(a.id,name,'password_changed','all_sessions_revoked',device);
      return jsonb_build_object('ok',true);
    end if;
    if a.legacy_salt is not null then
      update academy_private.accounts set password_hash=extensions.crypt(academy_private.fingerprint(password),extensions.gen_salt('bf',12)),
        legacy_salt=null where id=a.id;
    end if;
    select * into s from academy_private.sessions where user_id=a.id;
    if s.token is not null and s.device_hash=academy_private.fingerprint(device) and s.revoked_at is null and s.expires_at>now() then
      token := s.token;
      update academy_private.sessions set version=version+1,expires_at=clock_timestamp()+interval '30 days' where user_id=a.id returning * into s;
    else
      token := encode(extensions.gen_random_bytes(32),'hex');
      if s.token is not null and s.revoked_at is null and s.expires_at>now() then
        perform academy_private.record_event(a.id,name,'session_replaced','new_device_login',device);
      end if;
      insert into academy_private.sessions as previous(user_id,token,device_hash) values(a.id,token,academy_private.fingerprint(device))
      on conflict(user_id) do update set token=excluded.token,device_hash=excluded.device_hash,
        version=previous.version+1,issued_at=clock_timestamp(),expires_at=clock_timestamp()+interval '30 days',revoked_at=null,reason=null
      returning * into s;
    end if;
    perform academy_private.record_event(a.id,name,case when p_action='register' then 'registered' else 'login_success' end,'',device);
    return jsonb_build_object('ok',true,'user',a.profile,'sessionToken',token,'sessionVersion',s.version::text);
  end if;

  -- Lock the account before its session for every mutation; old logout cannot erase a new login.
  select * into a from academy_private.accounts where id=p_data->>'userId' for update;
  select * into s from academy_private.sessions where user_id=a.id;
  if a.id is null or s.token is null or coalesce(p_data->>'sessionToken','') = '' then failure := 'SESSION_INVALID';
  elsif a.profile->>'access'='blocked' then failure := 'ACCOUNT_BLOCKED';
  elsif s.token <> p_data->>'sessionToken' then failure := 'SESSION_REPLACED';
  elsif s.revoked_at is not null then failure := case when s.reason='password_changed' then 'PASSWORD_CHANGED' else 'SESSION_ENDED' end;
  elsif s.expires_at <= now() then failure := 'SESSION_EXPIRED'; end if;
  if failure is not null then return jsonb_build_object('ok',false,'code',failure); end if;

  if p_action = 'verify' then return jsonb_build_object('ok',true,'user',a.profile,'sessionVersion',s.version::text); end if;
  if p_action = 'logout' then
    -- Same-browser logins share a token, but each explicit login advances its version.
    -- A logout sent before a later login must not revoke that newer login.
    if coalesce(p_data->>'sessionVersion','') <> s.version::text then
      return jsonb_build_object('ok',false,'code','STALE_LOGOUT');
    end if;
    update academy_private.sessions set revoked_at=clock_timestamp(),reason='logout' where user_id=a.id and token=s.token;
    perform academy_private.record_event(a.id,a.name_key,'logout','user_requested',device);
    return jsonb_build_object('ok',true);
  end if;
  if p_action = 'people' then
    select coalesce(jsonb_agg(profile order by name_key),'[]') into rows from academy_private.accounts;
    return jsonb_build_object('ok',true,'users',rows);
  end if;
  if a.profile->>'role' <> 'manager' then return jsonb_build_object('ok',false,'code','FORBIDDEN'); end if;
  if p_action = 'events' then
    if coalesce(p_data->>'before','') ~ '^[0-9]{1,18}$' then cursor_id := (p_data->>'before')::bigint; end if;
    select coalesce(jsonb_agg(to_jsonb(e) order by e.id::bigint desc),'[]') into rows from (
      select id::text, occurred_at, account_name, event, reason, device_fingerprint, forwarded_for, user_agent, source
      from academy_private.login_events
      where (cursor_id is null or id < cursor_id)
        and (coalesce(p_data->>'account','')='' or account_name=academy_private.name_key(p_data->>'account'))
        and (coalesce(p_data->>'event','')='' or event=p_data->>'event')
      order by id desc limit 50
    ) e;
    return jsonb_build_object('ok',true,'events',rows);
  end if;
  if p_action in ('access','shortcuts') then
    select * into target from academy_private.accounts where id=p_data->>'targetId' for update;
    if target.id is null then return jsonb_build_object('ok',false,'code','ACCOUNT_NOT_FOUND'); end if;
    if target.profile->>'role'='manager' then return jsonb_build_object('ok',false,'code','MANAGER_PROTECTED'); end if;
    if p_action='access' then
      if coalesce(p_data->>'access','') not in ('basic','full','blocked') then return jsonb_build_object('ok',false,'code','INVALID_REQUEST'); end if;
      update academy_private.accounts set profile=profile || jsonb_build_object('access',p_data->>'access',
        'approvedAt',case when p_data->>'access'='full' then to_jsonb(clock_timestamp()) else profile->'approvedAt' end,
        'approvedBy',case when p_data->>'access'='full' then a.profile->'name' else profile->'approvedBy' end),updated_at=clock_timestamp()
        where id=target.id returning * into target;
      if p_data->>'access'='blocked' then update academy_private.sessions set revoked_at=clock_timestamp(),reason='blocked' where user_id=target.id; end if;
    else
      if jsonb_typeof(p_data->'permissions') is distinct from 'object' or exists(
        select 1 from unnest(array['notes','jlhcdh','schedule','feedback','dimensions','meat-template']) k
        where jsonb_typeof(p_data->'permissions'->k) is distinct from 'boolean') then
        return jsonb_build_object('ok',false,'code','INVALID_REQUEST');
      end if;
      update academy_private.accounts set profile=profile || jsonb_build_object('shortcutAccess',p_data->'permissions',
        'hideRestrictedShortcuts',coalesce((p_data->>'hideRestricted')::boolean,true)),updated_at=clock_timestamp()
        where id=target.id returning * into target;
    end if;
    perform academy_private.record_event(a.id,a.name_key,'permissions_changed',p_action,device);
    return jsonb_build_object('ok',true,'user',target.profile);
  end if;
  return jsonb_build_object('ok',false,'code','INVALID_REQUEST');
end;
$$;
revoke all on all functions in schema academy_private from public, anon, authenticated;
revoke all on function public.academy_auth(text,jsonb) from public, anon, authenticated;
grant execute on function public.academy_auth(text,jsonb) to anon, authenticated;
notify pgrst, 'reload schema';
commit;
