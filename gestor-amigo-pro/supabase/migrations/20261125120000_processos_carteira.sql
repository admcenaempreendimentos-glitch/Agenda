-- ============================================================================
-- Módulo PROCESSOS (carteira com ficha) — nov/2026
--
-- Uma ficha por assunto acompanhado pelo escritório externo e uma linha do
-- tempo de andamentos (um registro por relatório mensal ou atualização avulsa).
--
-- Acesso: NÃO reaproveita a área 'juridico', que hoje alcança todos os membros.
-- Vê o módulo quem é da diretoria ou quem a diretoria incluir em
-- processos_acesso. Assunto marcado como sigiloso só aparece para a diretoria.
--
-- De propósito, estas tabelas NÃO recebem o audit_trigger() genérico: ele copia
-- a linha inteira para audit_log, legível por quem a criou, o que furaria o
-- sigilo. Ficam registrados autor e data em cada linha.
--
-- Requer a Fase 0 (20260911120000). Pode ser reaplicada sem efeito colateral.
-- ============================================================================

DO $$ BEGIN
  IF to_regproc('public.org_atual') IS NULL OR to_regproc('public.e_diretoria') IS NULL
     OR to_regclass('public.membros') IS NULL THEN
    RAISE EXCEPTION 'Aplique antes a migração da Fase 0 (20260911120000).';
  END IF;
END $$;

