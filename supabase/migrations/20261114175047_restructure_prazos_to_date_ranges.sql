/*
# Reestruturar configuração de prazos: datas em vez de dias corridos

## Objetivo
Substituir a lógica de dias corridos (dashboard_config_prazos) por controle
exclusivo via datas de início e encerramento (calendario_prazos).

## Mudanças
1. Nova função `obter_prazo_aplicavel(status, docente_id)` que busca o período
   ativo no calendario_prazos correspondente ao perfil responsável pelo plano.
   Prioriza configuração individual sobre coletiva.
2. Função `dashboard_gerencial` recriada:
   - `situacao_prazo` agora compara CURRENT_DATE com data_inicio/data_fim
   - Novos valores: 'nao_iniciado', 'dentro_prazo', 'encerrado', 'sem_prazo', 'concluido'
   - `planos_atraso` agora conta 'encerrado' em vez de 'atrasado'
   - `prazos_configurados` retorna objeto vazio (legado de dias corridos)
   - Tramitacao inclui `prazo_data_inicio` e `prazo_data_fim`
3. RLS de calendario_prazos refeita com 4 políticas separadas por verbo CRUD.
4. Tabela dashboard_config_prazos preservada (sem dados novos).

## Preservação
- Histórico de planos, interações, fluxo de envio/aprovação/devolução: intactos.
- Permissões de pastas e usuários: intactas.
- Dashboard, exportações, PDF: preservados (apenas lógica de prazo alterada).
*/

