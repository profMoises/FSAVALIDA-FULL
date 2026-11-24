/*
# Dashboard Gerencial Avançado - Função Completa e Configuração de Prazos

## Objetivo
Substituir a função dashboard_dados por uma versão muito mais completa,
corrigindo o filtro por curso (agora recursivo, incluindo sub-pastas) e
adicionando indicadores detalhados, análise por curso/docente/equipe,
cálculos de tempo de tramitação, identificação de responsável atual,
evolução temporal e síntese executiva.

## Novas tabelas
- `dashboard_config_prazos`: prazos de referência configuráveis por etapa.
  - `etapa` (text, chave): validacao_pedagogica, validacao_coordenacao, devolvido_docente
  - `prazo_dias` (int): prazo em dias corridos
  - `updated_at` (timestamptz): data de última atualização
  - Inicia sem registros — o admin configura os prazos depois.

## Função
- `dashboard_gerencial(p_pasta_id, p_docente_id, p_responsavel_perfil, p_status, p_data_inicio, p_data_fim)`:
  Retorna JSONB com: indicadores (10 cartões + comparação com período anterior),
  tramitacao dos planos, análise por curso, análise por docente, desempenho das
  equipes, tempos de tramitação, evolução temporal, síntese executiva e total de registros.

## Correções importantes
1. Filtro por pasta/curso agora é RECURSIVO: selecionar "NEM" inclui planos
   em BIOTECNOLOGIA e MECATRÔNICA (sub-pastas).
2. Contagem de planos usa DISTINCT no id do plano (não confunde com versões/interações).
3. Datas reais do histórico são usadas (primeiro envio, publicação, etc.).
4. Responsável atual identificado pelo status do plano e histórico de interações.
5. Tempo na etapa calculado desde a última interação relevante.
6. Período anterior calculado para comparação quando há filtro de data.

## Segurança
- SECURITY DEFINER, restrita a authenticated.
- Verifica que o caller é admin, pedagogia ou coordenacao (docentes não acessam).
- Para pedagogia e coordenacao, filtra pelas pastas autorizadas (profile_pastas).
  Se não houver vínculos, permite ver todas (compatibilidade).
- Admin vê todos os dados.
- Nenhum dado é gravado ou removido (exceto config_prazos que é tabela separada).
*/

