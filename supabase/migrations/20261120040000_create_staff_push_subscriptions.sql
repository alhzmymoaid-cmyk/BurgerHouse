-- Branch-scoped Web Push subscriptions for authenticated staff devices.
create table if not exists public.staff_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  branch_id text not null references public.branches(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists staff_push_subscriptions_branch_id_idx on public.staff_push_subscriptions(branch_id);
create index if not exists staff_push_subscriptions_user_id_idx on public.staff_push_subscriptions(user_id);
alter table public.staff_push_subscriptions enable row level security;
revoke all on table public.staff_push_subscriptions from anon, authenticated;
