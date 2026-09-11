-- ============================================================================
-- MFA exigido NO BANCO (set/2026) — padrão documentado pelo Supabase:
-- políticas RESTRITIVAS que exigem AAL2 SOMENTE de usuários que já possuem
-- autenticador verificado. Quem ainda não cadastrou continua acessando com aal1,
-- então esta migração pode ser aplicada IMEDIATAMENTE, sem trancar ninguém.
-- Assim que o colaborador cadastra o autenticador, o banco passa a recusar
-- qualquer token dele sem segundo fator — mesmo fora do aplicativo.
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
      EXECUTE format($p$
        CREATE POLICY "exige mfa" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated
        USING (
          array[(SELECT auth.jwt()->>'aal')] <@ (
            SELECT CASE WHEN count(id) > 0 THEN array['aal2'] ELSE array['aal1','aal2'] END
            FROM auth.mfa_factors
            WHERE (SELECT auth.uid()) = user_id AND status = 'verified'
          )
        )$p$, t);
    END IF;
  END LOOP;
END $$;

-- Arquivos (minutas e capas) seguem a mesma regra.
DROP POLICY IF EXISTS "exige mfa storage" ON storage.objects;
CREATE POLICY "exige mfa storage" ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated
  USING (
    bucket_id NOT IN ('legal-documents','card-covers')
    OR array[(SELECT auth.jwt()->>'aal')] <@ (
      SELECT CASE WHEN count(id) > 0 THEN array['aal2'] ELSE array['aal1','aal2'] END
      FROM auth.mfa_factors
      WHERE (SELECT auth.uid()) = user_id AND status = 'verified'
    )
  );
