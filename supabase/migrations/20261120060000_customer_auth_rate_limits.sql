-- Server-only rate limiting for customer phone/password registration and login.
create table if not exists public.customer_auth_rate_limits (
  key text primary key check (char_length(key) = 64),
  window_started_at timestamptz not null default now(),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  updated_at timestamptz not null default now()
);

alter table public.customer_auth_rate_limits enable row level security;
revoke all on table public.customer_auth_rate_limits from public, anon, authenticated;
grant all on table public.customer_auth_rate_limits to service_role;

create or replace function public.consume_customer_auth_rate_limit(
  p_key text,
  p_max_attempts integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
  current_attempts integer;
begin
  if p_key is null
     or char_length(p_key) <> 64
     or p_max_attempts < 1
     or p_window_seconds < 1
     or p_window_seconds > 86400 then
    return false;
  end if;

  insert into public.customer_auth_rate_limits (key, window_started_at, attempt_count, updated_at)
  values (p_key, now(), 1, now())
  on conflict (key) do update
    set attempt_count = case
          when public.customer_auth_rate_limits.window_started_at
               <= now() - make_interval(secs => p_window_seconds)
            then 1
          else public.customer_auth_rate_limits.attempt_count + 1
        end,
        window_started_at = case
          when public.customer_auth_rate_limits.window_started_at
               <= now() - make_interval(secs => p_window_seconds)
            then now()
          else public.customer_auth_rate_limits.window_started_at
        end,
        updated_at = now()
  returning attempt_count into current_attempts;

  return current_attempts <= p_max_attempts;
end;
$function$;

revoke all on function public.consume_customer_auth_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_customer_auth_rate_limit(text, integer, integer) to service_role;
