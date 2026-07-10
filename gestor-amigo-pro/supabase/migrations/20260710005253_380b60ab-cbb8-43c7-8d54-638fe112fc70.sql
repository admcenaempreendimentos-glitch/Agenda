
-- Integration fields
ALTER TABLE public.demands
  ADD COLUMN clickup_task_id TEXT,
  ADD COLUMN clickup_synced_at TIMESTAMPTZ,
  ADD COLUMN source TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN source_email JSONB;

ALTER TABLE public.contracts
  ADD COLUMN sharepoint_item_id TEXT,
  ADD COLUMN sharepoint_web_url TEXT;

ALTER TABLE public.contract_versions
  ADD COLUMN sharepoint_item_id TEXT,
  ADD COLUMN sharepoint_web_url TEXT;

ALTER TABLE public.demand_attachments
  ADD COLUMN sharepoint_item_id TEXT,
  ADD COLUMN sharepoint_web_url TEXT;

-- Per-user integration settings
CREATE TABLE public.integration_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  sharepoint_site_id TEXT,
  sharepoint_site_name TEXT,
  sharepoint_drive_id TEXT,
  sharepoint_drive_name TEXT,
  clickup_team_id TEXT,
  clickup_space_id TEXT,
  clickup_list_id TEXT,
  clickup_list_name TEXT,
  clickup_webhook_id TEXT,
  clickup_status_map JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.integration_settings TO authenticated;
GRANT ALL ON public.integration_settings TO service_role;

ALTER TABLE public.integration_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own integration settings"
  ON public.integration_settings FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER integration_settings_set_updated_at
  BEFORE UPDATE ON public.integration_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Lookup index for webhook -> user
CREATE INDEX idx_demands_clickup_task ON public.demands(clickup_task_id) WHERE clickup_task_id IS NOT NULL;
