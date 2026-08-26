-- Run this in Supabase SQL Editor after creating your admin user in Authentication > Users.
-- Replace ADMIN_USER_UUID with the admin user's UUID.
-- This keeps applicant data private while allowing the admin account to read/update it.

alter table public.applications enable row level security;

create policy "admin can read applications"
on public.applications
for select
to authenticated
using ((select auth.uid()) = 'ADMIN_USER_UUID'::uuid);

create policy "admin can update applications"
on public.applications
for update
to authenticated
using ((select auth.uid()) = 'ADMIN_USER_UUID'::uuid)
with check ((select auth.uid()) = 'ADMIN_USER_UUID'::uuid);
