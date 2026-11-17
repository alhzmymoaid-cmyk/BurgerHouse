-- ============================================================================
-- BURGER HOUSE — Migration 005: Supabase Storage Bucket Policies & Realtime Sync
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'menu-media',
  'menu-media',
  TRUE,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Public read menu media images" ON storage.objects;
CREATE POLICY "Public read menu media images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'menu-media');

DROP POLICY IF EXISTS "Owner and Super Admin upload menu media" ON storage.objects;
CREATE POLICY "Owner and Super Admin upload menu media"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'menu-media'
    AND public.current_app_role() IN ('super_admin', 'owner')
  );

DROP POLICY IF EXISTS "Owner and Super Admin update menu media" ON storage.objects;
CREATE POLICY "Owner and Super Admin update menu media"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'menu-media'
    AND public.current_app_role() IN ('super_admin', 'owner')
  );

DROP POLICY IF EXISTS "Owner and Super Admin delete menu media" ON storage.objects;
CREATE POLICY "Owner and Super Admin delete menu media"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'menu-media'
    AND public.current_app_role() IN ('super_admin', 'owner')
  );

-- Enable Realtime on operational tables
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.order_status_history;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.system_settings;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
