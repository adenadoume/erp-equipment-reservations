-- erp-equipment-reservations schema
-- Run this once in the Supabase SQL Editor (Project: hgqigqmzgdrmkerxkwaa)

create extension if not exists "pgcrypto";

-- ─────────────────────────────────────────────────────────────
-- PROJECTS  (OIK codes — dropdown source, can grow over time)
-- ─────────────────────────────────────────────────────────────
create table if not exists projects (
  code       text primary key,
  name       text,
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- PROFILES  (one row per architect/user, auto-created on signup)
-- ─────────────────────────────────────────────────────────────
create table if not exists profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text not null,
  created_at timestamptz not null default now()
);

create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)));
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ─────────────────────────────────────────────────────────────
-- PRODUCTS  (master catalog, imported from Airtable "MASTER CODES")
-- ─────────────────────────────────────────────────────────────
create table if not exists products (
  kodikos       text primary key,
  perigrafi     text,
  price         numeric,
  stock_softone numeric,
  promitheftis  text,
  category      text,
  kathgoria     text,
  photo_url     text,
  container     text,
  q             numeric not null default 0,   -- total stock (source of truth for availability calc)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists products_category_idx on products (category);
create index if not exists products_promitheftis_idx on products (promitheftis);

-- ─────────────────────────────────────────────────────────────
-- RESERVATIONS  (imported from Airtable "RESERVATIONS", plus new ones from app)
-- ─────────────────────────────────────────────────────────────
create table if not exists reservations (
  id               uuid primary key default gen_random_uuid(),
  product_code     text not null references products(kodikos) on delete restrict,
  architect_id     uuid references auth.users(id),
  architect_name   text not null,             -- snapshot for display / historical imports
  project_code     text not null references projects(code),
  quantity         numeric not null check (quantity > 0),
  reservation_date date not null default current_date,
  description      text,                       -- snapshot of product description at time of reservation
  category         text,                        -- snapshot of category at time of reservation
  edited_by        text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists reservations_product_idx on reservations (product_code);
create index if not exists reservations_project_idx on reservations (project_code);

-- live availability = q - sum(reserved)
create or replace view product_availability as
select
  p.*,
  coalesce(r.reserved_qty, 0)                as reserved_qty,
  p.q - coalesce(r.reserved_qty, 0)          as available_qty
from products p
left join (
  select product_code, sum(quantity) as reserved_qty
  from reservations
  group by product_code
) r on r.product_code = p.kodikos;

-- ─────────────────────────────────────────────────────────────
-- RLS — internal tool, 7 known architects, all authenticated users
-- can read everything and manage reservations (mirrors the shared
-- Airtable/Softr editing behaviour: anyone can edit/delete anyone's row).
-- ─────────────────────────────────────────────────────────────
alter table projects      enable row level security;
alter table profiles      enable row level security;
alter table products      enable row level security;
alter table reservations  enable row level security;

create policy "authenticated read projects"      on projects      for select to authenticated using (true);
create policy "authenticated insert projects"    on projects      for insert to authenticated with check (true);

create policy "authenticated read profiles"      on profiles      for select to authenticated using (true);

create policy "authenticated read products"      on products      for select to authenticated using (true);

create policy "authenticated read reservations"  on reservations  for select to authenticated using (true);
create policy "authenticated insert reservations" on reservations for insert to authenticated with check (true);
create policy "authenticated update reservations" on reservations for update to authenticated using (true);
create policy "authenticated delete reservations" on reservations for delete to authenticated using (true);

-- updated_at bookkeeping
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists products_updated_at on products;
create trigger products_updated_at before update on products
  for each row execute function set_updated_at();

drop trigger if exists reservations_updated_at on reservations;
create trigger reservations_updated_at before update on reservations
  for each row execute function set_updated_at();
