-- ============================================================================
-- FASE 0 — BASE COMUM DO ECOSSISTEMA CENA (plano B)
--
-- O que esta migração faz:
--   A) Cria organização, membros e papéis por área (substitui o isolamento
--      por usuário, que impede dois colegas de verem o mesmo contrato).
--   B) Cria o cadastro central: pessoas, SPEs, imóveis e documentos — a
--      espinha que permitirá ao Carl ver um ativo por inteiro.
--   C) Liga o Jurídico à organização, preenchendo org_id automaticamente,
--      SEM exigir mudança no aplicativo que já está no ar.
--   D) Reescreve as políticas de acesso para organização + papel por área.
--
-- Compatibilidade: o aplicativo atual continua funcionando sem alteração.
-- As inserções seguem enviando user_id; o org_id é preenchido por gatilho.
--
-- Idempotente: pode ser executada mais de uma vez.
-- Reversível: ver o bloco "COMO REVERTER" no fim do arquivo.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A) ORGANIZAÇÃO, MEMBROS E PAPÉIS
-- ----------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE public.papel_global AS ENUM ('diretoria','gestor','colaborador');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.area_sistema AS ENUM ('juridico','comercial','locacao','patrimonial','administrativo');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.nivel_acesso AS ENUM ('sem_acesso','leitura','escrita','gestao');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.organizacoes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        TEXT NOT NULL,
  cnpj        TEXT,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.membros (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES public.organizacoes(id) ON DELETE RESTRICT,
  user_id     UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE RESTRICT,
  nome        TEXT,
  email       TEXT,
  cargo       TEXT,
  papel       public.papel_global NOT NULL DEFAULT 'colaborador',
  ativo       BOOLEAN NOT NULL DEFAULT true,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS membros_org_idx ON public.membros(org_id) WHERE ativo;

CREATE TABLE IF NOT EXISTS public.membro_areas (
  membro_id   UUID NOT NULL REFERENCES public.membros(id) ON DELETE CASCADE,
  area        public.area_sistema NOT NULL,
  nivel       public.nivel_acesso NOT NULL DEFAULT 'leitura',
  PRIMARY KEY (membro_id, area)
);

-- ----------------------------------------------------------------------------
-- Funções de apoio. STABLE + SECURITY DEFINER para poderem ser usadas dentro
-- das próprias políticas de acesso sem recursão.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.org_atual()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT org_id FROM public.membros WHERE user_id = auth.uid() AND ativo LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.membro_atual()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.membros WHERE user_id = auth.uid() AND ativo LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.e_diretoria()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.membros WHERE user_id = auth.uid() AND ativo AND papel = 'diretoria');
$$;

-- Nível efetivo do usuário numa área. Diretoria tem gestão em tudo.
CREATE OR REPLACE FUNCTION public.nivel_na_area(p_area public.area_sistema)
RETURNS public.nivel_acesso LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN public.e_diretoria() THEN 'gestao'::public.nivel_acesso
    ELSE COALESCE(
      (SELECT ma.nivel FROM public.membro_areas ma
         JOIN public.membros m ON m.id = ma.membro_id
        WHERE m.user_id = auth.uid() AND m.ativo AND ma.area = p_area
        LIMIT 1),
      'sem_acesso'::public.nivel_acesso)
  END;
$$;

CREATE OR REPLACE FUNCTION public.pode_ler(p_area public.area_sistema)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.nivel_na_area(p_area) IN ('leitura','escrita','gestao');
$$;

CREATE OR REPLACE FUNCTION public.pode_escrever(p_area public.area_sistema)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.nivel_na_area(p_area) IN ('escrita','gestao');
$$;

CREATE OR REPLACE FUNCTION public.pode_gerir(p_area public.area_sistema)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.nivel_na_area(p_area) = 'gestao';
$$;

REVOKE ALL ON FUNCTION public.org_atual(), public.membro_atual(), public.e_diretoria(),
                       public.nivel_na_area(public.area_sistema), public.pode_ler(public.area_sistema),
                       public.pode_escrever(public.area_sistema), public.pode_gerir(public.area_sistema)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.org_atual(), public.membro_atual(), public.e_diretoria(),
                          public.nivel_na_area(public.area_sistema), public.pode_ler(public.area_sistema),
                          public.pode_escrever(public.area_sistema), public.pode_gerir(public.area_sistema)
  TO authenticated;

