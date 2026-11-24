/*
# Restaurar registro de histórico e corrigir typo do dashboard

## Problema
As funções enviar_plano, reenviar_plano, pedagogia_decidir e coordenacao_decidir
foram sobrescritas em migrações de segurança posteriores e deixaram de chamar
registrar_interacao, usando apenas _fila_notificacao. Resultado: nenhum evento
de histórico (envio, recebimento, devolução, publicação) era registrado, e o
modal de histórico aparecia vazio para todos os planos.

Adicionalmente, a função dashboard_gerencial continha o typo 'validacao_pedagogia'
(faltando o 'c' final) em dois CASE do CTE planos_com_responsavel, fazendo com
que planos em validação pedagógica mostrassem responsável_atual = null.

## Correções
1. Recria enviar_plano com chamadas a registrar_interacao (envio_docente + recebimento_pedagogia),
   mantendo _fila_notificacao.
2. Recria reenviar_plano com registrar_interacao (reenvio_docente + recebimento correspondente),
   mantendo _fila_notificacao.
3. Recria pedagogia_decidir com registrar_interacao (recebimento_coordenacao ou devolucao_pedagogia),
   mantendo _fila_notificacao.
4. Recria coordenacao_decidir com registrar_interacao (publicacao ou devolucao_coordenacao),
   sem _fila_notificacao (já não notifica aqui).
5. Corrige o typo 'validacao_pedagogia' -> 'validacao_pedagogica' no dashboard_gerencial.
6. Backfill: para planos existentes sem nenhum evento envio_docente, cria envio_docente
   e recebimento_pedagogia usando o docente e a data de criação do plano.

## Segurança
- Todas as funções permanecem SECURITY DEFINER, SET search_path = public.
- Permissões EXECUTE mantidas: authenticated apenas.
- Nenhum dado existente é alterado ou removido.
- Backfill é idempotente (só insere onde não existe evento do tipo).
*/

