/*
# Calendário de prazos por período e correção de acesso do administrador

## Objetivos
1. Criar uma nova tabela `calendario_prazos` que permite cadastrar períodos
   (data inicial e data final) por perfil ou grupo de usuários, substituindo
   a limitação de apenas dias corridos.
2. Expandir a permissão de configuração de prazos para admin, coordenacao e pedagogia.
3. Preservar a tabela `dashboard_config_prazos` existente (prazos de tramitação em dias).
4. Registrar histórico de alterações dos períodos.

## Novas tabelas
- `calendario_prazos`: períodos de vigência por perfil/equipe/usuário.
  - `id` (uuid, PK)
  - `perfil_alvo` (text): 'docente', 'pedagogia', 'coordenacao' — qual equipe o período se aplica
  - `finalidade` (text): 'envio_docente', 'analise_pedagogica', 'analise_coordenacao'
  - `data_inicio` (date): início do período
  - `data_fim` (date): fim do período
  - `usuarios_ids` (uuid[]): usuários específicos selecionados (vazio = toda a equipe)
  - `criado_por` (uuid): quem criou
  - `criado_at` (timestamptz): quando criou
  - `atualizado_em` (timestamptz): última alteração
  - `ativo` (boolean): se o período está ativo

- `calendario_prazos_historico`: log de alterações.
  - `id` (uuid, PK)
  - `calendario_id` (uuid, FK)
  - `acao` (text): 'criacao', 'edicao', 'desativacao'
  - `alterado_por` (uuid)
  - `alterado_em` (timestamptz)
  - `snapshot` (jsonb): estado no momento da alteração

## Segurança
- RLS habilitada em ambas as tabelas.
- SELECT em `calendario_prazos`: todos os autenticados podem ver.
- INSERT/UPDATE/DELETE em `calendario_prazos`: apenas admin, coordenacao e pedagogia.
- SELECT em `calendario_prazos_historico`: todos os autenticados.
- INSERT em `calendario_prazos_historico`: apenas via trigger (service_role).
- `dashboard_config_prazos`: RLS ampliada de admin-only para admin/coordenacao/pedagogia.
*/

-- ============================================================
-- Tabela: calendario_prazos
-- ============================================================
CREATE TABLE IF NOT EXISTS public.calendario_prazos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  perfil_alvo text NOT NULL CHECK (perfil_alvo IN ('docente', 'pedagogia', 'coordenacao')),
  finalidade text NOT NULL CHECK (finalidade IN ('envio_docente', 'analise_pedagogica', 'analise_coordenacao')),
  data_inicio date NOT NULL,
  data_fim date NOT NULL,
  usuarios_ids uuid[] NOT NULL DEFAULT '{}',
  criado_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  criado_at timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  ativo boolean NOT NULL DEFAULT true,
  CONSTRAINT calendario_prazos_data_valida CHECK (data_fim >= data_inicio)
);

CREATE INDEX IF NOT EXISTS calendario_prazos_perfil_idx ON public.calendario_prazos (perfil_alvo, ativo);
CREATE INDEX IF NOT EXISTS calendario_prazos_datas_idx ON public.calendario_prazos (data_inicio, data_fim);

ALTER TABLE public.calendario_prazos ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.calendario_prazos TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.calendario_prazos TO authenticated;

DROP POLICY IF EXISTS "select_calendario_prazos" ON public.calendario_prazos;
CREATE POLICY "select_calendario_prazos"
ON public.calendario_prazos FOR SELECT
TO authenticated USING (true);

DROP POLICY IF EXISTS "manage_calendario_prazos_gestores" ON public.calendario_prazos;
CREATE POLICY "manage_calendario_prazos_gestores"
ON public.calendario_prazos FOR ALL
TO authenticated
USING (public.current_profile_role() IN ('admin', 'coordenacao', 'pedagogia'))
WITH CHECK (public.current_profile_role() IN ('admin', 'coordenacao', 'pedagogia'));