-- ============================================================
-- 1. Função auxiliar: obter prazo aplicável por data
-- ============================================================
CREATE OR REPLACE FUNCTION public.obter_prazo_aplicavel(
  p_status text,
  p_docente_id uuid
)
RETURNS TABLE(data_inicio date, data_fim date)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_perfil_alvo text;
BEGIN
  v_perfil_alvo := CASE
    WHEN p_status = 'validacao_pedagogica' THEN 'pedagogia'
    WHEN p_status = 'validacao_coordenacao' THEN 'coordenacao'
    WHEN p_status = 'devolvido_docente' THEN 'docente'
    ELSE NULL
  END;

  IF v_perfil_alvo IS NULL THEN
    RETURN;
  END IF;

  -- Priorizar configuração individual (usuarios_ids não vazio) sobre coletiva (vazio)
  RETURN QUERY
  SELECT cp.data_inicio, cp.data_fim
  FROM public.calendario_prazos cp
  WHERE cp.ativo = true
    AND cp.perfil_alvo = v_perfil_alvo
    AND (
      (v_perfil_alvo = 'docente' AND p_docente_id IS NOT NULL
       AND cp.usuarios_ids && ARRAY[p_docente_id]::uuid[])
      OR array_length(cp.usuarios_ids, 1) IS NULL
    )
  ORDER BY
    CASE WHEN array_length(cp.usuarios_ids, 1) IS NULL THEN 1 ELSE 0 END
  LIMIT 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.obter_prazo_aplicavel(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.obter_prazo_aplicavel(text, uuid) TO authenticated;

-- ============================================================
-- 2. RLS de calendario_prazos: 4 políticas separadas
-- ============================================================
DROP POLICY IF EXISTS "manage_calendario_prazos_gestores" ON public.calendario_prazos;

DROP POLICY IF EXISTS "select_calendario_prazos" ON public.calendario_prazos;
CREATE POLICY "select_calendario_prazos"
ON public.calendario_prazos FOR SELECT
TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_calendario_prazos_gestores" ON public.calendario_prazos;
CREATE POLICY "insert_calendario_prazos_gestores"
ON public.calendario_prazos FOR INSERT
TO authenticated
WITH CHECK (public.current_profile_role() IN ('admin', 'coordenacao', 'pedagogia'));

DROP POLICY IF EXISTS "update_calendario_prazos_gestores" ON public.calendario_prazos;
CREATE POLICY "update_calendario_prazos_gestores"
ON public.calendario_prazos FOR UPDATE
TO authenticated
USING (public.current_profile_role() IN ('admin', 'coordenacao', 'pedagogia'))
WITH CHECK (public.current_profile_role() IN ('admin', 'coordenacao', 'pedagogia'));

DROP POLICY IF EXISTS "delete_calendario_prazos_gestores" ON public.calendario_prazos;
CREATE POLICY "delete_calendario_prazos_gestores"
ON public.calendario_prazos FOR DELETE
TO authenticated
USING (public.current_profile_role() IN ('admin', 'coordenacao', 'pedagogia'));

-- ============================================================
-- 3. Recriar dashboard_gerencial com lógica de prazos por data
-- ============================================================
CREATE OR REPLACE FUNCTION public.dashboard_gerencial(
  p_pasta_id uuid DEFAULT NULL,
  p_docente_id uuid DEFAULT NULL,
  p_responsavel_perfil text DEFAULT NULL,
  p_status text DEFAULT NULL,
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
  v_duracao interval;
  v_prev_inicio timestamptz;
  v_prev_fim timestamptz;
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

  IF p_data_inicio IS NOT NULL AND p_data_fim IS NOT NULL THEN
    v_duracao := p_data_fim - p_data_inicio;
    v_prev_inicio := p_data_inicio - v_duracao;
    v_prev_fim := p_data_inicio;
  ELSIF p_data_inicio IS NOT NULL AND p_data_fim IS NULL THEN
    v_prev_inicio := p_data_inicio - (now() - p_data_inicio);
    v_prev_fim := p_data_inicio;
  END IF;

  WITH RECURSIVE
  pasta_subarvore AS (
    SELECT id, nome, pai_id FROM public.pastas
    WHERE id = p_pasta_id OR p_pasta_id IS NULL
    UNION
    SELECT p.id, p.nome, p.pai_id
    FROM public.pastas p
    JOIN pasta_subarvore ps ON p.pai_id = ps.id
  ),
  pasta_escopo AS (
    SELECT ps.id, ps.nome, ps.pai_id
    FROM pasta_subarvore ps
    WHERE ps.id = ANY(v_pastas_autorizadas)
  ),
  planos_com_dados AS (
    SELECT
      pa.id, pa.titulo, pa.docente_id, pa.pasta_id, pa.arquivo_nome,
      pa.status, pa.devolvido_por, pa.created_at, pa.updated_at,
      d.nome AS docente_nome,
      pt.nome AS pasta_nome,
      pt.pai_id AS pasta_pai_id,
      COALESCE(
        (SELECT MIN(pi.criado_at) FROM public.plano_interacoes pi
         WHERE pi.plano_id = pa.id AND pi.tipo = 'envio_docente'),
        pa.created_at
      ) AS data_primeiro_envio,
      (SELECT MAX(pi.criado_at) FROM public.plano_interacoes pi
       WHERE pi.plano_id = pa.id AND pi.tipo != 'exclusao_plano') AS data_ultima_interacao,
      (SELECT MAX(pi.criado_at) FROM public.plano_interacoes pi
       WHERE pi.plano_id = pa.id AND pi.tipo = 'publicacao') AS data_publicacao,
      (SELECT pi.autor_id FROM public.plano_interacoes pi
       WHERE pi.plano_id = pa.id AND pi.tipo != 'exclusao_plano'
       ORDER BY pi.criado_at DESC LIMIT 1) AS ultimo_autor_id,
      (SELECT pi.autor_perfil FROM public.plano_interacoes pi
       WHERE pi.plano_id = pa.id AND pi.tipo != 'exclusao_plano'
       ORDER BY pi.criado_at DESC LIMIT 1) AS ultimo_autor_perfil,
      (SELECT pi.tipo FROM public.plano_interacoes pi
       WHERE pi.plano_id = pa.id AND pi.tipo != 'exclusao_plano'
       ORDER BY pi.criado_at DESC LIMIT 1) AS ultimo_tipo,
      (SELECT p2.nome FROM public.profiles p2
       WHERE p2.id = (
         SELECT pi.autor_id FROM public.plano_interacoes pi
         WHERE pi.plano_id = pa.id AND pi.tipo != 'exclusao_plano'
         ORDER BY pi.criado_at DESC LIMIT 1
       )) AS ultimo_autor_nome,
      (SELECT MAX(pi.criado_at) FROM public.plano_interacoes pi
       WHERE pi.plano_id = pa.id AND pi.tipo != 'exclusao_plano') AS data_entrada_etapa,
      (SELECT count(*)::int FROM public.plano_interacoes pi
       WHERE pi.plano_id = pa.id AND pi.tipo = 'reenvio_docente') AS total_reenvios,
      (SELECT count(*)::int FROM public.plano_interacoes pi
       WHERE pi.plano_id = pa.id AND pi.tipo != 'exclusao_plano') AS total_movimentacoes
    FROM public.planos_aula pa
    LEFT JOIN public.profiles d ON d.id = pa.docente_id
    LEFT JOIN public.pastas pt ON pt.id = pa.pasta_id
    WHERE pa.excluido_at IS NULL
      AND pa.pasta_id IN (SELECT id FROM pasta_escopo)
      AND (p_docente_id IS NULL OR pa.docente_id = p_docente_id)
      AND (p_status IS NULL OR pa.status = p_status)
      AND (p_data_inicio IS NULL OR pa.created_at >= p_data_inicio)
      AND (p_data_fim IS NULL OR pa.created_at <= p_data_fim)
  ),
  planos_filtrados AS (
    SELECT * FROM planos_com_dados
    WHERE (
      p_responsavel_perfil IS NULL OR
      (p_responsavel_perfil = 'pedagogia' AND status = 'validacao_pedagogica') OR
      (p_responsavel_perfil = 'coordenacao' AND status = 'validacao_coordenacao') OR
      (p_responsavel_perfil = 'docente' AND status = 'devolvido_docente')
    )
  ),
  planos_periodo_anterior AS (
    SELECT
      pa.id, pa.status, pa.created_at,
      pa.pasta_id
    FROM public.planos_aula pa
    WHERE pa.excluido_at IS NULL
      AND pa.pasta_id IN (SELECT id FROM pasta_escopo)
      AND (p_docente_id IS NULL OR pa.docente_id = p_docente_id)
      AND (v_prev_inicio IS NULL OR pa.created_at >= v_prev_inicio)
      AND (v_prev_fim IS NULL OR pa.created_at < v_prev_fim)
  ),
  planos_com_curso AS (
    SELECT pf.*,
      COALESCE(
        (SELECT root.nome FROM public.pastas root
         WHERE root.id = pf.pasta_pai_id AND root.pai_id IS NULL
         LIMIT 1),
        CASE WHEN pf.pasta_pai_id IS NULL THEN pf.pasta_nome END,
        pf.pasta_nome
      ) AS curso_nome
    FROM planos_filtrados pf
  ),
  planos_com_responsavel AS (
    SELECT pc.*,
      CASE
        WHEN pc.status = 'validacao_pedagogica' THEN 'Pedagogia (NEP)'
        WHEN pc.status = 'validacao_coordenacao' THEN 'Coordenação Técnica'
        WHEN pc.status = 'devolvido_docente' THEN pc.docente_nome
        WHEN pc.status = 'publicado' THEN 'Fluxo concluído'
      END AS responsavel_atual,
      CASE
        WHEN pc.status = 'validacao_pedagogica' THEN 'pedagogia'
        WHEN pc.status = 'validacao_coordenacao' THEN 'coordenacao'
        WHEN pc.status = 'devolvido_docente' THEN 'docente'
        WHEN pc.status = 'publicado' THEN 'concluido'
      END AS responsavel_perfil_atual,
      EXTRACT(EPOCH FROM (now() - COALESCE(pc.data_entrada_etapa, pc.created_at))) / 3600.0 AS tempo_etapa_horas,
      CASE WHEN pc.data_publicacao IS NOT NULL THEN
        EXTRACT(EPOCH FROM (pc.data_publicacao - pc.data_primeiro_envio)) / 3600.0
      END AS tempo_total_horas,
      pr.data_inicio AS prazo_data_inicio,
      pr.data_fim AS prazo_data_fim,
      CASE
        WHEN pc.status = 'publicado' THEN 'concluido'
        WHEN pr.data_fim IS NULL THEN 'sem_prazo'
        WHEN CURRENT_DATE < pr.data_inicio THEN 'nao_iniciado'
        WHEN CURRENT_DATE <= pr.data_fim THEN 'dentro_prazo'
        ELSE 'encerrado'
      END AS situacao_prazo
    FROM planos_com_curso pc
    LEFT JOIN LATERAL public.obter_prazo_aplicavel(pc.status, pc.docente_id) pr ON true
  ),
  indicadores AS (
    SELECT
      (SELECT count(*)::int FROM planos_com_responsavel) AS total_planos,
      (SELECT count(DISTINCT id)::int FROM planos_com_responsavel
       WHERE data_primeiro_envio IS NOT NULL) AS planos_enviados,
      (SELECT count(*)::int FROM planos_com_responsavel WHERE status = 'validacao_pedagogica') AS aguardando_pedagogia,
      (SELECT count(*)::int FROM planos_com_responsavel WHERE status = 'validacao_coordenacao') AS aguardando_coordenacao,
      (SELECT count(*)::int FROM planos_com_responsavel WHERE status = 'devolvido_docente') AS devolvidos,
      (SELECT count(*)::int FROM planos_com_responsavel WHERE status = 'publicado') AS publicados,
      (SELECT count(DISTINCT docente_id)::int FROM planos_com_responsavel WHERE data_primeiro_envio IS NOT NULL) AS docentes_ativos,
      (SELECT COALESCE(ROUND(AVG(tempo_total_horas)), 0)::int FROM planos_com_responsavel
       WHERE data_publicacao IS NOT NULL AND tempo_total_horas IS NOT NULL) AS tempo_medio_horas,
      (SELECT count(*)::int FROM planos_com_responsavel
       WHERE status IN ('validacao_pedagogica', 'validacao_coordenacao', 'devolvido_docente')) AS pendencias,
      (SELECT count(*)::int FROM planos_com_responsavel WHERE situacao_prazo = 'encerrado') AS planos_atraso,
      (SELECT count(*)::int FROM planos_periodo_anterior) AS total_planos_anterior,
      (SELECT count(*)::int FROM planos_periodo_anterior WHERE status = 'publicado') AS publicados_anterior,
      (SELECT count(*)::int FROM planos_periodo_anterior WHERE status = 'devolvido_docente') AS devolvidos_anterior
  ),
  tramitacao AS (
    SELECT jsonb_agg(jsonb_build_object(
      'id', id,
      'titulo', titulo,
      'curso_nome', curso_nome,
      'pasta_nome', pasta_nome,
      'docente_nome', docente_nome,
      'status', status,
      'responsavel_atual', responsavel_atual,
      'responsavel_perfil', responsavel_perfil_atual,
      'data_entrada_etapa', to_char(data_entrada_etapa, 'DD/MM/YYYY HH24:MI'),
      'data_entrada_etapa_iso', to_char(data_entrada_etapa, 'YYYY-MM-DD"T"HH24:MI:SS'),
      'tempo_etapa_horas', ROUND(tempo_etapa_horas, 1),
      'ultimo_tipo', ultimo_tipo,
      'ultimo_autor_nome', ultimo_autor_nome,
      'ultimo_autor_perfil', ultimo_autor_perfil,
      'data_ultima_interacao', to_char(data_ultima_interacao, 'DD/MM/YYYY HH24:MI'),
      'situacao_prazo', situacao_prazo,
      'prazo_data_inicio', CASE WHEN prazo_data_inicio IS NOT NULL THEN to_char(prazo_data_inicio, 'DD/MM/YYYY') END,
      'prazo_data_fim', CASE WHEN prazo_data_fim IS NOT NULL THEN to_char(prazo_data_fim, 'DD/MM/YYYY') END,
      'total_movimentacoes', total_movimentacoes,
      'data_primeiro_envio', to_char(data_primeiro_envio, 'DD/MM/YYYY HH24:MI'),
      'data_publicacao', CASE WHEN data_publicacao IS NOT NULL THEN to_char(data_publicacao, 'DD/MM/YYYY HH24:MI') END,
      'arquivo_nome', arquivo_nome
    ) ORDER BY created_at DESC) AS dados
    FROM planos_com_responsavel
  ),
  analise_cursos AS (
    SELECT jsonb_agg(jsonb_build_object(
      'curso_nome', curso_nome,
      'total_planos', total_planos,
      'aguardando_pedagogia', aguardando_pedagogia,
      'aguardando_coordenacao', aguardando_coordenacao,
      'devolvidos', devolvidos,
      'publicados', publicados,
      'percentual_publicacao', CASE WHEN total_planos > 0 THEN ROUND((publicados::numeric / total_planos) * 100, 1) ELSE 0 END,
      'docentes_vinculados', docentes_vinculados,
      'docentes_enviaram', docentes_enviaram,
      'tempo_medio_horas', tempo_medio,
      'planos_atraso', planos_atraso
    ) ORDER BY total_planos DESC) AS dados
    FROM (
      SELECT
        pcr.curso_nome,
        count(*)::int AS total_planos,
        count(*) FILTER (WHERE pcr.status = 'validacao_pedagogica')::int AS aguardando_pedagogia,
        count(*) FILTER (WHERE pcr.status = 'validacao_coordenacao')::int AS aguardando_coordenacao,
        count(*) FILTER (WHERE pcr.status = 'devolvido_docente')::int AS devolvidos,
        count(*) FILTER (WHERE pcr.status = 'publicado')::int AS publicados,
        count(DISTINCT pcr.docente_id)::int AS docentes_enviaram,
        COALESCE(ROUND(AVG(pcr.tempo_total_horas)), 0)::int AS tempo_medio,
        count(*) FILTER (WHERE pcr.situacao_prazo = 'encerrado')::int AS planos_atraso,
        (SELECT count(DISTINCT pp.profile_id)::int FROM public.profile_pastas pp
         JOIN public.profiles pr ON pr.id = pp.profile_id
         WHERE pr.perfil = 'docente'
         AND pp.pasta_id IN (
           SELECT id FROM pasta_subarvore WHERE nome = pcr.curso_nome
           UNION SELECT p.id FROM public.pastas p WHERE p.nome = pcr.curso_nome AND p.pai_id IS NULL
         )
        ) AS docentes_vinculados
      FROM planos_com_responsavel pcr
      GROUP BY pcr.curso_nome
    ) c
  ),
  analise_docentes AS (
    SELECT jsonb_agg(jsonb_build_object(
      'docente_nome', docente_nome,
      'docente_id', docente_id,
      'curso_nome', curso_nome,
      'total_planos', total_planos,
      'em_tramitacao', em_tramitacao,
      'devolvidos', devolvidos,
      'publicados', publicados,
      'total_reenvios', total_reenvios,
      'total_versoes', total_versoes,
      'ultimo_envio', CASE WHEN ultimo_envio IS NOT NULL THEN to_char(ultimo_envio, 'DD/MM/YYYY') END,
      'percentual_publicados', CASE WHEN total_planos > 0 THEN ROUND((publicados::numeric / total_planos) * 100, 1) ELSE 0 END
    ) ORDER BY total_planos DESC) AS dados
    FROM (
      SELECT
        pcr.docente_nome,
        pcr.docente_id,
        string_agg(DISTINCT pcr.curso_nome, ', ') AS curso_nome,
        count(DISTINCT pcr.id)::int AS total_planos,
        count(*) FILTER (WHERE pcr.status IN ('validacao_pedagogica', 'validacao_coordenacao', 'devolvido_docente'))::int AS em_tramitacao,
        count(*) FILTER (WHERE pcr.status = 'devolvido_docente')::int AS devolvidos,
        count(*) FILTER (WHERE pcr.status = 'publicado')::int AS publicados,
        COALESCE(SUM(pcr.total_reenvios), 0)::int AS total_reenvios,
        (count(DISTINCT pcr.id) + COALESCE(SUM(pcr.total_reenvios), 0))::int AS total_versoes,
        MAX(pcr.data_primeiro_envio) AS ultimo_envio
      FROM planos_com_responsavel pcr
      GROUP BY pcr.docente_id, pcr.docente_nome
    ) d
  ),
  desempenho_pedagogia AS (
    SELECT
      count(DISTINCT pi.plano_id)::int AS planos_recebidos,
      count(DISTINCT pi.plano_id) FILTER (WHERE pi.tipo IN ('recebimento_coordenacao', 'devolucao_pedagogia'))::int AS planos_analisados,
      count(DISTINCT pi.plano_id) FILTER (WHERE pi.tipo = 'recebimento_coordenacao')::int AS planos_aprovados,
      count(DISTINCT pi.plano_id) FILTER (WHERE pi.tipo = 'devolucao_pedagogia')::int AS planos_devolvidos,
      (SELECT count(*)::int FROM planos_com_responsavel WHERE status = 'validacao_pedagogica') AS aguardando_analise
    FROM public.plano_interacoes pi
    JOIN planos_com_responsavel pcr ON pcr.id = pi.plano_id
    WHERE pi.tipo IN ('recebimento_pedagogia', 'recebimento_coordenacao', 'devolucao_pedagogia')
  ),
  desempenho_coordenacao AS (
    SELECT
      count(DISTINCT pi.plano_id)::int AS planos_recebidos,
      count(DISTINCT pi.plano_id) FILTER (WHERE pi.tipo IN ('publicacao', 'devolucao_coordenacao'))::int AS planos_analisados,
      count(DISTINCT pi.plano_id) FILTER (WHERE pi.tipo = 'publicacao')::int AS planos_aprovados,
      count(DISTINCT pi.plano_id) FILTER (WHERE pi.tipo = 'devolucao_coordenacao')::int AS planos_devolvidos,
      (SELECT count(*)::int FROM planos_com_responsavel WHERE status = 'validacao_coordenacao') AS aguardando_analise
    FROM public.plano_interacoes pi
    JOIN planos_com_responsavel pcr ON pcr.id = pi.plano_id
    WHERE pi.tipo IN ('recebimento_coordenacao', 'publicacao', 'devolucao_coordenacao')
  ),
  analise_individual_pedagogia AS (
    SELECT jsonb_agg(jsonb_build_object(
      'nome', autor_nome,
      'analisados', analisados,
      'aprovados', aprovados,
      'devolvidos', devolvidos,
      'ultima_acao', to_char(ultima_acao, 'DD/MM/YYYY HH24:MI')
    ) ORDER BY analisados DESC) AS dados
    FROM (
      SELECT
        p2.nome AS autor_nome,
        count(DISTINCT pi.plano_id)::int AS analisados,
        count(DISTINCT pi.plano_id) FILTER (WHERE pi.tipo = 'recebimento_coordenacao')::int AS aprovados,
        count(DISTINCT pi.plano_id) FILTER (WHERE pi.tipo = 'devolucao_pedagogia')::int AS devolvidos,
        MAX(pi.criado_at) AS ultima_acao
      FROM public.plano_interacoes pi
      JOIN planos_com_responsavel pcr ON pcr.id = pi.plano_id
      JOIN public.profiles p2 ON p2.id = pi.autor_id
      WHERE pi.tipo IN ('recebimento_coordenacao', 'devolucao_pedagogia')
      GROUP BY p2.nome
    ) ind
  ),
  analise_individual_coordenacao AS (
    SELECT jsonb_agg(jsonb_build_object(
      'nome', autor_nome,
      'analisados', analisados,
      'aprovados', aprovados,
      'devolvidos', devolvidos,
      'ultima_acao', to_char(ultima_acao, 'DD/MM/YYYY HH24:MI')
    ) ORDER BY analisados DESC) AS dados
    FROM (
      SELECT
        p2.nome AS autor_nome,
        count(DISTINCT pi.plano_id)::int AS analisados,
        count(DISTINCT pi.plano_id) FILTER (WHERE pi.tipo = 'publicacao')::int AS aprovados,
        count(DISTINCT pi.plano_id) FILTER (WHERE pi.tipo = 'devolucao_coordenacao')::int AS devolvidos,
        MAX(pi.criado_at) AS ultima_acao
      FROM public.plano_interacoes pi
      JOIN planos_com_responsavel pcr ON pcr.id = pi.plano_id
      JOIN public.profiles p2 ON p2.id = pi.autor_id
      WHERE pi.tipo IN ('publicacao', 'devolucao_coordenacao')
      GROUP BY p2.nome
    ) ind
  ),
  tempo_envio_para_pedagogia AS (
    SELECT
      COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (r.criado_at - e.criado_at)) / 3600.0)), 0)::numeric AS media,
      COALESCE(ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (r.criado_at - e.criado_at)) / 3600.0)), 0)::numeric AS mediana,
      COALESCE(ROUND(MAX(EXTRACT(EPOCH FROM (r.criado_at - e.criado_at)) / 3600.0)), 0)::numeric AS maior,
      COALESCE(ROUND(MIN(EXTRACT(EPOCH FROM (r.criado_at - e.criado_at)) / 3600.0)), 0)::numeric AS menor,
      count(*)::int AS amostras
    FROM public.plano_interacoes e
    JOIN public.plano_interacoes r ON r.plano_id = e.plano_id AND r.tipo = 'recebimento_pedagogia'
    JOIN planos_com_responsavel pcr ON pcr.id = e.plano_id
    WHERE e.tipo = 'envio_docente' AND r.criado_at >= e.criado_at
  ),
  tempo_analise_pedagogia AS (
    SELECT
      COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (r.criado_at - p.criado_at)) / 3600.0)), 0)::numeric AS media,
      COALESCE(ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (r.criado_at - p.criado_at)) / 3600.0)), 0)::numeric AS mediana,
      COALESCE(ROUND(MAX(EXTRACT(EPOCH FROM (r.criado_at - p.criado_at)) / 3600.0)), 0)::numeric AS maior,
      COALESCE(ROUND(MIN(EXTRACT(EPOCH FROM (r.criado_at - p.criado_at)) / 3600.0)), 0)::numeric AS menor,
      count(*)::int AS amostras
    FROM public.plano_interacoes p
    JOIN public.plano_interacoes r ON r.plano_id = p.plano_id
      AND r.tipo IN ('recebimento_coordenacao', 'devolucao_pedagogia')
      AND r.criado_at >= p.criado_at
    JOIN planos_com_responsavel pcr ON pcr.id = p.plano_id
    WHERE p.tipo = 'recebimento_pedagogia'
    AND NOT EXISTS (
      SELECT 1 FROM public.plano_interacoes r2
      WHERE r2.plano_id = p.plano_id
      AND r2.tipo IN ('recebimento_coordenacao', 'devolucao_pedagogia')
      AND r2.criado_at >= p.criado_at AND r2.criado_at < r.criado_at
    )
  ),
  tempo_encaminhamento_para_coordenacao AS (
    SELECT
      COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (pub.criado_at - rc.criado_at)) / 3600.0)), 0)::numeric AS media,
      COALESCE(ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (pub.criado_at - rc.criado_at)) / 3600.0)), 0)::numeric AS mediana,
      COALESCE(ROUND(MAX(EXTRACT(EPOCH FROM (pub.criado_at - rc.criado_at)) / 3600.0)), 0)::numeric AS maior,
      COALESCE(ROUND(MIN(EXTRACT(EPOCH FROM (pub.criado_at - rc.criado_at)) / 3600.0)), 0)::numeric AS menor,
      count(*)::int AS amostras
    FROM public.plano_interacoes rc
    JOIN public.plano_interacoes pub ON pub.plano_id = rc.plano_id
      AND pub.tipo IN ('publicacao', 'devolucao_coordenacao')
      AND pub.criado_at >= rc.criado_at
    JOIN planos_com_responsavel pcr ON pcr.id = rc.plano_id
    WHERE rc.tipo = 'recebimento_coordenacao'
    AND NOT EXISTS (
      SELECT 1 FROM public.plano_interacoes pub2
      WHERE pub2.plano_id = rc.plano_id
      AND pub2.tipo IN ('publicacao', 'devolucao_coordenacao')
      AND pub2.criado_at >= rc.criado_at AND pub2.criado_at < pub.criado_at
    )
  ),
  tempo_total_publicacao AS (
    SELECT
      COALESCE(ROUND(AVG(pcr.tempo_total_horas)), 0)::numeric AS media,
      COALESCE(ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY pcr.tempo_total_horas)), 0)::numeric AS mediana,
      COALESCE(ROUND(MAX(pcr.tempo_total_horas)), 0)::numeric AS maior,
      COALESCE(ROUND(MIN(pcr.tempo_total_horas)), 0)::numeric AS menor,
      count(*)::int AS amostras
    FROM planos_com_responsavel pcr
    WHERE pcr.data_publicacao IS NOT NULL AND pcr.tempo_total_horas IS NOT NULL
  ),
  evolucao_envios AS (
    SELECT jsonb_agg(jsonb_build_object('data', to_char(dia, 'DD/MM'), 'quantidade', cnt) ORDER BY dia) AS dados
    FROM (
      SELECT date_trunc('day', data_primeiro_envio) AS dia, count(*)::int AS cnt
      FROM planos_com_responsavel
      WHERE data_primeiro_envio IS NOT NULL
      GROUP BY dia ORDER BY dia
    ) e
  ),
  evolucao_publicacoes AS (
    SELECT jsonb_agg(jsonb_build_object('data', to_char(dia, 'DD/MM'), 'quantidade', cnt) ORDER BY dia) AS dados
    FROM (
      SELECT date_trunc('day', data_publicacao) AS dia, count(*)::int AS cnt
      FROM planos_com_responsavel
      WHERE data_publicacao IS NOT NULL
      GROUP BY dia ORDER BY dia
    ) e
  ),
  evolucao_devolucoes AS (
    SELECT jsonb_agg(jsonb_build_object('data', to_char(dia, 'DD/MM'), 'quantidade', cnt) ORDER BY dia) AS dados
    FROM (
      SELECT date_trunc('day', pi.criado_at) AS dia, count(DISTINCT pi.plano_id)::int AS cnt
      FROM public.plano_interacoes pi
      JOIN planos_com_responsavel pcr ON pcr.id = pi.plano_id
      WHERE pi.tipo IN ('devolucao_pedagogia', 'devolucao_coordenacao')
      GROUP BY dia ORDER BY dia
    ) e
  ),
  sintese AS (
    SELECT jsonb_build_object(
      'percentual_publicados', CASE WHEN (SELECT total_planos FROM indicadores) > 0
        THEN ROUND(((SELECT publicados FROM indicadores)::numeric / (SELECT total_planos FROM indicadores)) * 100, 1)
        ELSE 0 END,
      'percentual_pendentes', CASE WHEN (SELECT total_planos FROM indicadores) > 0
        THEN ROUND(((SELECT pendencias FROM indicadores)::numeric / (SELECT total_planos FROM indicadores)) * 100, 1)
        ELSE 0 END,
      'etapa_mais_pendencias', COALESCE(
        (SELECT status FROM planos_com_responsavel
         WHERE status IN ('validacao_pedagogica', 'validacao_coordenacao', 'devolvido_docente')
         GROUP BY status ORDER BY count(*) DESC LIMIT 1),
        'Nenhuma pendência'
      ),
      'curso_maior_volume', COALESCE(
        (SELECT curso_nome FROM planos_com_responsavel GROUP BY curso_nome ORDER BY count(*) DESC LIMIT 1),
        'Sem dados'
      )
    ) AS dados
  )

  SELECT jsonb_build_object(
    'indicadores', (SELECT row_to_json(i) FROM indicadores i),
    'tramitacao', COALESCE((SELECT dados FROM tramitacao), '[]'::jsonb),
    'analise_cursos', COALESCE((SELECT dados FROM analise_cursos), '[]'::jsonb),
    'analise_docentes', COALESCE((SELECT dados FROM analise_docentes), '[]'::jsonb),
    'desempenho_pedagogia', (SELECT row_to_json(d) FROM desempenho_pedagogia d),
    'desempenho_coordenacao', (SELECT row_to_json(d) FROM desempenho_coordenacao d),
    'analise_individual_pedagogia', COALESCE((SELECT dados FROM analise_individual_pedagogia), '[]'::jsonb),
    'analise_individual_coordenacao', COALESCE((SELECT dados FROM analise_individual_coordenacao), '[]'::jsonb),
    'tempo_envio_pedagogia', (SELECT row_to_json(t) FROM tempo_envio_para_pedagogia t),
    'tempo_analise_pedagogia', (SELECT row_to_json(t) FROM tempo_analise_pedagogia t),
    'tempo_encaminhamento_coordenacao', (SELECT row_to_json(t) FROM tempo_encaminhamento_para_coordenacao t),
    'tempo_total_publicacao', (SELECT row_to_json(t) FROM tempo_total_publicacao t),
    'evolucao_envios', COALESCE((SELECT dados FROM evolucao_envios), '[]'::jsonb),
    'evolucao_publicacoes', COALESCE((SELECT dados FROM evolucao_publicacoes), '[]'::jsonb),
    'evolucao_devolucoes', COALESCE((SELECT dados FROM evolucao_devolucoes), '[]'::jsonb),
    'sintese', (SELECT dados FROM sintese),
    'total_registros', (SELECT count(*)::int FROM planos_com_responsavel),
    'prazos_configurados', '{}'::jsonb
  ) INTO v_resultado;

  RETURN v_resultado;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dashboard_gerencial(uuid, uuid, text, text, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_gerencial(uuid, uuid, text, text, timestamptz, timestamptz) TO authenticated;
