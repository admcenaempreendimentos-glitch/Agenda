-- ============================================================================
-- Blindagem — segunda onda (set/2026)
--  A) Trilha de auditoria por trigger (imune ao cliente): todo INSERT/UPDATE/
--     DELETE nas tabelas jurídicas é registrado com autor, antes e depois.
--  B) Rate limit distribuído para a API do assistente (vale em todas as
--     instâncias serverless).
-- Aplicar no SQL Editor do Supabase após 20260905120000_hardening_seguranca.sql.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- A) TRILHA DE AUDITORIA
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_log (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor       UUID,                       -- quem executou (auth.uid()); NULL = service role/migração
  owner_id    UUID,                       -- dono do registro afetado (user_id da linha)
  table_name  TEXT NOT NULL,
  row_id      UUID,
  action      TEXT NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
  old_data    JSONB,
  new_data    JSONB
);
CREATE INDEX IF NOT EXISTS audit_log_owner_time_idx ON public.audit_log(owner_id, at DESC);
CREATE INDEX IF NOT EXISTS audit_log_row_idx ON public.audit_log(table_name, row_id);

-- Usuário só LÊ a própria trilha; ninguém além do trigger (SECURITY DEFINER) escreve.
REVOKE ALL ON public.audit_log FROM anon, authenticated;
GRANT SELECT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own audit_log read" ON public.audit_log;
CREATE POLICY "own audit_log read" ON public.audit_log
  FOR SELECT TO authenticated USING (owner_id = auth.uid());

CREATE OR REPLACE FUNCTION public.audit_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_old JSONB; v_new JSONB; v_owner UUID; v_row UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_old := to_jsonb(OLD);
  ELSIF TG_OP = 'INSERT' THEN
    v_new := to_jsonb(NEW);
  ELSE
    v_old := to_jsonb(OLD); v_new := to_jsonb(NEW);
  END IF;
  v_owner := COALESCE((v_new->>'user_id')::uuid, (v_old->>'user_id')::uuid);
  v_row   := COALESCE((v_new->>'id')::uuid,      (v_old->>'id')::uuid);
  INSERT INTO public.audit_log(actor, owner_id, table_name, row_id, action, old_data, new_data)
  VALUES (auth.uid(), v_owner, TG_TABLE_NAME, v_row, TG_OP, v_old, v_new);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.audit_trigger() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['contracts','contract_versions','contract_reviews','demands','demand_updates','demand_attachments','law_firms']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_audit', t);
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_trigger()', t || '_audit', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- B) RATE LIMIT DISTRIBUÍDO
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.api_rate_limits (
  bucket       TEXT PRIMARY KEY,
  hits         INTEGER NOT NULL,
  window_start TIMESTAMPTZ NOT NULL
);
REVOKE ALL ON public.api_rate_limits FROM anon, authenticated;
GRANT ALL ON public.api_rate_limits TO service_role;
ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY; -- sem políticas: só a função acessa

-- Retorna TRUE se a requisição está dentro do limite; FALSE se excedeu.
-- Chave = escopo + usuário autenticado. Janela deslizante simples por bucket.
CREATE OR REPLACE FUNCTION public.rate_limit_hit(p_scope TEXT, p_limit INTEGER, p_window_seconds INTEGER)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  k TEXT;
  v_hits INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN RETURN FALSE; END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_window_seconds IS NULL OR p_window_seconds < 1 THEN RETURN FALSE; END IF;
  k := left(coalesce(p_scope, 'default'), 40) || ':' || auth.uid()::text;
  INSERT INTO public.api_rate_limits(bucket, hits, window_start)
  VALUES (k, 1, now())
  ON CONFLICT (bucket) DO UPDATE SET
    hits = CASE WHEN public.api_rate_limits.window_start < now() - make_interval(secs => p_window_seconds)
                THEN 1 ELSE public.api_rate_limits.hits + 1 END,
    window_start = CASE WHEN public.api_rate_limits.window_start < now() - make_interval(secs => p_window_seconds)
                        THEN now() ELSE public.api_rate_limits.window_start END
  RETURNING hits INTO v_hits;
  RETURN v_hits <= p_limit;
END $$;
REVOKE ALL ON FUNCTION public.rate_limit_hit(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rate_limit_hit(TEXT, INTEGER, INTEGER) TO authenticated;

-- Limpeza periódica opcional (pg_cron, se habilitado):
-- SELECT cron.schedule('limpa_rate_limits', '17 * * * *',
--   $$DELETE FROM public.api_rate_limits WHERE window_start < now() - interval '1 day'$$);