-- ---------- quem acessa ----------
CREATE TABLE IF NOT EXISTS public.processos_acesso (
  membro_id      UUID PRIMARY KEY REFERENCES public.membros(id) ON DELETE CASCADE,
  pode_escrever  BOOLEAN NOT NULL DEFAULT false,
  concedido_por  UUID DEFAULT auth.uid(),
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.processos_acesso ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.processos_acesso FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.processos_acesso TO authenticated;
GRANT ALL ON public.processos_acesso TO service_role;

CREATE OR REPLACE FUNCTION public.acessa_processos()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.e_diretoria() OR EXISTS (
    SELECT 1 FROM public.processos_acesso a WHERE a.membro_id = public.membro_atual());
$$;

CREATE OR REPLACE FUNCTION public.escreve_processos()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.e_diretoria() OR EXISTS (
    SELECT 1 FROM public.processos_acesso a
     WHERE a.membro_id = public.membro_atual() AND a.pode_escrever);
$$;

REVOKE ALL ON FUNCTION public.acessa_processos(), public.escreve_processos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acessa_processos(), public.escreve_processos() TO authenticated, service_role;

DROP POLICY IF EXISTS "acesso leitura" ON public.processos_acesso;
CREATE POLICY "acesso leitura" ON public.processos_acesso FOR SELECT TO authenticated
  USING (public.e_diretoria() OR membro_id = public.membro_atual());
DROP POLICY IF EXISTS "acesso gestao" ON public.processos_acesso;
CREATE POLICY "acesso gestao" ON public.processos_acesso FOR ALL TO authenticated
  USING (public.e_diretoria() AND EXISTS (
           SELECT 1 FROM public.membros m WHERE m.id = membro_id AND m.org_id = public.org_atual()))
  WITH CHECK (public.e_diretoria() AND EXISTS (
           SELECT 1 FROM public.membros m WHERE m.id = membro_id AND m.org_id = public.org_atual()));

-- ---------- ficha ----------
CREATE TABLE IF NOT EXISTS public.processos (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  UUID NOT NULL REFERENCES public.organizacoes(id) ON DELETE RESTRICT,
  codigo                  TEXT NOT NULL CHECK (char_length(codigo) BETWEEN 1 AND 20),
  titulo                  TEXT NOT NULL CHECK (char_length(titulo) BETWEEN 1 AND 160),
  objeto                  TEXT CHECK (objeto IS NULL OR char_length(objeto) <= 300),
  natureza                TEXT NOT NULL DEFAULT 'judicial' CHECK (natureza IN ('judicial','administrativo')),
  -- O número é atributo, não chave: há assunto sem número, com formato de
  -- tribunal superior e que trocou de número ao longo do tempo.
  numero                  TEXT CHECK (numero IS NULL OR char_length(numero) <= 60),
  titular                 TEXT CHECK (titular IS NULL OR char_length(titular) <= 120),
  law_firm_id             UUID REFERENCES public.law_firms(id) ON DELETE SET NULL,
  situacao                TEXT NOT NULL DEFAULT 'ativo' CHECK (situacao IN ('ativo','suspenso','encerrado')),
  valor_causa_cents       BIGINT CHECK (valor_causa_cents IS NULL OR valor_causa_cents >= 0),
  chance_recebimento      TEXT CHECK (chance_recebimento IN ('alta','media','baixa','remota')),
  historico               TEXT CHECK (historico IS NULL OR char_length(historico) <= 6000),
  decisao_pendente        TEXT CHECK (decisao_pendente IS NULL OR char_length(decisao_pendente) <= 1000),
  decisao_desde           DATE,
  -- Data INFORMADA pelo escritório. O sistema não calcula prazo processual.
  proxima_data            DATE,
  proxima_data_descricao  TEXT CHECK (proxima_data_descricao IS NULL OR char_length(proxima_data_descricao) <= 300),
  proxima_data_tipo       TEXT CHECK (proxima_data_tipo IN ('compromisso_cena','prazo_outra_parte','previsao')),
  desfecho                TEXT CHECK (desfecho IS NULL OR char_length(desfecho) <= 2000),
  encerrado_em            DATE,
  sigiloso                BOOLEAN NOT NULL DEFAULT false,
  criado_por              UUID DEFAULT auth.uid(),
  criado_em               TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT processos_codigo_unico UNIQUE (org_id, codigo),
  -- Um assunto só é encerrado com o desfecho registrado.
  CONSTRAINT processos_encerra_com_desfecho
    CHECK (situacao <> 'encerrado' OR (desfecho IS NOT NULL AND btrim(desfecho) <> ''))
);
CREATE INDEX IF NOT EXISTS processos_org_situacao_idx ON public.processos(org_id, situacao);

-- ---------- linha do tempo ----------
CREATE TABLE IF NOT EXISTS public.processo_andamentos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES public.organizacoes(id) ON DELETE RESTRICT,
  processo_id   UUID NOT NULL REFERENCES public.processos(id) ON DELETE CASCADE,
  -- Mês do relatório de onde veio (dia 1). Não é a data do fato.
  competencia   DATE NOT NULL,
  -- Data do fato, quando o escritório informa.
  data_evento   DATE,
  texto         TEXT NOT NULL CHECK (char_length(texto) BETWEEN 1 AND 4000),
  sem_novidade  BOOLEAN NOT NULL DEFAULT false,
  origem        TEXT NOT NULL DEFAULT 'relatorio' CHECK (origem IN ('relatorio','email','manual')),
  criado_por    UUID DEFAULT auth.uid(),
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS processo_andamentos_proc_idx
  ON public.processo_andamentos(processo_id, competencia DESC, criado_em DESC);

-- ---------- gatilhos ----------
DROP TRIGGER IF EXISTS processos_org ON public.processos;
CREATE TRIGGER processos_org BEFORE INSERT ON public.processos
  FOR EACH ROW EXECUTE FUNCTION public.preenche_org_id();
DROP TRIGGER IF EXISTS processos_atualizado ON public.processos;
CREATE TRIGGER processos_atualizado BEFORE UPDATE ON public.processos
  FOR EACH ROW EXECUTE FUNCTION public.set_atualizado_em();
DROP TRIGGER IF EXISTS processo_andamentos_org ON public.processo_andamentos;
CREATE TRIGGER processo_andamentos_org BEFORE INSERT ON public.processo_andamentos
  FOR EACH ROW EXECUTE FUNCTION public.preenche_org_id();

-- ---------- acesso ----------
ALTER TABLE public.processos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processo_andamentos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.processos, public.processo_andamentos FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.processos, public.processo_andamentos TO authenticated;
GRANT ALL ON public.processos, public.processo_andamentos TO service_role;

DROP POLICY IF EXISTS "processos ler" ON public.processos;
CREATE POLICY "processos ler" ON public.processos FOR SELECT TO authenticated
  USING (org_id = public.org_atual() AND public.acessa_processos()
         AND (NOT sigiloso OR public.e_diretoria()));

DROP POLICY IF EXISTS "processos inserir" ON public.processos;
CREATE POLICY "processos inserir" ON public.processos FOR INSERT TO authenticated
  WITH CHECK (org_id = public.org_atual() AND public.escreve_processos()
              AND (NOT sigiloso OR public.e_diretoria())
              AND (law_firm_id IS NULL OR EXISTS (
                     SELECT 1 FROM public.law_firms l WHERE l.id = law_firm_id AND l.org_id = public.org_atual())));

DROP POLICY IF EXISTS "processos alterar" ON public.processos;
CREATE POLICY "processos alterar" ON public.processos FOR UPDATE TO authenticated
  USING (org_id = public.org_atual() AND public.escreve_processos()
         AND (NOT sigiloso OR public.e_diretoria()))
  WITH CHECK (org_id = public.org_atual() AND public.escreve_processos()
              AND (NOT sigiloso OR public.e_diretoria())
              AND (law_firm_id IS NULL OR EXISTS (
                     SELECT 1 FROM public.law_firms l WHERE l.id = law_firm_id AND l.org_id = public.org_atual())));

DROP POLICY IF EXISTS "processos apagar" ON public.processos;
CREATE POLICY "processos apagar" ON public.processos FOR DELETE TO authenticated
  USING (org_id = public.org_atual() AND public.e_diretoria());

-- Os andamentos herdam a visibilidade da ficha: a subconsulta em processos
-- já passa pelas políticas acima (inclusive o sigilo).
DROP POLICY IF EXISTS "andamentos ler" ON public.processo_andamentos;
CREATE POLICY "andamentos ler" ON public.processo_andamentos FOR SELECT TO authenticated
  USING (org_id = public.org_atual()
         AND EXISTS (SELECT 1 FROM public.processos p WHERE p.id = processo_id));

DROP POLICY IF EXISTS "andamentos inserir" ON public.processo_andamentos;
CREATE POLICY "andamentos inserir" ON public.processo_andamentos FOR INSERT TO authenticated
  WITH CHECK (org_id = public.org_atual() AND public.escreve_processos()
              AND EXISTS (SELECT 1 FROM public.processos p WHERE p.id = processo_id));

DROP POLICY IF EXISTS "andamentos alterar" ON public.processo_andamentos;
CREATE POLICY "andamentos alterar" ON public.processo_andamentos FOR UPDATE TO authenticated
  USING (org_id = public.org_atual() AND public.escreve_processos()
         AND EXISTS (SELECT 1 FROM public.processos p WHERE p.id = processo_id))
  WITH CHECK (org_id = public.org_atual() AND public.escreve_processos()
              AND EXISTS (SELECT 1 FROM public.processos p WHERE p.id = processo_id));

DROP POLICY IF EXISTS "andamentos apagar" ON public.processo_andamentos;
CREATE POLICY "andamentos apagar" ON public.processo_andamentos FOR DELETE TO authenticated
  USING (org_id = public.org_atual() AND public.e_diretoria());

-- Segundo fator: mesma regra restritiva das demais tabelas (20260905140000).
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['processos','processo_andamentos','processos_acesso'] LOOP
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
  END LOOP;
END $$;
