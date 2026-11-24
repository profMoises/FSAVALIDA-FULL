/*
# Docente não pode excluir plano após o envio para validação (complemento do item 4)

## O que muda
1. Função `public.excluir_plano(uuid)`:
   - Docentes deixam de poder excluir planos. Todo registro em `planos_aula` nasce pela
     função `enviar_plano` já com status `validacao_pedagogica` (não existe rascunho),
     portanto todo plano existente já foi enviado pela primeira vez. A recusa vale para
     qualquer status: em validação pedagógica, em validação da coordenação, devolvido
     (pela pedagogia ou coordenação) e publicado.
   - Mensagem: "Planos enviados para validação não podem ser excluídos. Se houver
     devolutiva, envie uma nova versão pelo botão Enviar ajustes."
   - Administrador (qualquer plano) e coordenação (planos no escopo) continuam iguais.
   - Demais perfis continuam recebendo "Você não tem permissão para excluir este plano."
2. Assinatura, SECURITY DEFINER, search_path e permissões de execução inalterados.

## O que não muda
- Reenvio (`reenviar_plano`), tramitação, histórico (`plano_interacoes`), compartilhamento,
  consulta, download e políticas de armazenamento.
- Nenhum dado é alterado ou removido.

## Recuperação (corpo anterior do bloco de permissão)
  IF v_perfil = 'admin' THEN NULL;
  ELSIF v_perfil = 'coordenacao' THEN
    IF NOT (public.usuario_sem_vinculos() OR public.pasta_no_escopo_do_usuario(v_plano.pasta_id)) THEN
      RAISE EXCEPTION 'Você não tem permissão para excluir este plano.';
    END IF;
  ELSIF v_plano.docente_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Você não tem permissão para excluir este plano.';
  END IF;
*/

CREATE OR REPLACE FUNCTION public.excluir_plano(p_plano_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
ELSE
RAISE EXCEPTION 'Planos enviados para validação não podem ser excluídos. Se houver devolutiva, envie uma nova versão pelo botão Enviar ajustes.';
END IF;

UPDATE public.planos_aula
SET excluido_at = now(),
excluido_por = auth.uid(),
updated_at = now()
WHERE id = p_plano_id;

INSERT INTO public.plano_interacoes (plano_id, autor_id, autor_perfil, tipo)
VALUES (p_plano_id, auth.uid(), v_perfil, 'exclusao_plano');
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.excluir_plano(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.excluir_plano(uuid) TO authenticated, service_role;
