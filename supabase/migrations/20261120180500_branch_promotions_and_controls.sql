-- Additive BURGER HOUSE promotion and branch-control schema.
create table if not exists public.promo_banners (
 id uuid primary key default gen_random_uuid(),
 branch_id text references public.branches(id) on delete cascade,
 title_ar text not null, title_en text, subtitle_ar text, subtitle_en text,
 image_url text not null, badge_text text not null default 'عرض اليوم',
 cta_label text not null default 'اطلب الآن', target_url text,
 target_product_id text references public.products(id) on delete set null,
 target_category_id text references public.categories(id) on delete set null,
 starts_at timestamptz not null default now(), ends_at timestamptz,
 sort_order integer not null default 0, is_active boolean not null default true,
 created_by uuid references auth.users(id) on delete set null,
 created_by_role text not null default 'super_admin',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 constraint promo_banners_valid_window check (ends_at is null or ends_at > starts_at),
 constraint promo_banners_target_check check (target_url is not null or target_product_id is not null or target_category_id is not null)
);
create index if not exists promo_banners_schedule_idx on public.promo_banners(is_active,starts_at,ends_at,sort_order);
create index if not exists promo_banners_branch_idx on public.promo_banners(branch_id,is_active,sort_order);
alter table public.promo_banners enable row level security;
drop policy if exists "Public reads active scheduled promo banners" on public.promo_banners;
create policy "Public reads active scheduled promo banners" on public.promo_banners for select to anon,authenticated
using (is_active=true and starts_at<=now() and (ends_at is null or ends_at>now()));
drop policy if exists "Owners manage promo banners" on public.promo_banners;
create policy "Owners manage promo banners" on public.promo_banners for all to authenticated
using (public.current_app_role() in ('super_admin'::public.user_role,'owner'::public.user_role))
with check (public.current_app_role() in ('super_admin'::public.user_role,'owner'::public.user_role));
drop policy if exists "Branch managers manage own promo banners" on public.promo_banners;
create policy "Branch managers manage own promo banners" on public.promo_banners for all to authenticated
using (public.current_app_role()='branch_manager'::public.user_role and branch_id=public.current_user_branch())
with check (public.current_app_role()='branch_manager'::public.user_role and branch_id=public.current_user_branch());
grant select on public.promo_banners to anon,authenticated;
grant insert,update,delete on public.promo_banners to authenticated;

create table if not exists public.branch_products (
 branch_id text not null references public.branches(id) on delete cascade,
 product_id text not null references public.products(id) on delete cascade,
 is_available boolean not null default true, manual_disabled boolean not null default false,
 sold_out_until timestamptz, custom_base_price numeric(10,2),
 updated_at timestamptz not null default now(), primary key(branch_id,product_id),
 constraint branch_products_price_nonnegative check(custom_base_price is null or custom_base_price>=0)
);
alter table public.branch_products enable row level security;
drop policy if exists "Public reads branch product availability" on public.branch_products;
create policy "Public reads branch product availability" on public.branch_products for select to anon,authenticated using(true);
drop policy if exists "Branch operations manage own products" on public.branch_products;
create policy "Branch operations manage own products" on public.branch_products for all to authenticated
using (public.current_app_role() in ('super_admin'::public.user_role,'owner'::public.user_role) or
(public.current_app_role() in ('branch_manager'::public.user_role,'cashier'::public.user_role,'kitchen_staff'::public.user_role) and branch_id=public.current_user_branch()))
with check (public.current_app_role() in ('super_admin'::public.user_role,'owner'::public.user_role) or
(public.current_app_role() in ('branch_manager'::public.user_role,'cashier'::public.user_role,'kitchen_staff'::public.user_role) and branch_id=public.current_user_branch()));
grant select on public.branch_products to anon,authenticated;
grant insert,update,delete on public.branch_products to authenticated;

create table if not exists public.branch_categories (
 branch_id text not null references public.branches(id) on delete cascade,
 category_id text not null references public.categories(id) on delete cascade,
 is_active boolean not null default true, updated_at timestamptz not null default now(),
 primary key(branch_id,category_id)
);
alter table public.branch_categories enable row level security;
drop policy if exists "Public reads branch category availability" on public.branch_categories;
create policy "Public reads branch category availability" on public.branch_categories for select to anon,authenticated using(true);
drop policy if exists "Branch managers manage own categories" on public.branch_categories;
create policy "Branch managers manage own categories" on public.branch_categories for all to authenticated
using (public.current_app_role() in ('super_admin'::public.user_role,'owner'::public.user_role) or
(public.current_app_role()='branch_manager'::public.user_role and branch_id=public.current_user_branch()))
with check (public.current_app_role() in ('super_admin'::public.user_role,'owner'::public.user_role) or
(public.current_app_role()='branch_manager'::public.user_role and branch_id=public.current_user_branch()));
grant select on public.branch_categories to anon,authenticated;
grant insert,update,delete on public.branch_categories to authenticated;

create table if not exists public.coupons (
 id uuid primary key default gen_random_uuid(), code text not null unique,
 discount_type text not null check(discount_type in ('percent','fixed')),
 discount_value numeric(10,2) not null check(discount_value>0),
 minimum_order numeric(10,2) not null default 0 check(minimum_order>=0),
 max_uses integer, used_count integer not null default 0,
 starts_at timestamptz not null default now(), ends_at timestamptz,
 branch_id text references public.branches(id) on delete cascade,
 is_active boolean not null default true, created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 constraint coupons_valid_window check(ends_at is null or ends_at>starts_at),
 constraint coupons_usage_nonnegative check(used_count>=0 and (max_uses is null or max_uses>=used_count))
);
create index if not exists coupons_code_active_idx on public.coupons(code,is_active);
alter table public.coupons enable row level security;
drop policy if exists "Owners manage coupons" on public.coupons;
create policy "Owners manage coupons" on public.coupons for all to authenticated
using(public.current_app_role() in ('super_admin'::public.user_role,'owner'::public.user_role))
with check(public.current_app_role() in ('super_admin'::public.user_role,'owner'::public.user_role));
grant select,insert,update,delete on public.coupons to authenticated;
