-- template-assets: public-read bucket for Unlayer-uploaded images. The CDN URL
-- is embedded directly in campaign HTML, so reads must be public; writes are
-- limited to authenticated team members.
INSERT INTO storage.buckets (id, name, public)
VALUES ('template-assets', 'template-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Public read (anyone can fetch an image referenced in a delivered email).
CREATE POLICY "template_assets_public_read"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'template-assets');

-- Authenticated team members manage objects in this bucket.
CREATE POLICY "template_assets_authenticated_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'template-assets');

CREATE POLICY "template_assets_authenticated_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'template-assets')
  WITH CHECK (bucket_id = 'template-assets');

CREATE POLICY "template_assets_authenticated_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'template-assets');
