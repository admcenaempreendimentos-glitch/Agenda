-- ============================================================================
-- Endurecimento de segurança — auditoria set/2026
-- Aplicar no SQL Editor do Supabase (ou via `supabase db push`).
-- Todas as instruções são idempotentes quando possível.
-- ============================================================================

-- 1) A role anon (visitante não autenticado) não deve ter NENHUM privilégio
--    nas tabelas da aplicação. O RLS já bloqueia, mas defesa em profundidade.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;

-- 2) Políticas RLS explicitamente restritas à role authenticated.
DO $$
DECLARE
  t text;
  pol text;
BEGIN
  FOR t, pol IN
    SELECT tablename, policyname FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('law_firms','contracts','contract_versions','contract_reviews',
                        'demands','demand_updates','demand_attachments','ai_messages','integration_settings')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol, t);
  END LOOP;
END $$;

CREATE POLICY "own law_firms"            ON public.law_firms            FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own contracts"            ON public.contracts            FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own contract_versions"    ON public.contract_versions    FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own contract_reviews"     ON public.contract_reviews     FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own demands"              ON public.demands              FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own demand_updates"       ON public.demand_updates       FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own demand_attachments"   ON public.demand_attachments   FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own ai_messages"          ON public.ai_messages          FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own integration_settings" ON public.integration_settings FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 3) Desligar um colaborador NÃO pode apagar contratos, demandas e escritórios
--    da empresa em cascata. Bloqueia a exclusão do usuário enquanto houver
--    registros; o administrador reatribui (UPDATE user_id) antes de remover.
ALTER TABLE public.law_firms DROP CONSTRAINT IF EXISTS law_firms_user_id_fkey;
ALTER TABLE public.law_firms ADD CONSTRAINT law_firms_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;

ALTER TABLE public.contracts DROP CONSTRAINT IF EXISTS contracts_user_id_fkey;
ALTER TABLE public.contracts ADD CONSTRAINT contracts_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;

ALTER TABLE public.demands DROP CONSTRAINT IF EXISTS demands_user_id_fkey;
ALTER TABLE public.demands ADD CONSTRAINT demands_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;

-- 4) Chaves estrangeiras cruzadas: o registro alvo (escritório/contrato/demanda)
--    precisa pertencer ao MESMO usuário da linha que o referencia.
CREATE OR REPLACE FUNCTION public.assert_same_owner(p_table regclass, p_id uuid, p_user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ok boolean;
BEGIN
  IF p_id IS NULL THEN RETURN; END IF;
  EXECUTE format('SELECT EXISTS (SELECT 1 FROM %s WHERE id = $1 AND user_id = $2)', p_table) INTO ok USING p_id, p_user;
  IF NOT ok THEN RAISE EXCEPTION 'Referência a registro de outro usuário não permitida' USING ERRCODE = '42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.assert_same_owner(regclass, uuid, uuid) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.check_contract_refs() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  PERFORM public.assert_same_owner('public.law_firms', NEW.law_firm_id, NEW.user_id);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS contracts_check_refs ON public.contracts;
CREATE TRIGGER contracts_check_refs BEFORE INSERT OR UPDATE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.check_contract_refs();

CREATE OR REPLACE FUNCTION public.check_demand_refs() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  PERFORM public.assert_same_owner('public.law_firms', NEW.law_firm_id, NEW.user_id);
  PERFORM public.assert_same_owner('public.contracts', NEW.contract_id, NEW.user_id);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS demands_check_refs ON public.demands;
CREATE TRIGGER demands_check_refs BEFORE INSERT OR UPDATE ON public.demands
  FOR EACH ROW EXECUTE FUNCTION public.check_demand_refs();

CREATE OR REPLACE FUNCTION public.check_child_refs() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_TABLE_NAME IN ('contract_versions','contract_reviews') THEN
    PERFORM public.assert_same_owner('public.contracts', NEW.contract_id, NEW.user_id);
  ELSIF TG_TABLE_NAME IN ('demand_updates','demand_attachments') THEN
    PERFORM public.assert_same_owner('public.demands', NEW.demand_id, NEW.user_id);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS contract_versions_check_refs ON public.contract_versions;
CREATE TRIGGER contract_versions_check_refs BEFORE INSERT OR UPDATE ON public.contract_versions FOR EACH ROW EXECUTE FUNCTION public.check_child_refs();
DROP TRIGGER IF EXISTS contract_reviews_check_refs ON public.contract_reviews;
CREATE TRIGGER contract_reviews_check_refs BEFORE INSERT OR UPDATE ON public.contract_reviews FOR EACH ROW EXECUTE FUNCTION public.check_child_refs();
DROP TRIGGER IF EXISTS demand_updates_check_refs ON public.demand_updates;
CREATE TRIGGER demand_updates_check_refs BEFORE INSERT OR UPDATE ON public.demand_updates FOR EACH ROW EXECUTE FUNCTION public.check_child_refs();
DROP TRIGGER IF EXISTS demand_attachments_check_refs ON public.demand_attachments;
CREATE TRIGGER demand_attachments_check_refs BEFORE INSERT OR UPDATE ON public.demand_attachments FOR EACH ROW EXECUTE FUNCTION public.check_child_refs();

-- 5) Integridade de valores e datas contratuais; enums em colunas TEXT livres.
ALTER TABLE public.contracts DROP CONSTRAINT IF EXISTS contracts_value_nonneg;
ALTER TABLE public.contracts ADD CONSTRAINT contracts_value_nonneg CHECK (value_cents IS NULL OR value_cents >= 0);
ALTER TABLE public.contracts DROP CONSTRAINT IF EXISTS contracts_period_valid;
ALTER TABLE public.contracts ADD CONSTRAINT contracts_period_valid CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at >= starts_at);

