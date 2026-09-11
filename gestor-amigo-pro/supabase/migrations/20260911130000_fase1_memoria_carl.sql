-- ============================================================================
-- FASE 1 — MEMÓRIA DO CARL
-- Preferências, decisões e fatos que o Carl deve lembrar entre conversas.
-- Vale em todos os sistemas: a memória é da pessoa, não do módulo.
-- Depende da Fase 0 (organização e papéis).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.carl_memorias (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID REFERENCES public.organizacoes(id) ON DELETE RESTRICT,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  escopo      TEXT NOT NULL DEFAULT 'pessoal' CHECK (escopo IN ('pessoal','equipe')),
  area        TEXT,                        -- juridico | comercial | locacao | patrimonial | NULL = vale em todas
  chave       TEXT NOT NULL,               -- assunto curto: "escritorio_trabalhista"
  valor       TEXT NOT NULL,               -- o que lembrar
  origem      TEXT NOT NULL DEFAULT 'explicita' CHECK (origem IN ('explicita','inferida')),
  usos        INTEGER NOT NULL DEFAULT 0,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS carl_memorias_chave_idx
  ON public.carl_memorias(user_id, escopo, COALESCE(area,''), lower(chave));
CREATE INDEX IF NOT EXISTS carl_memorias_user_idx ON public.carl_memorias(user_id, atualizado_em DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.carl_memorias TO authenticated;
GRANT ALL ON public.carl_memorias TO service_role;
ALTER TABLE public.carl_memorias ENABLE ROW LEVEL SECURITY;

-- Memória pessoal é privada. Memória de equipe é lida por toda a organização,
-- mas só quem a criou (ou a diretoria) pode alterar.
DROP POLICY IF EXISTS "memoria leitura" ON public.carl_memorias;
CREATE POLICY "memoria leitura" ON public.carl_memorias FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR (escopo = 'equipe' AND org_id = public.org_atual()));

DROP POLICY IF EXISTS "memoria escrita" ON public.carl_memorias;
CREATE POLICY "memoria escrita" ON public.carl_memorias FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.e_diretoria())
  WITH CHECK (user_id = auth.uid());

DO $$ BEGIN
  DROP TRIGGER IF EXISTS carl_memorias_org ON public.carl_memorias;
  CREATE TRIGGER carl_memorias_org BEFORE INSERT ON public.carl_memorias
    FOR EACH ROW EXECUTE FUNCTION public.preenche_org_id();
  DROP TRIGGER IF EXISTS carl_memorias_touch ON public.carl_memorias;
  CREATE TRIGGER carl_memorias_touch BEFORE UPDATE ON public.carl_memorias
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE 'Aplique antes a migração da Fase 0 (20260911120000).';
END $$;

-- ----------------------------------------------------------------------------
-- BRIEFING: o que precisa de atenção, por área. Alimenta o resumo da manhã.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.carl_pendencias
WITH (security_invoker = true) AS
SELECT 'juridico'::text AS area, 'demanda_atrasada'::text AS tipo, d.id AS registro_id,
       d.title AS titulo, d.due_at AS data_ref,
       (CURRENT_DATE - d.due_at) AS dias, d.user_id
  FROM public.demands d
 WHERE d.status IN ('open','in_progress','waiting') AND d.due_at IS NOT NULL AND d.due_at < CURRENT_DATE
UNION ALL
SELECT 'juridico', 'demanda_vencendo', d.id, d.title, d.due_at,
       (d.due_at - CURRENT_DATE), d.user_id
  FROM public.demands d
 WHERE d.status IN ('open','in_progress','waiting') AND d.due_at BETWEEN CURRENT_DATE AND CURRENT_DATE + 7
UNION ALL
SELECT 'juridico', 'vigencia_vencendo', c.id, c.title, c.ends_at,
       (c.ends_at - CURRENT_DATE), c.user_id
  FROM public.contracts c
 WHERE c.status = 'signed' AND c.ends_at BETWEEN CURRENT_DATE AND CURRENT_DATE + 60
UNION ALL
SELECT 'juridico', 'rodada_parada', c.id, c.title, v.created_at::date,
       (CURRENT_DATE - v.created_at::date), c.user_id
  FROM public.contracts c
  JOIN LATERAL (SELECT created_at FROM public.contract_versions cv
                 WHERE cv.contract_id = c.id ORDER BY created_at DESC LIMIT 1) v ON true
 WHERE c.status IN ('in_review','negotiating') AND v.created_at < now() - interval '7 days';

GRANT SELECT ON public.carl_pendencias TO authenticated;
