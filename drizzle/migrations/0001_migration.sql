DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['categories','folders','pose_categories','pose_subcategories','pose_tags','poses','sequence_poses','sequence_tags','sequences','subcategories','tags'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select_public', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.has_role(auth.uid(), ''admin''::app_role))', t || '_select_admin', t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "pose-images anon read" ON storage.objects;
DROP POLICY IF EXISTS "pose-images anon insert" ON storage.objects;
DROP POLICY IF EXISTS "pose-images anon update" ON storage.objects;
DROP POLICY IF EXISTS "pose-images anon delete" ON storage.objects;

CREATE POLICY "pose-images admin read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'pose-images' AND public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "pose-images admin insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'pose-images' AND owner_id = (select auth.uid())::text AND public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "pose-images admin update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'pose-images' AND owner_id = (select auth.uid())::text AND public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (bucket_id = 'pose-images' AND owner_id = (select auth.uid())::text AND public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "pose-images admin delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'pose-images' AND owner_id = (select auth.uid())::text AND public.has_role(auth.uid(), 'admin'::app_role));