ALTER TABLE public.contract_versions DROP CONSTRAINT IF EXISTS contract_versions_direction_chk;
ALTER TABLE public.contract_versions ADD CONSTRAINT contract_versions_direction_chk CHECK (direction IN ('sent','received'));
ALTER TABLE public.contract_versions DROP CONSTRAINT IF EXISTS contract_versions_round_status_chk;
ALTER TABLE public.contract_versions ADD CONSTRAINT contract_versions_round_status_chk CHECK (round_status IN ('sent','returned','accepted','rejected'));

ALTER TABLE public.demands DROP CONSTRAINT IF EXISTS demands_source_chk;
ALTER TABLE public.demands ADD CONSTRAINT demands_source_chk CHECK (source IN ('manual','email','clickup'));

ALTER TABLE public.ai_messages DROP CONSTRAINT IF EXISTS ai_messages_role_chk;
ALTER TABLE public.ai_messages ADD CONSTRAINT ai_messages_role_chk CHECK (role IN ('user','assistant','system','tool'));

-- 6) Trilha de auditoria das ações executadas pela IA (append-only para o usuário).
CREATE TABLE IF NOT EXISTS public.ai_action_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  tool TEXT NOT NULL,
  input JSONB,
  result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.ai_action_log TO authenticated;
GRANT ALL ON public.ai_action_log TO service_role;
ALTER TABLE public.ai_action_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own ai_action_log read" ON public.ai_action_log;
CREATE POLICY "own ai_action_log read"   ON public.ai_action_log FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "own ai_action_log insert" ON public.ai_action_log;
CREATE POLICY "own ai_action_log insert" ON public.ai_action_log FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS ai_action_log_user_time_idx ON public.ai_action_log(user_id, created_at DESC);

-- 7) Buckets: privados, com limite de tamanho e tipos permitidos.
UPDATE storage.buckets
   SET public = false,
       file_size_limit = 26214400, -- 25 MB
       allowed_mime_types = ARRAY['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document']
 WHERE id = 'legal-documents';
UPDATE storage.buckets
   SET public = false,
       file_size_limit = 5242880, -- 5 MB
       allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp']
 WHERE id = 'card-covers';

-- 8) OPCIONAL — defesa em profundidade contra cadastro fora do domínio corporativo.
--    Descomente APENAS depois de confirmar que todos os usuários existentes usam
--    e-mail @cenaempreendimentos.com.br (caso contrário, novos convites a contas
--    externas legítimas seriam bloqueados).
-- CREATE OR REPLACE FUNCTION public.enforce_company_domain() RETURNS trigger
-- LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
-- BEGIN
--   IF lower(split_part(NEW.email, '@', 2)) <> 'cenaempreendimentos.com.br' THEN
--     RAISE EXCEPTION 'Domínio de e-mail não autorizado';
--   END IF;
--   RETURN NEW;
-- END $$;
-- DROP TRIGGER IF EXISTS enforce_company_domain ON auth.users;
-- CREATE TRIGGER enforce_company_domain BEFORE INSERT ON auth.users
--   FOR EACH ROW EXECUTE FUNCTION public.enforce_company_domain();