-- ----------------------------------------------------------------------------
-- Semeadura: cria a organização e transforma os usuários atuais em membros
-- com acesso de gestão ao Jurídico (é o que eles já tinham na prática).
-- ----------------------------------------------------------------------------

INSERT INTO public.organizacoes (nome, cnpj)
SELECT 'Cena Empreendimentos', NULL
WHERE NOT EXISTS (SELECT 1 FROM public.organizacoes);

INSERT INTO public.membros (org_id, user_id, email, papel)
SELECT (SELECT id FROM public.organizacoes ORDER BY criado_em LIMIT 1), u.id, u.email, 'colaborador'
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.membros m WHERE m.user_id = u.id);

INSERT INTO public.membro_areas (membro_id, area, nivel)
SELECT m.id, 'juridico', 'gestao'
FROM public.membros m
WHERE NOT EXISTS (SELECT 1 FROM public.membro_areas ma WHERE ma.membro_id = m.id AND ma.area = 'juridico');

-- Novos usuários convidados viram membros automaticamente, sem acesso a área
-- nenhuma até o administrador conceder (princípio do menor privilégio).
CREATE OR REPLACE FUNCTION public.novo_usuario_vira_membro()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.membros (org_id, user_id, email, papel)
  VALUES ((SELECT id FROM public.organizacoes ORDER BY criado_em LIMIT 1), NEW.id, NEW.email, 'colaborador')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS novo_usuario_vira_membro ON auth.users;
CREATE TRIGGER novo_usuario_vira_membro AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.novo_usuario_vira_membro();

-- Acesso às próprias tabelas de organização.
GRANT SELECT ON public.organizacoes, public.membros, public.membro_areas TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.membros, public.membro_areas TO authenticated;
GRANT ALL ON public.organizacoes, public.membros, public.membro_areas TO service_role;

ALTER TABLE public.organizacoes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.membros       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.membro_areas  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org visivel" ON public.organizacoes;
CREATE POLICY "org visivel" ON public.organizacoes FOR SELECT TO authenticated
  USING (id = public.org_atual());

DROP POLICY IF EXISTS "membros visiveis" ON public.membros;
CREATE POLICY "membros visiveis" ON public.membros FOR SELECT TO authenticated
  USING (org_id = public.org_atual());

-- Só a diretoria administra membros e permissões.
DROP POLICY IF EXISTS "membros administraveis" ON public.membros;
CREATE POLICY "membros administraveis" ON public.membros FOR ALL TO authenticated
  USING (org_id = public.org_atual() AND public.e_diretoria())
  WITH CHECK (org_id = public.org_atual() AND public.e_diretoria());

DROP POLICY IF EXISTS "areas visiveis" ON public.membro_areas;
CREATE POLICY "areas visiveis" ON public.membro_areas FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.membros m WHERE m.id = membro_id AND m.org_id = public.org_atual()));

DROP POLICY IF EXISTS "areas administraveis" ON public.membro_areas;
CREATE POLICY "areas administraveis" ON public.membro_areas FOR ALL TO authenticated
  USING (public.e_diretoria() AND EXISTS (SELECT 1 FROM public.membros m WHERE m.id = membro_id AND m.org_id = public.org_atual()))
  WITH CHECK (public.e_diretoria() AND EXISTS (SELECT 1 FROM public.membros m WHERE m.id = membro_id AND m.org_id = public.org_atual()));