-- ============================================================
-- 1. enviar_plano
-- ============================================================
CREATE OR REPLACE FUNCTION public.enviar_plano(
  p_titulo text,
  p_pasta_id uuid,
  p_arquivo_path text,
  p_arquivo_nome text,
  p_arquivo_tamanho bigint
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF public.current_profile_role() IS DISTINCT FROM 'docente' THEN
    RAISE EXCEPTION 'Apenas docentes podem enviar planos de aula.';
  END IF;
  IF NOT public.pasta_no_escopo_do_usuario(p_pasta_id) THEN
    RAISE EXCEPTION 'A pasta escolhida não está disponível para o seu usuário.';
  END IF;
  IF p_arquivo_path IS NULL OR left(p_arquivo_path, 37) <> auth.uid()::text || '/' THEN
    RAISE EXCEPTION 'Arquivo inválido para este usuário.';
  END IF;

  INSERT INTO public.planos_aula (titulo, docente_id, pasta_id, arquivo_path, arquivo_nome, arquivo_tamanho, status)
  VALUES (btrim(p_titulo), auth.uid(), p_pasta_id, p_arquivo_path, p_arquivo_nome, p_arquivo_tamanho, 'validacao_pedagogica')
  RETURNING id INTO v_id;

  PERFORM public.registrar_interacao(v_id, 'envio_docente');
  PERFORM public.registrar_interacao(v_id, 'recebimento_pedagogia');
  PERFORM public._fila_notificacao(v_id, 'envio_docente', 'NOVO PLANO DE AULA AGUARDANDO ANÁLISE');

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enviar_plano(text, uuid, text, text, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enviar_plano(text, uuid, text, text, bigint) TO authenticated;

-- ============================================================
-- 2. reenviar_plano
-- ============================================================
CREATE OR REPLACE FUNCTION public.reenviar_plano(
  p_plano_id uuid,
  p_arquivo_path text,
  p_arquivo_nome text,
  p_arquivo_tamanho bigint
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plano public.planos_aula%ROWTYPE;
  v_novo_status text;
  v_recebimento text;
BEGIN
  SELECT * INTO v_plano FROM public.planos_aula WHERE id = p_plano_id FOR UPDATE;
  IF NOT FOUND OR v_plano.docente_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Plano de aula não encontrado.';
  END IF;
  IF v_plano.status <> 'devolvido_docente' THEN
    RAISE EXCEPTION 'Este plano não está aguardando ajustes.';
  END IF;
  IF p_arquivo_path IS NULL OR left(p_arquivo_path, 37) <> auth.uid()::text || '/' THEN
    RAISE EXCEPTION 'Arquivo inválido para este usuário.';
  END IF;

  v_novo_status := CASE
    WHEN v_plano.devolvido_por = 'coordenacao' THEN 'validacao_coordenacao'
    ELSE 'validacao_pedagogica'
  END;
  v_recebimento := CASE
    WHEN v_plano.devolvido_por = 'coordenacao' THEN 'recebimento_coordenacao'
    ELSE 'recebimento_pedagogia'
  END;

  UPDATE public.planos_aula
  SET status = v_novo_status,
      devolvido_por = NULL,
      arquivo_path = p_arquivo_path,
      arquivo_nome = p_arquivo_nome,
      arquivo_tamanho = p_arquivo_tamanho,
      updated_at = now()
  WHERE id = p_plano_id;

  PERFORM public.registrar_interacao(p_plano_id, 'reenvio_docente');
  PERFORM public.registrar_interacao(p_plano_id, v_recebimento);

  IF v_novo_status = 'validacao_pedagogica' THEN
    PERFORM public._fila_notificacao(p_plano_id, 'envio_docente', 'NOVO PLANO DE AULA AGUARDANDO ANÁLISE');
  END IF;

  RETURN v_novo_status;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reenviar_plano(uuid, text, text, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reenviar_plano(uuid, text, text, bigint) TO authenticated;

-- ============================================================
-- 3. pedagogia_decidir
-- ============================================================
CREATE OR REPLACE FUNCTION public.pedagogia_decidir(
  p_plano_id uuid,
  p_aprovar boolean,
  p_mensagem text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plano public.planos_aula%ROWTYPE;
  v_novo_status text;
BEGIN
  IF public.current_profile_role() IS DISTINCT FROM 'pedagogia' THEN
    RAISE EXCEPTION 'Apenas a pedagogia pode validar esta etapa.';
  END IF;

  SELECT * INTO v_plano FROM public.planos_aula WHERE id = p_plano_id FOR UPDATE;
  IF NOT FOUND OR v_plano.excluido_at IS NOT NULL THEN
    RAISE EXCEPTION 'Plano de aula não encontrado.';
  END IF;

  IF NOT (public.usuario_sem_vinculos() OR public.pasta_no_escopo_do_usuario(v_plano.pasta_id)) THEN
    RAISE EXCEPTION 'Este plano não pertence às pastas vinculadas ao seu usuário.';
  END IF;

  IF v_plano.status <> 'validacao_pedagogica' THEN
    RAISE EXCEPTION 'Este plano não está aguardando validação pedagógica.';
  END IF;

  IF NOT p_aprovar AND length(btrim(coalesce(p_mensagem, ''))) < 3 THEN
    RAISE EXCEPTION 'Escreva a orientação para o docente antes de devolver o plano.';
  END IF;

  v_novo_status := CASE WHEN p_aprovar THEN 'validacao_coordenacao' ELSE 'devolvido_docente' END;

  UPDATE public.planos_aula
  SET status = v_novo_status,
      devolvido_por = CASE WHEN p_aprovar THEN NULL ELSE 'pedagogia' END,
      updated_at = now()
  WHERE id = p_plano_id;

  IF p_aprovar THEN
    PERFORM public.registrar_interacao(p_plano_id, 'recebimento_coordenacao');
    PERFORM public._fila_notificacao(p_plano_id, 'encaminhamento_coordenacao', 'PLANO DE AULA ENCAMINHADO PARA ANÁLISE DA COORDENAÇÃO');
  ELSE
    PERFORM public.registrar_interacao(p_plano_id, 'devolucao_pedagogia', p_mensagem);
  END IF;

  RETURN v_novo_status;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pedagogia_decidir(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pedagogia_decidir(uuid, boolean, text) TO authenticated;

-- ============================================================
-- 4. coordenacao_decidir
-- ============================================================
CREATE OR REPLACE FUNCTION public.coordenacao_decidir(
  p_plano_id uuid,
  p_publicar boolean,
  p_mensagem text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plano public.planos_aula%ROWTYPE;
  v_novo_status text;
BEGIN
  IF public.current_profile_role() IS DISTINCT FROM 'coordenacao' THEN
    RAISE EXCEPTION 'Apenas a coordenação técnica pode validar esta etapa.';
  END IF;

  SELECT * INTO v_plano FROM public.planos_aula WHERE id = p_plano_id FOR UPDATE;
  IF NOT FOUND OR v_plano.excluido_at IS NOT NULL THEN
    RAISE EXCEPTION 'Plano de aula não encontrado.';
  END IF;

  IF NOT (public.usuario_sem_vinculos() OR public.pasta_no_escopo_do_usuario(v_plano.pasta_id)) THEN
    RAISE EXCEPTION 'Este plano não pertence às pastas vinculadas ao seu usuário.';
  END IF;

  IF v_plano.status <> 'validacao_coordenacao' THEN
    RAISE EXCEPTION 'Este plano não está aguardando validação da coordenação.';
  END IF;

  IF NOT p_publicar AND length(btrim(coalesce(p_mensagem, ''))) < 3 THEN
    RAISE EXCEPTION 'Escreva a orientação para o docente antes de devolver o plano.';
  END IF;

  v_novo_status := CASE WHEN p_publicar THEN 'publicado' ELSE 'devolvido_docente' END;

  UPDATE public.planos_aula
  SET status = v_novo_status,
      devolvido_por = CASE WHEN p_publicar THEN NULL ELSE 'coordenacao' END,
      updated_at = now()
  WHERE id = p_plano_id;

  IF p_publicar THEN
    PERFORM public.registrar_interacao(p_plano_id, 'publicacao');
  ELSE
    PERFORM public.registrar_interacao(p_plano_id, 'devolucao_coordenacao', p_mensagem);
  END IF;

  RETURN v_novo_status;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.coordenacao_decidir(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.coordenacao_decidir(uuid, boolean, text) TO authenticated;

-- ============================================================
-- 5. Corrigir typo no dashboard_gerencial
-- Recria a função completa com 'validacao_pedagogica' (com 'c')
-- nos CASE de planos_com_responsavel
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
  prazos AS (
    SELECT etapa, prazo_dias FROM public.dashboard_config_prazos
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
        count(*) FILTER (WHERE pcr.situacao_prazo = 'atrasado')::int AS planos_atraso,
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

-- ============================================================
-- 6. Backfill: registrar envio inicial para planos sem histórico
-- ============================================================
INSERT INTO public.plano_interacoes (plano_id, autor_id, autor_perfil, tipo, criado_at)
SELECT p.id, p.docente_id, 'docente', 'envio_docente', p.created_at
FROM public.planos_aula p
WHERE p.excluido_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.plano_interacoes i
    WHERE i.plano_id = p.id AND i.tipo = 'envio_docente'
  );

INSERT INTO public.plano_interacoes (plano_id, autor_id, autor_perfil, tipo, criado_at)
SELECT p.id, p.docente_id, 'docente', 'recebimento_pedagogia', p.created_at
FROM public.planos_aula p
WHERE p.excluido_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.plano_interacoes i
    WHERE i.plano_id = p.id AND i.tipo = 'recebimento_pedagogia'
  );

-- Para planos publicados, registrar recebimento_coordenacao e publicacao
-- se não existirem, usando updated_at como data aproximada
INSERT INTO public.plano_interacoes (plano_id, autor_id, autor_perfil, tipo, criado_at)
SELECT p.id, p.docente_id, 'pedagogia', 'recebimento_coordenacao', p.updated_at
FROM public.planos_aula p
WHERE p.excluido_at IS NULL
  AND p.status = 'publicado'
  AND NOT EXISTS (
    SELECT 1 FROM public.plano_interacoes i
    WHERE i.plano_id = p.id AND i.tipo = 'recebimento_coordenacao'
  );

INSERT INTO public.plano_interacoes (plano_id, autor_id, autor_perfil, tipo, criado_at)
SELECT p.id, p.docente_id, 'coordenacao', 'publicacao', p.updated_at
FROM public.planos_aula p
WHERE p.excluido_at IS NULL
  AND p.status = 'publicado'
  AND NOT EXISTS (
    SELECT 1 FROM public.plano_interacoes i
    WHERE i.plano_id = p.id AND i.tipo = 'publicacao'
  );
