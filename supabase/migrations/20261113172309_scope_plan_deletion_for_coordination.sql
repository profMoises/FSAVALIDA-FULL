/*
# Restringe a exclusão de planos pela coordenação às pastas vinculadas

1. Função alterada
   - `excluir_plano(p_plano_id)`

2. Segurança
   - A coordenação podia excluir (soft delete) qualquer plano de qualquer curso.
     Agora precisa que o plano esteja em uma pasta do seu escopo (ou que não tenha
     nenhum vínculo cadastrado, mantendo o comportamento anterior nesse caso).
   - Administradores continuam podendo excluir qualquer plano.
   - Docentes continuam podendo excluir apenas os próprios planos.

3. Observações
   - O histórico (`plano_interacoes`) continua sendo registrado da mesma forma.
*/

CREATE OR REPLACE FUNCTION public.excluir_plano(p_plano_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plano public.planos_aula%ROWTYPE;
  v_perfil text;
BEGIN
  v_perfil := public.current_profile_role();

  SELECT * INTO v_plano FROM public.planos_aula WHERE id = p_plano_id FOR UPDATE;

  IF NOT FOUND OR v_plano.excluido_at IS NOT NULL THEN
    RAISE EXCEPTION 'Plano de aula não encontrado.';
  END IF;

  IF v_perfil = 'admin' THEN
    NULL;
  ELSIF v_perfil = 'coordenacao' THEN
    IF NOT (public.usuario_sem_vinculos() OR public.pasta_no_escopo_do_usuario(v_plano.pasta_id)) THEN
      RAISE EXCEPTION 'Você não tem permissão para excluir este plano.';
    END IF;
  ELSIF v_plano.docente_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Você não tem permissão para excluir este plano.';
  END IF;

  UPDATE public.planos_aula
  SET excluido_at = now(),
      excluido_por = auth.uid(),
      updated_at = now()
  WHERE id = p_plano_id;

  INSERT INTO public.plano_interacoes (plano_id, autor_id, autor_perfil, tipo)
  VALUES (p_plano_id, auth.uid(), v_perfil, 'exclusao_plano');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.excluir_plano(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.excluir_plano(uuid) TO authenticated;
