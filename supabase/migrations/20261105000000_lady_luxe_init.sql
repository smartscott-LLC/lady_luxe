-- =============================================================================
-- LADY LUXE CLUB — core schema (v1.1)
-- Run in Supabase Dashboard → SQL Editor, or: psql "$DB_URL" -f this-file.sql
-- Serves both retail (dropship/bulk) and commission-based models.
-- =============================================================================

-- ---------------------------------------------------------------- subscribers
-- Newsletter (The Letter / The Private List). Anyone can subscribe, no account.
create table if not exists public.subscribers (
  id              uuid primary key default gen_random_uuid(),
  email           citext not null unique,
  first_name      text,
  source          text not null default 'site',   -- site | collection | journal | footer
  prefs           jsonb not null default '{"letter":true,"blog":true,"offers":true}'::jsonb,
  token           uuid not null default gen_random_uuid(),  -- manage/unsubscribe links
  confirmed_at    timestamptz,
  unsubscribed_at timestamptz,
  created_at      timestamptz not null default now()
);

-- ------------------------------------------------------------------- members
-- Account holders; extends auth.users via trigger.
create table if not exists public.members (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text,
  tier          text not null default 'club' check (tier in ('club','posh_circle')),
  posh_refusal_rank serial,          -- Premium Posh first-refusal order
  addresses     jsonb not null default '[]'::jsonb,
  created_at    timestamptz not null default now()
);

-- ------------------------------------------------------------------- catalog
create table if not exists public.collections (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  kind        text not null default 'collection' check (kind in ('collection','ensembles','posh','holiday','archive')),
  story       text,
  live        boolean not null default false,
  sort        int not null default 0
);

create table if not exists public.products (
  id              uuid primary key default gen_random_uuid(),
  sku             text not null unique,
  name            text not null,
  tag             text,                      -- short descriptor, e.g. "silk evening wrap"
  collection_id   uuid references public.collections(id),
  supplier        text,                      -- alterego | allure | in_house (nullable)
  supplier_sku    text,
  wholesale_cost  numeric(10,2),             -- null for in-house pieces
  duty_rate       numeric(5,3),              -- e.g. 0.087 for 8.7%
  status          text not null default 'draft' check (status in ('draft','reserved','live','retired')),
  media           jsonb not null default '[]'::jsonb,   -- [{type:"video"|"image", url, alt}]
  story           text,
  created_at      timestamptz not null default now()
);

create table if not exists public.variants (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete cascade,
  sku         text not null unique,
  size        text,
  color       text,
  price       numeric(10,2) not null,        -- final retail price (duty & fees baked in)
  stock       int not null default 0,        -- 0/nullable for dropship & made-to-order
  live        boolean not null default false
);

-- Ensembles / sets: bundles referencing component SKUs, own media + price.
create table if not exists public.bundles (
  id            uuid primary key default gen_random_uuid(),
  sku           text not null unique,
  name          text not null,               -- e.g. "Blue Hour"
  collection_id uuid references public.collections(id),
  set_factor    numeric(4,3) not null default 0.94,   -- price factor vs summed components
  price         numeric(10,2),               -- computed; stored for reference
  media         jsonb not null default '[]'::jsonb,
  story         text,
  live          boolean not null default false
);

create table if not exists public.bundle_items (
  bundle_id    uuid not null references public.bundles(id) on delete cascade,
  product_id   uuid not null references public.products(id),
  primary key (bundle_id, product_id)
);

-- ------------------------------------------------------------- discount codes
create table if not exists public.discount_codes (
  code        text primary key,
  kind        text not null check (kind in ('percent','fixed')),
  value       numeric not null check (value > 0),
  audience    text not null default 'letter' check (audience in ('letter','member','posh_circle','all')),
  expires_at  timestamptz,
  max_uses    int,
  used_count  int not null default 0,
  active      boolean not null default true
);

create table if not exists public.code_redemptions (
  id          bigserial primary key,
  code        text not null references public.discount_codes(code),
  member_id   uuid references public.members(id) on delete set null,
  email       citext,
  order_id    uuid,
  redeemed_at timestamptz not null default now()
);

