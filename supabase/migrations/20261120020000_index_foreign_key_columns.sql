-- Add covering indexes for foreign-key columns identified by Supabase performance advisors.
-- These indexes are additive and do not alter or remove existing records or constraints.
CREATE INDEX IF NOT EXISTS audit_logs_actor_id_idx ON public.audit_logs (actor_id);
CREATE INDEX IF NOT EXISTS branch_product_overrides_product_id_idx ON public.branch_product_overrides (product_id);
CREATE INDEX IF NOT EXISTS order_items_order_id_idx ON public.order_items (order_id);
CREATE INDEX IF NOT EXISTS order_items_product_id_idx ON public.order_items (product_id);
CREATE INDEX IF NOT EXISTS order_status_history_actor_id_idx ON public.order_status_history (actor_id);
CREATE INDEX IF NOT EXISTS order_status_history_order_id_idx ON public.order_status_history (order_id);
CREATE INDEX IF NOT EXISTS orders_branch_id_idx ON public.orders (branch_id);
CREATE INDEX IF NOT EXISTS orders_payment_method_id_idx ON public.orders (payment_method_id);
CREATE INDEX IF NOT EXISTS product_sizes_product_id_idx ON public.product_sizes (product_id);
CREATE INDEX IF NOT EXISTS products_category_id_idx ON public.products (category_id);
CREATE INDEX IF NOT EXISTS system_settings_updated_by_idx ON public.system_settings (updated_by);
CREATE INDEX IF NOT EXISTS user_profiles_assigned_branch_id_idx ON public.user_profiles (assigned_branch_id);
