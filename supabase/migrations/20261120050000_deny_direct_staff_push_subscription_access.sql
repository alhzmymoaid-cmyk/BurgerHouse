-- Explicitly deny direct client access; authenticated staff use the server-validated API.
create policy staff_push_subscriptions_deny_authenticated
  on public.staff_push_subscriptions
  for all to authenticated
  using (false)
  with check (false);
