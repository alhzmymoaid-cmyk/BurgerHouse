-- Bound the growth of authentication rate-limit state.
create index if not exists customer_auth_rate_limits_updated_at_idx
  on public.customer_auth_rate_limits (updated_at);

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
  delete from public.customer_auth_rate_limits
  where updated_at < now() - interval '1 day';

  if p_key is null
     or char_length(p_key) <> 64
     or p_max_attempts < 1
     or p_window_seconds < 1
     or p_window_seconds > 86400 then
    return false;
  end if;

  insert into public.customer_auth_rate_limits as limits (key, window_started_at, attempt_count, updated_at)
  values (p_key, now(), 1, now())
  on conflict (key) do update
    set attempt_count = case
          when limits.window_started_at
               <= now() - make_interval(secs => p_window_seconds)
            then 1
          else limits.attempt_count + 1
        end,
        window_started_at = case
          when limits.window_started_at
               <= now() - make_interval(secs => p_window_seconds)
            then now()
          else limits.window_started_at
        end,
        updated_at = now()
  returning attempt_count into current_attempts;

  return current_attempts <= p_max_attempts;
end;
$function$;