-- ----------------------------------------------------------------------------
-- B) CADASTRO CENTRAL — a espinha do ecossistema
--    pessoas · SPEs · imóveis · documentos
--    Cadastrados uma vez, referenciados por todos os domínios.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.pessoas (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES public.organizacoes(id) ON DELETE RESTRICT,
  tipo          TEXT NOT NULL DEFAULT 'fisica' CHECK (tipo IN ('fisica','juridica')),
  nome          TEXT NOT NULL,
  documento     TEXT,                    -- CPF ou CNPJ, só dígitos
  email         TEXT,
  telefone      TEXT,
  papeis        TEXT[] NOT NULL DEFAULT '{}',  -- inquilino, comprador, permutante, fornecedor, escritorio…
  observacoes   TEXT,
  criado_por    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pessoas_org_nome_idx ON public.pessoas(org_id, nome);
CREATE UNIQUE INDEX IF NOT EXISTS pessoas_org_doc_idx ON public.pessoas(org_id, documento) WHERE documento IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.spes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES public.organizacoes(id) ON DELETE RESTRICT,
  nome          TEXT NOT NULL,
  cnpj          TEXT,
  situacao      TEXT NOT NULL DEFAULT 'ativa' CHECK (situacao IN ('ativa','encerrada','em_constituicao')),
  participacao  JSONB NOT NULL DEFAULT '{}'::jsonb,  -- { "socio": percentual }
  observacoes   TEXT,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS spes_org_idx ON public.spes(org_id);

CREATE TABLE IF NOT EXISTS public.imoveis (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES public.organizacoes(id) ON DELETE RESTRICT,
  spe_id        UUID REFERENCES public.spes(id) ON DELETE SET NULL,
  codigo        TEXT,                    -- código interno da Cena
  nome          TEXT NOT NULL,           -- "Sala 402 · Edifício Hoepcke"
  tipo          TEXT CHECK (tipo IN ('apartamento','sala','loja','terreno','casa','galpao','vaga','outro')),
  empreendimento TEXT,
  endereco      TEXT,
  cidade        TEXT DEFAULT 'Florianópolis',
  uf            TEXT DEFAULT 'SC',
  matricula     TEXT,
  cartorio      TEXT,
  area_privativa_m2 NUMERIC(10,2) CHECK (area_privativa_m2 IS NULL OR area_privativa_m2 >= 0),
  area_total_m2     NUMERIC(10,2) CHECK (area_total_m2 IS NULL OR area_total_m2 >= 0),
  situacao      TEXT NOT NULL DEFAULT 'disponivel'
                CHECK (situacao IN ('disponivel','locado','vendido','reservado','em_obra','uso_proprio','permutado')),
  observacoes   TEXT,
  criado_por    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS imoveis_org_idx ON public.imoveis(org_id);
CREATE INDEX IF NOT EXISTS imoveis_spe_idx ON public.imoveis(spe_id);
CREATE UNIQUE INDEX IF NOT EXISTS imoveis_org_codigo_idx ON public.imoveis(org_id, codigo) WHERE codigo IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.documentos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES public.organizacoes(id) ON DELETE RESTRICT,
  imovel_id     UUID REFERENCES public.imoveis(id) ON DELETE CASCADE,
  pessoa_id     UUID REFERENCES public.pessoas(id) ON DELETE CASCADE,
  spe_id        UUID REFERENCES public.spes(id) ON DELETE CASCADE,
  area          public.area_sistema NOT NULL DEFAULT 'juridico',
  titulo        TEXT NOT NULL,
  tipo          TEXT,                    -- matricula, iptu, contrato, laudo, foto…
  storage_path  TEXT,
  sharepoint_url TEXT,
  criado_por    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS documentos_imovel_idx ON public.documentos(imovel_id);
CREATE INDEX IF NOT EXISTS documentos_org_area_idx ON public.documentos(org_id, area);

-- ----------------------------------------------------------------------------
-- C) LIGAR O JURÍDICO À ORGANIZAÇÃO E AO CADASTRO CENTRAL
-- ----------------------------------------------------------------------------

-- org_id em todas as tabelas do domínio, preenchido por gatilho.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['law_firms','contracts','contract_versions','contract_reviews',
                           'demands','demand_updates','demand_attachments','integration_settings','ai_messages']
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizacoes(id) ON DELETE RESTRICT', t);
      EXECUTE format('UPDATE public.%I SET org_id = (SELECT id FROM public.organizacoes ORDER BY criado_em LIMIT 1) WHERE org_id IS NULL', t);
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(org_id)', t || '_org_idx', t);
    END IF;
  END LOOP;
END $$;

-- Gatilho que preenche org_id sozinho: o aplicativo atual não precisa mudar.
CREATE OR REPLACE FUNCTION public.preenche_org_id()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    NEW.org_id := COALESCE(public.org_atual(), (SELECT id FROM public.organizacoes ORDER BY criado_em LIMIT 1));
  END IF;
  RETURN NEW;
END $$;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['law_firms','contracts','contract_versions','contract_reviews',
                           'demands','demand_updates','demand_attachments','integration_settings','ai_messages',
                           'pessoas','spes','imoveis','documentos']
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_org', t);
      EXECUTE format('CREATE TRIGGER %I BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.preenche_org_id()', t || '_org', t);
    END IF;
  END LOOP;
END $$;

-- Ligação do Jurídico com a espinha: contratos e demandas passam a poder
-- apontar para o imóvel e a pessoa do cadastro central.
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS imovel_id UUID REFERENCES public.imoveis(id) ON DELETE SET NULL;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS pessoa_id UUID REFERENCES public.pessoas(id) ON DELETE SET NULL;
ALTER TABLE public.demands   ADD COLUMN IF NOT EXISTS imovel_id UUID REFERENCES public.imoveis(id) ON DELETE SET NULL;
ALTER TABLE public.demands   ADD COLUMN IF NOT EXISTS pessoa_id UUID REFERENCES public.pessoas(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS contracts_imovel_idx ON public.contracts(imovel_id) WHERE imovel_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS demands_imovel_idx   ON public.demands(imovel_id)   WHERE imovel_id IS NOT NULL;

-- Escritórios de advocacia também são pessoas jurídicas do cadastro central.
ALTER TABLE public.law_firms ADD COLUMN IF NOT EXISTS pessoa_id UUID REFERENCES public.pessoas(id) ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- D) POLÍTICAS: de "só o dono" para "a organização, conforme o papel"
--    Mantém a política restritiva de MFA criada na blindagem de segurança.
-- ----------------------------------------------------------------------------

-- Remove SOMENTE as políticas de posse individual que este projeto criou.
-- Políticas com outros nomes (criadas por outra pessoa ou ferramenta) são
-- PRESERVADAS e apenas listadas no aviso, para revisão humana. Isso evita que
-- esta migração desfaça, sem querer, trabalho feito direto no painel.
DO $$
DECLARE t TEXT; pol TEXT; conhecidas TEXT[]; restantes TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['law_firms','contracts','contract_versions','contract_reviews',
                           'demands','demand_updates','demand_attachments','integration_settings','ai_messages']
  LOOP
    conhecidas := ARRAY[
      'own ' || t, 'Users manage their own integration settings',
      'juridico leitura','juridico insercao','juridico alteracao','juridico exclusao',
      'minhas conversas','minhas integracoes'];
    FOREACH pol IN ARRAY conhecidas LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol, t);
    END LOOP;

    SELECT string_agg(policyname, ', ') INTO restantes
      FROM pg_policies
     WHERE schemaname = 'public' AND tablename = t
       AND policyname <> 'exige mfa' AND NOT (policyname = ANY (conhecidas));
    IF restantes IS NOT NULL THEN
      RAISE NOTICE 'ATENCAO: a tabela % tem politicas nao reconhecidas, mantidas intactas: %. Revise se conflitam com o modelo de organizacao.', t, restantes;
    END IF;
  END LOOP;