-- ============================================================
-- Tabela: calendario_prazos_historico
-- ============================================================
CREATE TABLE IF NOT EXISTS public.calendario_prazos_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  calendario_id uuid NOT NULL REFERENCES public.calendario_prazos(id) ON DELETE CASCADE,
  acao text NOT NULL CHECK (acao IN ('criacao', 'edicao', 'desativacao')),
  alterado_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  alterado_em timestamptz NOT NULL DEFAULT now(),
  snapshot jsonb
);

CREATE INDEX IF NOT EXISTS calendario_prazos_hist_idx ON public.calendario_prazos_historico (calendario_id, alterado_em DESC);

ALTER TABLE public.calendario_prazos_historico ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.calendario_prazos_historico TO authenticated;
GRANT INSERT ON public.calendario_prazos_historico TO service_role;

DROP POLICY IF EXISTS "select_calendario_prazos_hist" ON public.calendario_prazos_historico;
CREATE POLICY "select_calendario_prazos_hist"
ON public.calendario_prazos_historico FOR SELECT
TO authenticated USING (true);

-- ============================================================
-- Trigger: registrar alterações no histórico
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_calendario_prazos_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.calendario_prazos_historico (calendario_id, acao, alterado_por, snapshot)
    VALUES (NEW.id, 'criacao', NEW.criado_por, to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.calendario_prazos_historico (calendario_id, acao, alterado_por, snapshot)
    VALUES (NEW.id, 'edicao', auth.uid(), to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.calendario_prazos_historico (calendario_id, acao, alterado_por, snapshot)
    VALUES (OLD.id, 'desativacao', auth.uid(), to_jsonb(OLD));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_calendario_prazos_audit() FROM PUBLIC, anon;
-- Trigger roda como SECURITY DEFINER (service_role), não precisa de GRANT para authenticated

DROP TRIGGER IF EXISTS trg_calendario_prazos_audit ON public.calendario_prazos;
CREATE TRIGGER trg_calendario_prazos_audit
AFTER INSERT OR UPDATE OR DELETE ON public.calendario_prazos
FOR EACH ROW EXECUTE FUNCTION public.fn_calendario_prazos_audit();

-- ============================================================
-- Ampliar RLS de dashboard_config_prazos para incluir coordenacao e pedagogia
-- ============================================================
DROP POLICY IF EXISTS "admin_manage_config_prazos" ON public.dashboard_config_prazos;
CREATE POLICY "gestores_manage_config_prazos"
ON public.dashboard_config_prazos FOR ALL
TO authenticated
USING (public.current_profile_role() IN ('admin', 'coordenacao', 'pedagogia'))
WITH CHECK (public.current_profile_role() IN ('admin', 'coordenacao', 'pedagogia'));

-- ============================================================
-- Função: verificar sobreposição de períodos
-- ============================================================
CREATE OR REPLACE FUNCTION public.verificar_sobreposicao_periodo(
  p_perfil_alvo text,
  p_finalidade text,
  p_data_inicio date,
  p_data_fim date,
  p_excluir_id uuid DEFAULT NULL,
  p_usuarios_ids uuid[] DEFAULT '{}'
)
RETURNS TABLE(id uuid, data_inicio date, data_fim date, usuarios_ids uuid[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT c.id, c.data_inicio, c.data_fim, c.usuarios_ids
  FROM public.calendario_prazos c
  WHERE c.perfil_alvo = p_perfil_alvo
    AND c.finalidade = p_finalidade
    AND c.ativo = true
    AND (p_excluir_id IS NULL OR c.id <> p_excluir_id)
    AND c.data_inicio <= p_data_fim
    AND c.data_fim >= p_data_inicio
    AND (
      array_length(p_usuarios_ids, 1) IS NULL
      OR array_length(c.usuarios_ids, 1) IS NULL
      OR c.usuarios_ids && p_usuarios_ids
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.verificar_sobreposicao_periodo(text, text, date, date, uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verificar_sobreposicao_periodo(text, text, date, date, uuid, uuid[]) TO authenticated;
