
-- Enums
CREATE TYPE public.demand_status AS ENUM ('open','in_progress','waiting','completed','cancelled');
CREATE TYPE public.demand_priority AS ENUM ('low','medium','high','urgent');
CREATE TYPE public.contract_status AS ENUM ('draft','in_review','negotiating','signed','archived');
CREATE TYPE public.contract_origin AS ENUM ('created_by_me','from_law_firm','from_counterparty');
CREATE TYPE public.firm_status AS ENUM ('active','inactive');

-- updated_at helper
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- LAW FIRMS
CREATE TABLE public.law_firms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  practice_areas TEXT[] NOT NULL DEFAULT '{}',
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  fee_model TEXT,
  status public.firm_status NOT NULL DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.law_firms TO authenticated;
GRANT ALL ON public.law_firms TO service_role;
ALTER TABLE public.law_firms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own law_firms" ON public.law_firms FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER law_firms_updated BEFORE UPDATE ON public.law_firms FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- CONTRACTS
CREATE TABLE public.contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  contract_type TEXT NOT NULL,
  counterparty TEXT,
  object_summary TEXT,
  value_cents BIGINT,
  signed_at DATE,
  starts_at DATE,
  ends_at DATE,
  status public.contract_status NOT NULL DEFAULT 'draft',
  origin public.contract_origin NOT NULL DEFAULT 'created_by_me',
  law_firm_id UUID REFERENCES public.law_firms(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contracts TO authenticated;
GRANT ALL ON public.contracts TO service_role;
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own contracts" ON public.contracts FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER contracts_updated BEFORE UPDATE ON public.contracts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX contracts_user_status_idx ON public.contracts(user_id, status);

-- CONTRACT VERSIONS
CREATE TABLE public.contract_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  version_label TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  authored_by TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_versions TO authenticated;
GRANT ALL ON public.contract_versions TO service_role;
ALTER TABLE public.contract_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own contract_versions" ON public.contract_versions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- CONTRACT REVIEWS
CREATE TABLE public.contract_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  version_id UUID REFERENCES public.contract_versions(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_reviews TO authenticated;
GRANT ALL ON public.contract_reviews TO service_role;
ALTER TABLE public.contract_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own contract_reviews" ON public.contract_reviews FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- DEMANDS
CREATE TABLE public.demands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  law_firm_id UUID REFERENCES public.law_firms(id) ON DELETE SET NULL,
  practice_area TEXT,
  priority public.demand_priority NOT NULL DEFAULT 'medium',
  status public.demand_status NOT NULL DEFAULT 'open',
  sent_at DATE DEFAULT CURRENT_DATE,
  due_at DATE,
  completed_at DATE,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.demands TO authenticated;
GRANT ALL ON public.demands TO service_role;
ALTER TABLE public.demands ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own demands" ON public.demands FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER demands_updated BEFORE UPDATE ON public.demands FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX demands_user_status_idx ON public.demands(user_id, status);
CREATE INDEX demands_firm_idx ON public.demands(law_firm_id);

-- DEMAND UPDATES
CREATE TABLE public.demand_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  demand_id UUID NOT NULL REFERENCES public.demands(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.demand_updates TO authenticated;
GRANT ALL ON public.demand_updates TO service_role;
ALTER TABLE public.demand_updates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own demand_updates" ON public.demand_updates FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- DEMAND ATTACHMENTS
CREATE TABLE public.demand_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  demand_id UUID NOT NULL REFERENCES public.demands(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.demand_attachments TO authenticated;
GRANT ALL ON public.demand_attachments TO service_role;
ALTER TABLE public.demand_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own demand_attachments" ON public.demand_attachments FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- AI MESSAGES
CREATE TABLE public.ai_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_messages TO authenticated;
GRANT ALL ON public.ai_messages TO service_role;
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own ai_messages" ON public.ai_messages FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX ai_messages_user_time_idx ON public.ai_messages(user_id, created_at);

-- STORAGE POLICIES for legal-documents (private bucket per user)
CREATE POLICY "own legal-documents read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'legal-documents' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "own legal-documents insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'legal-documents' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "own legal-documents update" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'legal-documents' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "own legal-documents delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'legal-documents' AND auth.uid()::text = (storage.foldername(name))[1]);