END $$;

-- Jurídico: leitura para quem tem acesso à área; escrita para quem tem escrita.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['law_firms','contracts','contract_versions','contract_reviews',
                           'demands','demand_updates','demand_attachments']
  LOOP
    EXECUTE format($p$
      CREATE POLICY "juridico leitura" ON public.%I FOR SELECT TO authenticated
        USING (org_id = public.org_atual() AND public.pode_ler('juridico'))$p$, t);
    EXECUTE format($p$
      CREATE POLICY "juridico insercao" ON public.%I FOR INSERT TO authenticated
        WITH CHECK (org_id = public.org_atual() AND public.pode_escrever('juridico'))$p$, t);
    EXECUTE format($p$
      CREATE POLICY "juridico alteracao" ON public.%I FOR UPDATE TO authenticated
        USING (org_id = public.org_atual() AND public.pode_escrever('juridico'))
        WITH CHECK (org_id = public.org_atual() AND public.pode_escrever('juridico'))$p$, t);
    EXECUTE format($p$
      CREATE POLICY "juridico exclusao" ON public.%I FOR DELETE TO authenticated
        USING (org_id = public.org_atual() AND public.pode_escrever('juridico'))$p$, t);
  END LOOP;
END $$;

-- Conversas com o Carl e integrações continuam privadas de cada pessoa.
CREATE POLICY "minhas conversas" ON public.ai_messages FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "minhas integracoes" ON public.integration_settings FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Cadastro central: todo membro lê; escreve quem tem escrita em alguma área.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['pessoas','spes','imoveis']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('DROP POLICY IF EXISTS "core leitura" ON public.%I', t);
    EXECUTE format($p$
      CREATE POLICY "core leitura" ON public.%I FOR SELECT TO authenticated
        USING (org_id = public.org_atual())$p$, t);
    EXECUTE format('DROP POLICY IF EXISTS "core escrita" ON public.%I', t);
    EXECUTE format($p$
      CREATE POLICY "core escrita" ON public.%I FOR ALL TO authenticated
        USING (org_id = public.org_atual() AND (
                 public.pode_escrever('juridico') OR public.pode_escrever('comercial') OR
                 public.pode_escrever('locacao')  OR public.pode_escrever('patrimonial')))
        WITH CHECK (org_id = public.org_atual() AND (
                 public.pode_escrever('juridico') OR public.pode_escrever('comercial') OR
                 public.pode_escrever('locacao')  OR public.pode_escrever('patrimonial')))$p$, t);
  END LOOP;
