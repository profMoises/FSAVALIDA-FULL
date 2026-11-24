/*
# Relatório de Acessos e Logins — tabela de eventos de login

## Objetivo
Criar estrutura para registrar eventos de login bem-sucedidos e permitir
relatórios de acesso para administradores.

## Nova tabela: login_eventos
- `id` (uuid, PK)
- `user_id` (uuid, FK auth.users) — usuário que fez login
- `email` (text) — email no momento do login
- `sucesso` (boolean, default true) — se o login foi bem-sucedido
- `criado_em` (timestamptz) — data/hora do evento
- `user_agent` (text) — navegador/dispositivo (opcional)
- `ip_origem` (text) — IP de origem (opcional)

## Segurança
- RLS habilitada: SELECT apenas para admin; INSERT apenas via service_role (Edge Function)
- Usuários comuns não podem ler nem modificar eventos de login
- A Edge Function usa SUPABASE_SERVICE_ROLE_KEY para inserir registros

## Notas
- auth.users.last_sign_in_at já existe e é usado como fonte complementar
- Esta tabela permite histórico detalhado e relatórios por período
- Não registra senhas, tokens ou credenciais
*/

CREATE TABLE IF NOT EXISTS public.login_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  sucesso boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  user_agent text,
  ip_origem text
);

