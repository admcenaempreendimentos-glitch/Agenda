-- ============================================================================
-- MFA obrigatório NO BANCO (set/2026) — políticas RESTRITIVAS por nível AAL2.
--
-- ATENÇÃO: aplique SOMENTE depois que TODOS os usuários tiverem cadastrado o
-- autenticador (o aplicativo já conduz esse cadastro no primeiro acesso).
-- Com estas políticas, um token sem segundo fator (aal1) não lê nem escreve
-- nada — mesmo que alguém tente falar direto com a API do Supabase, fora do
-- aplicativo. É a camada que torna o MFA inviolável por bypass de interface.
--
-- Para reverter: DROP POLICY "exige mfa" ON <tabela>;
-- ============================================================================

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['law_firms','contracts','contract_versions','contract_reviews','demands',
                           'demand_updates','demand_attachments','ai_messages','integration_settings',
                           'ai_action_log','audit_log']
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS "exige mfa" ON public.%I', t);
      EXECUTE format(
        'CREATE POLICY "exige mfa" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT auth.jwt()->>''aal'') = ''aal2'')',
        t);
    END IF;
  END LOOP;
END $$;

-- Arquivos (minutas e capas) também exigem AAL2.
DROP POLICY IF EXISTS "exige mfa storage" ON storage.objects;
CREATE POLICY "exige mfa storage" ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated
  USING (
    bucket_id NOT IN ('legal-documents','card-covers')
    OR (SELECT auth.jwt()->>'aal') = 'aal2'
  );
