-- Demo-only admin login for Farabi IT Center.
-- Credentials are stored as a bcrypt hash in Supabase, not in the public frontend.
-- Current demo login: omarfo503@gmail.com / omarfo503@gmail.com
-- Change the credential before handing this project to a client.

create extension if not exists pgcrypto;

create table if not exists public.demo_admin_credentials (
  email text primary key,
  password_hash text not null,
  created_at timestamptz not null default now()
);

insert into public.demo_admin_credentials (email, password_hash)
values ('omarfo503@gmail.com', crypt('omarfo503@gmail.com', gen_salt('bf')))
on conflict (email) do update set password_hash = excluded.password_hash;

alter table public.demo_admin_credentials enable row level security;
revoke all on public.demo_admin_credentials from anon, authenticated;

-- The frontend never reads applications directly. It calls these protected
-- demo RPC functions, which verify the supplied credentials before returning
-- or changing application records.

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

create or replace function public.demo_admin_get_applications(p_email text, p_password text)
returns setof public.applications
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.demo_admin_login(p_email, p_password) then
    raise exception 'Invalid admin credentials';
  end if;
  return query select * from public.applications order by created_at desc;
end;
$$;

create or replace function public.demo_admin_update_status(p_email text, p_password text, p_id uuid, p_status text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.demo_admin_login(p_email, p_password) then
    raise exception 'Invalid admin credentials';
  end if;
  if p_status not in ('pending','approved','rejected') then
    raise exception 'Invalid status';
  end if;
  update public.applications set status = p_status where id = p_id;
  return found;
end;
$$;

grant execute on function public.demo_admin_login(text,text) to anon, authenticated;
grant execute on function public.demo_admin_get_applications(text,text) to anon, authenticated;
grant execute on function public.demo_admin_update_status(text,text,uuid,text) to anon, authenticated;