-- --------------------------------------------------------------------- orders
create table if not exists public.orders (
  id              uuid primary key default gen_random_uuid(),
  square_order_id text,                      -- Square Orders API reference
  square_payment_id text,
  email           citext not null,
  member_id       uuid references public.members(id),
  kind            text not null default 'retail' check (kind in ('retail','commission','subscription')),
  subtotal        numeric(10,2) not null default 0,
  discount        numeric(10,2) not null default 0,
  shipping        numeric(10,2) not null default 0,
  duty            numeric(10,2) not null default 0,    -- duty portion (internal ledger)
  total           numeric(10,2) not null default 0,
  currency        text not null default 'USD',
  status          text not null default 'pending' check (status in ('pending','paid','forwarded','fulfilled','refunded')),
  meta            jsonb not null default '{}'::jsonb,  -- shipping address, notes
  created_at      timestamptz not null default now()
);

create table if not exists public.order_items (
  id          bigserial primary key,
  order_id    uuid not null references public.orders(id) on delete cascade,
  product_id  uuid references public.products(id),
  variant_id  uuid references public.variants(id),
  bundle_id   uuid references public.bundles(id),
  name        text not null,                 -- snapshot at time of sale
  unit_price  numeric(10,2) not null,
  quantity    int not null default 1
);

-- ------------------------------------------------------------------ RLS
alter table public.subscribers      enable row level security;
alter table public.members          enable row level security;
alter table public.collections      enable row level security;
alter table public.products         enable row level security;
alter table public.variants         enable row level security;
alter table public.bundles          enable row level security;
alter table public.bundle_items     enable row level security;
alter table public.discount_codes   enable row level security;
alter table public.code_redemptions enable row level security;
alter table public.orders           enable row level security;
alter table public.order_items      enable row level security;

-- Subscribers: public may join; self may read own row.
create policy "public can subscribe"
  on public.subscribers for insert to anon, authenticated with check (true);
create policy "read own subscription"
  on public.subscribers for select to authenticated
  using (email = (select email from auth.users where id = auth.uid()));

-- Members: self-service only.
create policy "read own member record" on public.members for select to authenticated using (id = auth.uid());
create policy "update own member record" on public.members for update to authenticated using (id = auth.uid());

-- Catalog: world-readable once live; drafts stay admin-only (service role bypasses RLS).
create policy "read live collections" on public.collections for select to anon, authenticated using (live = true);
create policy "read live products"    on public.products    for select to anon, authenticated using (live = true or status = 'live');
create policy "read live variants"    on public.variants    for select to anon, authenticated using (live = true);
create policy "read live bundles"     on public.bundles     for select to anon, authenticated using (live = true);
create policy "read bundle items"     on public.bundle_items for select to anon, authenticated using (true);

-- Discount codes: authenticated can see active codes; redemptions insert-only.
create policy "read active codes" on public.discount_codes for select to authenticated
  using (active = true and (expires_at is null or expires_at > now()));
create policy "insert redemptions" on public.code_redemptions for insert to authenticated with check (true);

-- Orders: authenticated users see their own; checkout insert allowed for anon+auth
-- (server creates orders via service role anyway — client insert is a convenience path).
create policy "insert own order" on public.orders for insert to anon, authenticated with check (true);
create policy "read own orders" on public.orders for select to authenticated
  using (member_id = auth.uid() or email = (select email from auth.users where id = auth.uid()));
create policy "insert order items" on public.order_items for insert to anon, authenticated with check (true);
create policy "read own order items" on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and (o.member_id = auth.uid()
    or o.email = (select email from auth.users where id = auth.uid()))));

-- ------------------------------------------------------------------- triggers
create or replace function public.handle_new_member()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.members (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_member();

-- ----------------------------------------------------------------------- seed
insert into public.discount_codes (code, kind, value, audience)
values ('LUXEWELCOME', 'percent', 10, 'letter')
on conflict (code) do nothing;

insert into public.collections (slug, name, kind, story, live)
values ('midnight', 'The Midnight Collection', 'collection',
        'Four pieces, each captured in motion.', true)
on conflict (slug) do nothing;

-- -------------------------------------------------------------------- indexes
create index if not exists idx_subscribers_email      on public.subscribers (email);
create index if not exists idx_subscribers_token      on public.subscribers (token);
create index if not exists idx_redemptions_code       on public.code_redemptions (code);
create index if not exists idx_products_collection    on public.products (collection_id);
create index if not exists idx_variants_product       on public.variants (product_id);
create index if not exists idx_orders_email           on public.orders (email);
create index if not exists idx_order_items_order      on public.order_items (order_id);
