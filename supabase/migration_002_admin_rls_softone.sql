-- erp-equipment-reservations migration 002
-- Run once in the Supabase SQL Editor (Project: hgqigqmzgdrmkerxkwaa)
-- Do NOT re-run schema.sql — this is incremental on top of the already-provisioned DB.

-- ─────────────────────────────────────────────────────────────
-- Admin role
-- ─────────────────────────────────────────────────────────────
alter table profiles add column if not exists role text not null default 'architect';
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check check (role in ('architect', 'admin'));

update profiles set role = 'admin' where id = 'ecca4e7b-2c74-48cb-b609-1528687c1818'; -- giorgos@palerosbay.com

-- ─────────────────────────────────────────────────────────────
-- SoftOne order-sync support columns
-- ─────────────────────────────────────────────────────────────
alter table reservations add column if not exists softone_linenum integer;
create unique index if not exists reservations_softone_linenum_idx on reservations (softone_linenum) where softone_linenum is not null;

alter table products add column if not exists mtrl_id integer;

-- ─────────────────────────────────────────────────────────────
-- RLS: architects can only edit/delete their OWN reservations.
-- Admins (role='admin') can edit/delete anyone's. Replaces the
-- earlier "anyone can edit anyone's row" policy.
-- ─────────────────────────────────────────────────────────────
drop policy if exists "authenticated insert reservations" on reservations;
drop policy if exists "authenticated update reservations" on reservations;
drop policy if exists "authenticated delete reservations" on reservations;

create or replace function is_admin()
returns boolean as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$ language sql stable security definer;

create policy "own or admin insert reservations" on reservations
  for insert to authenticated
  with check (architect_id = auth.uid() or is_admin());

create policy "own or admin update reservations" on reservations
  for update to authenticated
  using (architect_id = auth.uid() or is_admin());

create policy "own or admin delete reservations" on reservations
  for delete to authenticated
  using (architect_id = auth.uid() or is_admin());