END $$;

-- Documentos respeitam a área a que pertencem.
ALTER TABLE public.documentos ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documentos TO authenticated;
GRANT ALL ON public.documentos TO service_role;
DROP POLICY IF EXISTS "documentos leitura" ON public.documentos;
CREATE POLICY "documentos leitura" ON public.documentos FOR SELECT TO authenticated
  USING (org_id = public.org_atual() AND public.pode_ler(area));
DROP POLICY IF EXISTS "documentos escrita" ON public.documentos;
CREATE POLICY "documentos escrita" ON public.documentos FOR ALL TO authenticated
  USING (org_id = public.org_atual() AND public.pode_escrever(area))
  WITH CHECK (org_id = public.org_atual() AND public.pode_escrever(area));

-- Atualização automática de atualizado_em.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['membros','pessoas','spes','imoveis']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_touch', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t || '_touch', t);
  END LOOP;
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE 'set_updated_at() não encontrada; gatilhos de atualizado_em não criados.';
END $$;

-- Trilha de auditoria também nas tabelas novas (função criada na blindagem).
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['pessoas','spes','imoveis','documentos','membros','membro_areas']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_audit', t);
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_trigger()', t || '_audit', t);
  END LOOP;
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE 'audit_trigger() não encontrada; aplique antes a migração 20260905130000.';
END $$;

-- ----------------------------------------------------------------------------
-- VISÃO 360: um imóvel visto por todos os domínios de uma vez.
-- É o que permite ao Carl responder cruzando áreas.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.visao_imovel
WITH (security_invoker = true) AS
SELECT
  i.id, i.org_id, i.codigo, i.nome, i.empreendimento, i.tipo, i.situacao,
  i.endereco, i.cidade, i.uf, i.matricula, i.area_privativa_m2,
  s.nome AS spe,
  (SELECT count(*) FROM public.contracts c WHERE c.imovel_id = i.id) AS contratos,
  (SELECT count(*) FROM public.contracts c WHERE c.imovel_id = i.id AND c.status = 'signed'
     AND c.ends_at IS NOT NULL AND c.ends_at <= CURRENT_DATE + 90) AS contratos_vencendo_90d,
  (SELECT count(*) FROM public.demands d WHERE d.imovel_id = i.id
     AND d.status IN ('open','in_progress','waiting')) AS demandas_abertas,
  (SELECT count(*) FROM public.documentos dc WHERE dc.imovel_id = i.id) AS documentos
FROM public.imoveis i
LEFT JOIN public.spes s ON s.id = i.spe_id;

GRANT SELECT ON public.visao_imovel TO authenticated;

-- ============================================================================
-- COMO REVERTER (se algo sair errado)
--   As políticas antigas podem ser restauradas com:
--     DROP POLICY "juridico leitura"  ON public.<tabela>;  (e as demais)
--     CREATE POLICY "own <tabela>" ON public.<tabela> FOR ALL TO authenticated
--       USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
--   As tabelas novas podem ser removidas sem afetar o Jurídico:
--     DROP VIEW public.visao_imovel;
--     DROP TABLE public.documentos, public.imoveis, public.spes, public.pessoas CASCADE;
--   As colunas org_id/imovel_id/pessoa_id podem permanecer sem uso.
-- ============================================================================
