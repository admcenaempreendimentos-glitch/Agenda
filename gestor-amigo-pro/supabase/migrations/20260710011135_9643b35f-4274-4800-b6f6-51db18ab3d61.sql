ALTER TABLE public.contract_versions
  ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'sent',
  ADD COLUMN IF NOT EXISTS sent_by text,
  ADD COLUMN IF NOT EXISTS round_number integer,
  ADD COLUMN IF NOT EXISTS change_summary text,
  ADD COLUMN IF NOT EXISTS round_status text NOT NULL DEFAULT 'sent';

-- Backfill round_number by insertion order per contract
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY contract_id ORDER BY created_at) AS rn
  FROM public.contract_versions
  WHERE round_number IS NULL
)
UPDATE public.contract_versions v
SET round_number = ranked.rn
FROM ranked
WHERE v.id = ranked.id;