/*
# Restringe decisões de pedagogia e coordenação às pastas vinculadas

1. Funções alteradas
   - `pedagogia_decidir(plano_id, aprovar, mensagem)`
   - `coordenacao_decidir(plano_id, publicar, mensagem)`

2. Segurança
   - Antes, bastava ter o perfil para decidir QUALQUER plano, de qualquer curso.
     Agora o plano precisa estar em uma pasta do escopo do usuário (ou o usuário
     não ter nenhum vínculo, caso em que o comportamento histórico é mantido).
   - Planos excluídos (soft delete) não podem mais ser decididos.

3. Observações
   - Nenhuma regra de fluxo (status, mensagem obrigatória na devolução) foi alterada.
*/

CREATE OR REPLACE FUNCTION public.pedagogia_decidir(p_plano_id uuid, p_aprovar boolean, p_mensagem text DEFAULT NULL)
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

  v_novo_status := CASE WHEN p_aprovar THEN 'validacao_coordenacao' ELSE 'devolvido_docente' END;

  UPDATE public.planos_aula
  SET status = v_novo_status,
      devolvido_por = CASE WHEN p_aprovar THEN NULL ELSE 'pedagogia' END,
      updated_at = now()
  WHERE id = p_plano_id;

  IF p_aprovar THEN
    PERFORM public._fila_notificacao(p_plano_id, 'encaminhamento_coordenacao', 'PLANO DE AULA ENCAMINHADO PARA ANÁLISE DA COORDENAÇÃO');
  END IF;

  RETURN v_novo_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.coordenacao_decidir(p_plano_id uuid, p_publicar boolean, p_mensagem text DEFAULT NULL)
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

REVOKE EXECUTE ON FUNCTION public.pedagogia_decidir(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pedagogia_decidir(uuid, boolean, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.coordenacao_decidir(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.coordenacao_decidir(uuid, boolean, text) TO authenticated;
