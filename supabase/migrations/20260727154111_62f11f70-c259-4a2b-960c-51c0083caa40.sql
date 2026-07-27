
CREATE POLICY "pose-images anon read" ON storage.objects
  FOR SELECT TO anon, authenticated USING (bucket_id = 'pose-images');
CREATE POLICY "pose-images anon insert" ON storage.objects
  FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'pose-images');
CREATE POLICY "pose-images anon update" ON storage.objects
  FOR UPDATE TO anon, authenticated USING (bucket_id = 'pose-images') WITH CHECK (bucket_id = 'pose-images');
CREATE POLICY "pose-images anon delete" ON storage.objects
  FOR DELETE TO anon, authenticated USING (bucket_id = 'pose-images');