CREATE INDEX IF NOT EXISTS login_eventos_user_idx ON public.login_eventos (user_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS login_eventos_data_idx ON public.login_eventos (criado_em DESC);

ALTER TABLE public.login_eventos ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.login_eventos TO authenticated;
GRANT INSERT ON public.login_eventos TO service_role;

DROP POLICY IF EXISTS "admin_select_login_eventos" ON public.login_eventos;
CREATE POLICY "admin_select_login_eventos"
ON public.login_eventos FOR SELECT
TO authenticated
USING (public.current_profile_role() = 'admin');

-- Apenas service_role pode inserir (Edge Function)
-- Não há política INSERT para authenticated — service_role bypassa RLS

-- ============================================================
-- Função: relatorio_acessos — gera dados para o relatório
-- Acessa auth.users via SECURITY DEFINER (service_role)
-- ============================================================
CREATE OR REPLACE FUNCTION public.relatorio_acessos(
  p_perfil text DEFAULT NULL,
  p_data_inicio timestamptz DEFAULT NULL,
  p_data_fim timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_resultado jsonb;
BEGIN
  IF public.current_profile_role() != 'admin' THEN
    RAISE EXCEPTION 'Apenas administradores podem gerar relatórios de acesso.';
  END IF;

  WITH
  usuarios_filtrados AS (
    SELECT
      p.id, p.nome, p.email, p.perfil, p.created_at,
      au.last_sign_in_at,
      au.raw_user_meta_data->>'email_verified' AS email_verified,
      COALESCE(
        (SELECT string_agg(pt.nome, ', ')
         FROM public.profile_pastas pp
         JOIN public.pastas pt ON pt.id = pp.pasta_id
         WHERE pp.profile_id = p.id),
        CASE WHEN p.perfil = 'admin' THEN 'Todas as pastas' END,
        'Sem vínculo'
      ) AS vinculo
    FROM public.profiles p
    LEFT JOIN auth.users au ON au.id = p.id
    WHERE (p_perfil IS NULL OR p.perfil = p_perfil)
  ),
  total_cadastrados AS (
    SELECT count(*)::int AS total FROM usuarios_filtrados
  ),
  ja_logaram AS (
    SELECT count(*)::int AS total
    FROM usuarios_filtrados
    WHERE last_sign_in_at IS NOT NULL
  ),
  nunca_logaram AS (
    SELECT count(*)::int AS total
    FROM usuarios_filtrados
    WHERE last_sign_in_at IS NULL
  ),
  sem_acesso_periodo AS (
    SELECT count(*)::int AS total
    FROM usuarios_filtrados
    WHERE last_sign_in_at IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.login_eventos le
        WHERE le.user_id = usuarios_filtrados.id
          AND le.sucesso = true
          AND (p_data_inicio IS NULL OR le.criado_em >= p_data_inicio)
          AND (p_data_fim IS NULL OR le.criado_em <= p_data_fim)
      )
      AND (
        p_data_inicio IS NOT NULL OR p_data_fim IS NOT NULL
      )
  ),
  acessos_no_periodo AS (
    SELECT count(DISTINCT le.user_id)::int AS total
    FROM public.login_eventos le
    JOIN usuarios_filtrados uf ON uf.id = le.user_id
    WHERE le.sucesso = true
      AND (p_data_inicio IS NULL OR le.criado_em >= p_data_inicio)
      AND (p_data_fim IS NULL OR le.criado_em <= p_data_fim)
  ),
  detalhe_usuarios AS (
    SELECT jsonb_agg(jsonb_build_object(
      'id', uf.id,
      'nome', uf.nome,
      'email', uf.email,
      'perfil', uf.perfil,
      'vinculo', uf.vinculo,
      'created_at', to_char(uf.created_at, 'DD/MM/YYYY'),
      'last_sign_in_at', CASE WHEN uf.last_sign_in_at IS NOT NULL THEN to_char(uf.last_sign_in_at, 'DD/MM/YYYY HH24:MI') END,
      'ja_logou', uf.last_sign_in_at IS NOT NULL,
      'total_acessos', (
        SELECT count(*)::int FROM public.login_eventos le
        WHERE le.user_id = uf.id AND le.sucesso = true
      ),
      'primeiro_login', (
        SELECT to_char(MIN(le.criado_em), 'DD/MM/YYYY HH24:MI')
        FROM public.login_eventos le
        WHERE le.user_id = uf.id AND le.sucesso = true
      ),
      'ultimo_login', (
        SELECT to_char(MAX(le.criado_em), 'DD/MM/YYYY HH24:MI')
        FROM public.login_eventos le
        WHERE le.user_id = uf.id AND le.sucesso = true
      ),
      'acessos_no_periodo', (
        SELECT count(*)::int FROM public.login_eventos le
        WHERE le.user_id = uf.id AND le.sucesso = true
          AND (p_data_inicio IS NULL OR le.criado_em >= p_data_inicio)
          AND (p_data_fim IS NULL OR le.criado_em <= p_data_fim)
      ),
      'email_verified', uf.email_verified IS NOT NULL,
      'dias_desde_ultimo', CASE WHEN uf.last_sign_in_at IS NOT NULL THEN
        EXTRACT(DAY FROM (now() - uf.last_sign_in_at))::int
      END
    ) ORDER BY uf.nome) AS dados
    FROM usuarios_filtrados uf
  ),
  historico_logins AS (
    SELECT jsonb_agg(jsonb_build_object(
      'nome', uf.nome,
      'email', uf.email,
      'perfil', uf.perfil,
      'data_hora', to_char(le.criado_em, 'DD/MM/YYYY HH24:MI'),
      'user_agent', le.user_agent
    ) ORDER BY le.criado_em DESC) AS dados
    FROM public.login_eventos le
    JOIN usuarios_filtrados uf ON uf.id = le.user_id
    WHERE le.sucesso = true
      AND (p_data_inicio IS NULL OR le.criado_em >= p_data_inicio)
      AND (p_data_fim IS NULL OR le.criado_em <= p_data_fim)
  )
  SELECT jsonb_build_object(
    'resumo', jsonb_build_object(
      'total_cadastrados', (SELECT total FROM total_cadastrados),
      'ja_logaram', (SELECT total FROM ja_logaram),
      'nunca_logaram', (SELECT total FROM nunca_logaram),
      'sem_acesso_periodo', (SELECT total FROM sem_acesso_periodo),
      'acessos_no_periodo', (SELECT total FROM acessos_no_periodo)
    ),
    'usuarios', COALESCE((SELECT dados FROM detalhe_usuarios), '[]'::jsonb),
    'historico', COALESCE((SELECT dados FROM historico_logins), '[]'::jsonb)
  ) INTO v_resultado;

  RETURN v_resultado;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.relatorio_acessos(text, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.relatorio_acessos(text, timestamptz, timestamptz) TO authenticated;
