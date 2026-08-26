-- FARABI IT CENTER — secure admin session layer
-- Keeps RPC credential authentication, but never stores a plaintext password here.
-- Session lifetime: 8 hours maximum, 30 minutes idle timeout.

create extension if not exists pgcrypto;

create table if not exists public.demo_admin_credentials (
  email text primary key,
  password_hash text not null,
  created_at timestamptz not null default now()
);

alter table public.demo_admin_credentials enable row level security;
revoke all on public.demo_admin_credentials from anon, authenticated;

create or replace function public.demo_admin_login(p_email text, p_password text)
returns boolean
language sql
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1 from public.demo_admin_credentials
    where lower(email) = lower(trim(p_email))
      and password_hash = crypt(p_password, password_hash)
  );
$$;

revoke all on function public.demo_admin_login(text,text) from public, anon, authenticated;

create table if not exists public.demo_admin_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  email text not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists demo_admin_sessions_token_hash_idx on public.demo_admin_sessions(token_hash);
create index if not exists demo_admin_sessions_expires_at_idx on public.demo_admin_sessions(expires_at);

alter table public.demo_admin_sessions enable row level security;
revoke all on public.demo_admin_sessions from anon, authenticated;

create or replace function public.demo_admin_create_session(p_email text, p_password text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_token text;
begin
  if not public.demo_admin_login(p_email, p_password) then
    raise exception 'Invalid admin credentials';
  end if;

  v_token := encode(gen_random_bytes(32), 'hex');

  delete from public.demo_admin_sessions
  where lower(email) = lower(trim(p_email));

  insert into public.demo_admin_sessions(token_hash,email,expires_at)
  values (encode(digest(v_token,'sha256'),'hex'), lower(trim(p_email)), now() + interval '8 hours');

  return v_token;
end;
$$;

create or replace function public.demo_admin_validate_session(p_token text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_email text;
begin
  if p_token is null or length(p_token) < 32 then
    raise exception 'Invalid or expired session';
  end if;

  select email into v_email
  from public.demo_admin_sessions
  where token_hash = encode(digest(p_token,'sha256'),'hex')
    and expires_at > now()
    and last_seen_at > now() - interval '30 minutes'
  for update;

  if v_email is null then
    raise exception 'Session expired. Please sign in again.';
  end if;

  update public.demo_admin_sessions
  set last_seen_at = now()
  where token_hash = encode(digest(p_token,'sha256'),'hex');

  return v_email;
end;
$$;

create or replace function public.demo_admin_get_applications_session(p_token text)
returns setof public.applications
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform public.demo_admin_validate_session(p_token);
  return query select * from public.applications order by created_at desc;
end;
$$;

create or replace function public.demo_admin_update_status_session(p_token text, p_id uuid, p_status text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform public.demo_admin_validate_session(p_token);
  if p_status not in ('pending','approved','rejected') then raise exception 'Invalid status'; end if;
  update public.applications set status = p_status where id = p_id;
  return found;
end;
$$;

create or replace function public.demo_admin_logout_session(p_token text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_deleted integer;
begin
  delete from public.demo_admin_sessions where token_hash = encode(digest(p_token,'sha256'),'hex');
  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

create or replace function public.demo_admin_cleanup_sessions()
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_deleted integer;
begin
  delete from public.demo_admin_sessions
  where expires_at <= now() or last_seen_at <= now() - interval '30 minutes';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.demo_admin_create_session(text) from public, authenticated;
revoke all on function public.demo_admin_validate_session(text) from public, anon, authenticated;
revoke all on function public.demo_admin_get_applications_session(text) from public, authenticated;
revoke all on function public.demo_admin_update_status_session(text,uuid,text) from public, authenticated;
revoke all on function public.demo_admin_logout_session(text) from public, authenticated;
revoke all on function public.demo_admin_cleanup_sessions() from public, anon, authenticated;

grant execute on function public.demo_admin_create_session(text) to anon;
grant execute on function public.demo_admin_get_applications_session(text) to anon;
grant execute on function public.demo_admin_update_status_session(text,uuid,text) to anon;
grant execute on function public.demo_admin_logout_session(text) to anon;