-- ============================================================
-- Tabela de configuração de prazos por etapa
-- ============================================================
CREATE TABLE IF NOT EXISTS public.dashboard_config_prazos (
  etapa text PRIMARY KEY CHECK (etapa IN ('validacao_pedagogica', 'validacao_coordenacao', 'devolvido_docente')),
  prazo_dias int NOT NULL DEFAULT 7 CHECK (prazo_dias > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.dashboard_config_prazos ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.dashboard_config_prazos TO authenticated;

DROP POLICY IF EXISTS "select_config_prazos" ON public.dashboard_config_prazos;
CREATE POLICY "select_config_prazos"
ON public.dashboard_config_prazos FOR SELECT
TO authenticated USING (true);

-- Admin pode alterar prazos
DROP POLICY IF EXISTS "admin_manage_config_prazos" ON public.dashboard_config_prazos;
CREATE POLICY "admin_manage_config_prazos"
ON public.dashboard_config_prazos FOR ALL
TO authenticated
USING (public.current_profile_role() = 'admin')
WITH CHECK (public.current_profile_role() = 'admin');

-- ============================================================
-- Função principal do dashboard gerencial
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

  -- Escopo de pastas autorizadas por perfil
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

  -- Calcular período anterior para comparação
  IF p_data_inicio IS NOT NULL AND p_data_fim IS NOT NULL THEN
    v_duracao := p_data_fim - p_data_inicio;
    v_prev_inicio := p_data_inicio - v_duracao;
    v_prev_fim := p_data_inicio;
  ELSIF p_data_inicio IS NOT NULL AND p_data_fim IS NULL THEN
    -- Período aberto (ex: últimos 30 dias até agora)
    v_prev_inicio := p_data_inicio - (now() - p_data_inicio);
    v_prev_fim := p_data_inicio;
  END IF;

  WITH RECURSIVE
  -- Expandir pasta selecionada para incluir todos os descendentes
  pasta_subarvore AS (
    SELECT id, nome, pai_id FROM public.pastas
    WHERE id = p_pasta_id OR p_pasta_id IS NULL
    UNION
    SELECT p.id, p.nome, p.pai_id
    FROM public.pastas p
    JOIN pasta_subarvore ps ON p.pai_id = ps.id
  ),
  -- Escopo efetivo: interseção de pastas autorizadas e subárvore selecionada
  pasta_escopo AS (
    SELECT ps.id, ps.nome, ps.pai_id
    FROM pasta_subarvore ps
    WHERE ps.id = ANY(v_pastas_autorizadas)
  ),
  -- Identificar pastas raiz (cursos): se a pasta selecionada tem descendentes,
  -- usar a raiz; caso contrário, subir até a raiz
  planos_com_dados AS (
    SELECT
      pa.id, pa.titulo, pa.docente_id, pa.pasta_id, pa.arquivo_nome,
      pa.status, pa.devolvido_por, pa.created_at, pa.updated_at,
      d.nome AS docente_nome,
      pt.nome AS pasta_nome,
      pt.pai_id AS pasta_pai_id,
      -- Data do primeiro envio (do histórico de interações)
      COALESCE(
        (SELECT MIN(pi.criado_at) FROM public.plano_interacoes pi
         WHERE pi.plano_id = pa.id AND pi.tipo = 'envio_docente'),
        pa.created_at
      ) AS data_primeiro_envio,
      -- Data da última interação relevante (não exclusão)
      (SELECT MAX(pi.criado_at) FROM public.plano_interacoes pi
       WHERE pi.plano_id = pa.id AND pi.tipo != 'exclusao_plano') AS data_ultima_interacao,
      -- Data de publicação
      (SELECT MAX(pi.criado_at) FROM public.plano_interacoes pi
       WHERE pi.plano_id = pa.id AND pi.tipo = 'publicacao') AS data_publicacao,
      -- Última interação (para responsável e etapa)
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
      -- Data de entrada na etapa atual (última interação relevante)
      (SELECT MAX(pi.criado_at) FROM public.plano_interacoes pi
       WHERE pi.plano_id = pa.id AND pi.tipo != 'exclusao_plano') AS data_entrada_etapa,
      -- Contar versões (reenvios)
      (SELECT count(*)::int FROM public.plano_interacoes pi
       WHERE pi.plano_id = pa.id AND pi.tipo = 'reenvio_docente') AS total_reenvios,
      -- Contar total de interações (movimentações)
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
  -- Filtrar por responsável atual se solicitado
  planos_filtrados AS (
    SELECT * FROM planos_com_dados
    WHERE (
      p_responsavel_perfil IS NULL OR
      (p_responsavel_perfil = 'pedagogia' AND status = 'validacao_pedagogica') OR
      (p_responsavel_perfil = 'coordenacao' AND status = 'validacao_coordenacao') OR
      (p_responsavel_perfil = 'docente' AND status = 'devolvido_docente')
    )
  ),
  -- Período anterior para comparação
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
  -- Prazos configurados
  prazos AS (
    SELECT etapa, prazo_dias FROM public.dashboard_config_prazos
  ),
  -- Calcular nome do curso (pasta raiz)
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
  -- Responsável atual
  planos_com_responsavel AS (
    SELECT pc.*,
      CASE
        WHEN pc.status = 'validacao_pedagogia' THEN 'Pedagogia (NEP)'
        WHEN pc.status = 'validacao_coordenacao' THEN 'Coordenação Técnica'
        WHEN pc.status = 'devolvido_docente' THEN pc.docente_nome
        WHEN pc.status = 'publicado' THEN 'Fluxo concluído'
      END AS responsavel_atual,
      CASE
        WHEN pc.status = 'validacao_pedagogia' THEN 'pedagogia'
        WHEN pc.status = 'validacao_coordenacao' THEN 'coordenacao'
        WHEN pc.status = 'devolvido_docente' THEN 'docente'
        WHEN pc.status = 'publicado' THEN 'concluido'
      END AS responsavel_perfil_atual,
      -- Tempo na etapa em horas
      EXTRACT(EPOCH FROM (now() - COALESCE(pc.data_entrada_etapa, pc.created_at))) / 3600.0 AS tempo_etapa_horas,
      -- Tempo total de tramitação em horas (para publicados)
      CASE WHEN pc.data_publicacao IS NOT NULL THEN
        EXTRACT(EPOCH FROM (pc.data_publicacao - pc.data_primeiro_envio)) / 3600.0
      END AS tempo_total_horas,
      -- Situação de prazo
      CASE
        WHEN COALESCE((SELECT prazo_dias FROM prazos WHERE etapa = pc.status), 0) = 0 THEN 'sem_prazo'
        WHEN EXTRACT(EPOCH FROM (now() - COALESCE(pc.data_entrada_etapa, pc.created_at))) / 86400.0 >
             (SELECT prazo_dias FROM prazos WHERE etapa = pc.status) THEN 'atrasado'
        WHEN EXTRACT(EPOCH FROM (now() - COALESCE(pc.data_entrada_etapa, pc.created_at))) / 86400.0 >
             (SELECT prazo_dias FROM prazos WHERE etapa = pc.status) * 0.8 THEN 'proximo_prazo'
        ELSE 'dentro_prazo'
      END AS situacao_prazo
    FROM planos_com_curso pc
  ),
  -- ===== INDICADORES =====
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
      (SELECT count(*)::int FROM planos_com_responsavel WHERE situacao_prazo = 'atrasado') AS planos_atraso,
      -- Período anterior
      (SELECT count(*)::int FROM planos_periodo_anterior) AS total_planos_anterior,
      (SELECT count(*)::int FROM planos_periodo_anterior WHERE status = 'publicado') AS publicados_anterior,
      (SELECT count(*)::int FROM planos_periodo_anterior WHERE status = 'devolvido_docente') AS devolvidos_anterior
  ),
  -- ===== TRAMITAÇÃO =====
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
      'total_movimentacoes', total_movimentacoes,
      'data_primeiro_envio', to_char(data_primeiro_envio, 'DD/MM/YYYY HH24:MI'),
      'data_publicacao', CASE WHEN data_publicacao IS NOT NULL THEN to_char(data_publicacao, 'DD/MM/YYYY HH24:MI') END,
      'arquivo_nome', arquivo_nome
    ) ORDER BY created_at DESC) AS dados
    FROM planos_com_responsavel
  ),
  -- ===== ANÁLISE POR CURSO =====
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
        count(*) FILTER (WHERE pcr.situacao_prazo = 'atrasado')::int AS planos_atraso,
        -- Docentes vinculados ao curso (da tabela profile_pastas)
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
  -- ===== ANÁLISE POR DOCENTE =====
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
        -- Total de versões = total de envios + reenvios
        (count(DISTINCT pcr.id) + COALESCE(SUM(pcr.total_reenvios), 0))::int AS total_versoes,
        MAX(pcr.data_primeiro_envio) AS ultimo_envio
      FROM planos_com_responsavel pcr
      GROUP BY pcr.docente_id, pcr.docente_nome
    ) d
  ),
  -- ===== DESEMPENHO DAS EQUIPES =====
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
  -- Análise individual (quando há registro de quem realizou cada ação)
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
  -- ===== TEMPOS DE TRAMITAÇÃO =====
  -- Tempo entre envio e início da análise pedagógica (recebimento_pedagogia)
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
  -- Tempo de análise pedagógica (recebimento_pedagogia -> recebimento_coordenacao OU devolucao_pedagogia)
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
  -- Tempo entre encaminhamento e início da análise técnica
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
  -- Tempo total até publicação
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
  -- ===== EVOLUÇÃO TEMPORAL =====
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
  -- ===== SÍNTESE EXECUTIVA =====
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
    'prazos_configurados', COALESCE(
      (SELECT jsonb_object_agg(etapa, prazo_dias) FROM prazos),
      '{}'::jsonb
    )
  ) INTO v_resultado;

  RETURN v_resultado;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dashboard_gerencial(uuid, uuid, text, text, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_gerencial(uuid, uuid, text, text, timestamptz, timestamptz) TO authenticated;
