/*
# Função de dados do dashboard gerencial

## Objetivo
Fornecer indicadores agregados sobre planos de aula para o dashboard,
respeitando o escopo de pastas do usuário (pedagogia e coordenação veem
apenas dados das pastas vinculadas; admin vê tudo).

## Função
- `dashboard_dados(p_pasta_id, p_docente_id, p_data_inicio, p_data_fim)`:
  Retorna indicadores, planos por status, envios por docente, planos por pasta,
  evolução de envios por dia e tabela de últimos planos.

## Segurança
- SECURITY DEFINER, restrita a authenticated.
- Verifica que o caller é admin, pedagogia ou coordenacao (docentes não acessam).
- Para pedagogia e coordenacao, filtra pelas pastas autorizadas (profile_pastas).
- Admin vê todos os dados.
- Nenhum dado é gravado ou removido.
*/

CREATE OR REPLACE FUNCTION public.dashboard_dados(
  p_pasta_id uuid DEFAULT NULL,
  p_docente_id uuid DEFAULT NULL,
  p_data_inicio timestamptz DEFAULT NULL,
  p_data_fim timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_perfil text;
  v_pastas_autorizadas uuid[];
  v_resultado jsonb;
BEGIN
  v_perfil := public.current_profile_role();

  IF v_perfil = 'docente' THEN
    RAISE EXCEPTION 'Docentes não têm acesso ao dashboard.';
  END IF;

  IF v_perfil IN ('pedagogia', 'coordenacao') THEN
    SELECT COALESCE(array_agg(pp.pasta_id), '{}') INTO v_pastas_autorizadas
    FROM public.profile_pastas pp
    WHERE pp.profile_id = auth.uid();

    IF array_length(v_pastas_autorizadas, 1) IS NULL THEN
      SELECT COALESCE(array_agg(p.id), '{}') INTO v_pastas_autorizadas
      FROM public.pastas p;
    END IF;
  ELSE
    SELECT COALESCE(array_agg(p.id), '{}') INTO v_pastas_autorizadas
    FROM public.pastas p;
  END IF;

  IF p_pasta_id IS NOT NULL THEN
    v_pastas_autorizadas := ARRAY[p_pasta_id];
  END IF;

  WITH
  planos_filtrados AS (
    SELECT
      pa.id, pa.titulo, pa.docente_id, pa.pasta_id, pa.arquivo_nome,
      pa.status, pa.devolvido_por, pa.created_at, pa.updated_at,
      pa.excluido_at,
      d.nome AS docente_nome,
      pt.nome AS pasta_nome
    FROM public.planos_aula pa
    LEFT JOIN public.profiles d ON d.id = pa.docente_id
    LEFT JOIN public.pastas pt ON pt.id = pa.pasta_id
    WHERE pa.excluido_at IS NULL
      AND pa.pasta_id = ANY(v_pastas_autorizadas)
      AND (p_docente_id IS NULL OR pa.docente_id = p_docente_id)
      AND (p_data_inicio IS NULL OR pa.created_at >= p_data_inicio)
      AND (p_data_fim IS NULL OR pa.created_at <= p_data_fim)
  ),
  indicadores AS (
    SELECT
      (SELECT count(*)::int FROM public.profiles WHERE perfil = 'docente') AS total_docentes,
      (SELECT count(DISTINCT docente_id)::int FROM planos_filtrados) AS docentes_com_planos,
      (SELECT count(*)::int FROM planos_filtrados) AS total_planos,
      (SELECT count(*)::int FROM planos_filtrados WHERE status = 'validacao_pedagogica') AS aguardando_pedagogia,
      (SELECT count(*)::int FROM planos_filtrados WHERE status = 'validacao_coordenacao') AS aguardando_coordenacao,
      (SELECT count(*)::int FROM planos_filtrados WHERE status = 'devolvido_docente') AS devolvidos,
      (SELECT count(*)::int FROM planos_filtrados WHERE status = 'publicado') AS publicados
  ),
  por_status AS (
    SELECT jsonb_agg(jsonb_build_object('status', status, 'quantidade', cnt)) AS dados
    FROM (SELECT status, count(*)::int AS cnt FROM planos_filtrados GROUP BY status) s
  ),
  por_docente AS (
    SELECT jsonb_agg(jsonb_build_object('nome', docente_nome, 'quantidade', cnt) ORDER BY cnt DESC) AS dados
    FROM (SELECT docente_nome, count(*)::int AS cnt FROM planos_filtrados GROUP BY docente_nome LIMIT 15) d
  ),
  por_pasta AS (
    SELECT jsonb_agg(jsonb_build_object('nome', pasta_nome, 'quantidade', cnt) ORDER BY cnt DESC) AS dados
    FROM (SELECT pasta_nome, count(*)::int AS cnt FROM planos_filtrados GROUP BY pasta_nome LIMIT 15) p
  ),
  evolucao AS (
    SELECT jsonb_agg(jsonb_build_object('data', to_char(dia, 'DD/MM'), 'quantidade', cnt) ORDER BY dia) AS dados
    FROM (SELECT date_trunc('day', created_at) AS dia, count(*)::int AS cnt FROM planos_filtrados GROUP BY dia ORDER BY dia) e
  ),
  validacoes AS (
    SELECT
      count(*) FILTER (WHERE tipo = 'devolucao_pedagogia')::int AS devolvidos_pedagogia,
      count(*) FILTER (WHERE tipo = 'recebimento_coordenacao')::int AS aprovados_pedagogia,
      count(*) FILTER (WHERE tipo = 'devolucao_coordenacao')::int AS devolvidos_coordenacao,
      count(*) FILTER (WHERE tipo = 'publicacao')::int AS aprovados_coordenacao
    FROM public.plano_interacoes pi
    JOIN planos_filtrados pf ON pf.id = pi.plano_id
    WHERE pi.tipo IN ('recebimento_coordenacao', 'devolucao_pedagogia', 'devolucao_coordenacao', 'publicacao')
  ),
  ultimos_planos AS (
    SELECT jsonb_agg(jsonb_build_object(
      'id', id, 'titulo', titulo, 'docente', docente_nome, 'pasta', pasta_nome,
      'arquivo_nome', arquivo_nome, 'data_envio', to_char(created_at, 'DD/MM/YYYY HH24:MI'),
      'status', status, 'devolvido_por', devolvido_por,
      'created_at_iso', to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS')
    ) ORDER BY created_at DESC) AS dados
    FROM (SELECT * FROM planos_filtrados ORDER BY created_at DESC LIMIT 50) lim
  )
  SELECT jsonb_build_object(
    'indicadores', (SELECT row_to_json(i) FROM indicadores i),
    'por_status', COALESCE((SELECT dados FROM por_status), '[]'::jsonb),
    'por_docente', COALESCE((SELECT dados FROM por_docente), '[]'::jsonb),
    'por_pasta', COALESCE((SELECT dados FROM por_pasta), '[]'::jsonb),
    'evolucao', COALESCE((SELECT dados FROM evolucao), '[]'::jsonb),
    'validacoes', (SELECT row_to_json(v) FROM validacoes v),
    'ultimos_planos', COALESCE((SELECT dados FROM ultimos_planos), '[]'::jsonb)
  ) INTO v_resultado;

  RETURN v_resultado;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dashboard_dados(uuid, uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_dados(uuid, uuid, timestamptz, timestamptz) TO authenticated;
