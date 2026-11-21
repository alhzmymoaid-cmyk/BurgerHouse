-- BURGER HOUSE enterprise foundation (additive only).
-- Existing system_settings, order_status_history, promo_banners, branch_products and audit_logs
-- are intentionally reused; this migration does not create duplicate equivalents.

alter table public.orders
  add column if not exists coupon_id uuid,
  add column if not exists coupon_code text,
  add column if not exists discount_amount numeric(12,2) not null default 0,
  add column if not exists coupon_snapshot jsonb not null default '{}'::jsonb;

create index if not exists orders_coupon_id_idx
  on public.orders (coupon_id)
  where coupon_id is not null;

create table if not exists public.customer_favorites (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customer_profiles(id) on delete cascade,
  product_id text not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint customer_favorites_customer_product_key unique (customer_id, product_id)
);

alter table public.customer_favorites enable row level security;

drop policy if exists customer_favorites_select_own on public.customer_favorites;
create policy customer_favorites_select_own
  on public.customer_favorites
  for select
  to authenticated
  using (
    customer_id = (select auth.uid())
    and exists (
      select 1 from public.customer_profiles cp
      where cp.id = (select auth.uid())
    )
  );

drop policy if exists customer_favorites_insert_own on public.customer_favorites;
create policy customer_favorites_insert_own
  on public.customer_favorites
  for insert
  to authenticated
  with check (
    customer_id = (select auth.uid())
    and exists (
      select 1 from public.customer_profiles cp
      where cp.id = (select auth.uid())
    )
  );

drop policy if exists customer_favorites_delete_own on public.customer_favorites;
create policy customer_favorites_delete_own
  on public.customer_favorites
  for delete
  to authenticated
  using (
    customer_id = (select auth.uid())
    and exists (
      select 1 from public.customer_profiles cp
      where cp.id = (select auth.uid())
    )
  );

grant select, insert, delete on public.customer_favorites to authenticated;
revoke all on public.customer_favorites from anon;

create index if not exists customer_favorites_product_id_idx
  on public.customer_favorites (product_id);

-- Customer push credentials are server-managed only. The browser never receives
-- direct table access; API handlers use the service role after authenticating the customer.
create table if not exists public.customer_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customer_profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.customer_push_subscriptions enable row level security;
revoke all on public.customer_push_subscriptions from anon, authenticated;
grant all on public.customer_push_subscriptions to service_role;

create index if not exists customer_push_subscriptions_customer_id_idx
  on public.customer_push_subscriptions (customer_id);

-- A guest order can only be claimed when the signed-in customer supplies that
-- order's private tracking token. A phone-number match by itself is not proof
-- of ownership. Call once per order; repeated claims by the same customer are idempotent.
create or replace function public.claim_guest_orders_by_phone(
  p_order_code text,
  p_tracking_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_customer_id uuid;
  v_customer_phone text;
  v_order_id uuid;
begin
  v_customer_id := auth.uid();
  if v_customer_id is null then
    raise exception using errcode = '28000', message = 'AUTHENTICATION_REQUIRED';
  end if;

  if coalesce(trim(p_order_code), '') = ''
     or coalesce(trim(p_tracking_token), '') = ''
     or length(trim(p_tracking_token)) < 24
     or left(trim(p_tracking_token), 4) <> 'trk_' then
    raise exception using errcode = '22023', message = 'INVALID_ORDER_CLAIM_CREDENTIALS';
  end if;

  select cp.phone
    into v_customer_phone
    from public.customer_profiles cp
   where cp.id = v_customer_id;

  if v_customer_phone is null then
    raise exception using errcode = 'P0001', message = 'CUSTOMER_PROFILE_NOT_FOUND';
  end if;

  update public.orders o
     set customer_id = v_customer_id
   where upper(o.order_code) = upper(trim(p_order_code))
     and o.tracking_token = trim(p_tracking_token)
     and regexp_replace(o.customer_phone, '[^0-9]', '', 'g')
         = regexp_replace(v_customer_phone, '[^0-9]', '', 'g')
     and o.customer_id is null
  returning o.id into v_order_id;

  if v_order_id is not null then
    return jsonb_build_object('ok', true, 'claimed', true, 'order_id', v_order_id);
  end if;

  select o.id
    into v_order_id
    from public.orders o
   where upper(o.order_code) = upper(trim(p_order_code))
     and o.tracking_token = trim(p_tracking_token)
     and regexp_replace(o.customer_phone, '[^0-9]', '', 'g')
         = regexp_replace(v_customer_phone, '[^0-9]', '', 'g')
     and o.customer_id = v_customer_id;

  if v_order_id is not null then
    return jsonb_build_object('ok', true, 'claimed', false, 'already_claimed', true, 'order_id', v_order_id);
  end if;

  raise exception using errcode = 'P0001', message = 'GUEST_ORDER_CLAIM_NOT_VERIFIED';
end;
$function$;

revoke all on function public.claim_guest_orders_by_phone(text, text) from public;
revoke all on function public.claim_guest_orders_by_phone(text, text) from anon;
grant execute on function public.claim_guest_orders_by_phone(text, text) to authenticated;

-- Enable Postgres Changes for order tracking where the caller is authorized by RLS.
do $publication$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'orders'
    ) then
      alter publication supabase_realtime add table public.orders;
    end if;
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'order_status_history'
    ) then
      alter publication supabase_realtime add table public.order_status_history;
    end if;
  end if;
end;
$publication$;
