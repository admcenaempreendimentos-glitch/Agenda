
ALTER TABLE public.demands
  ADD COLUMN IF NOT EXISTS accent_color TEXT,
  ADD COLUMN IF NOT EXISTS icon_emoji TEXT,
  ADD COLUMN IF NOT EXISTS custom_tag TEXT,
  ADD COLUMN IF NOT EXISTS cover_image_url TEXT;

CREATE POLICY "Users can read own card covers"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'card-covers' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can upload own card covers"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'card-covers' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can update own card covers"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'card-covers' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete own card covers"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'card-covers' AND (storage.foldername(name))[1] = auth.uid()::text);
