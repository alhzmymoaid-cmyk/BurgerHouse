-- Restrict branch-specific menu availability mutations to branch managers.
drop policy if exists "Branch operations manage own products" on public.branch_products;
create policy "Branch managers manage own products"
on public.branch_products for all to authenticated
using (
  public.current_app_role() in ('super_admin'::public.user_role,'owner'::public.user_role)
  or (public.current_app_role()='branch_manager'::public.user_role and branch_id=public.current_user_branch())
)
with check (
  public.current_app_role() in ('super_admin'::public.user_role,'owner'::public.user_role)
  or (public.current_app_role()='branch_manager'::public.user_role and branch_id=public.current_user_branch())
);
