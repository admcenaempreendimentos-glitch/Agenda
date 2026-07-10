
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS accent_color TEXT,
  ADD COLUMN IF NOT EXISTS icon_emoji TEXT,
  ADD COLUMN IF NOT EXISTS custom_tag TEXT,
  ADD COLUMN IF NOT EXISTS cover_image_url TEXT;

ALTER TABLE public.law_firms
  ADD COLUMN IF NOT EXISTS accent_color TEXT,
  ADD COLUMN IF NOT EXISTS icon_emoji TEXT,
  ADD COLUMN IF NOT EXISTS custom_tag TEXT,
  ADD COLUMN IF NOT EXISTS cover_image_url TEXT;
