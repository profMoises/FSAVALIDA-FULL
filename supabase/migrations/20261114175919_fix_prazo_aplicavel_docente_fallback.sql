/*
# Corrigir aplicação de prazos: prazo do docente como fallback

## Problema
A função obter_prazo_aplicavel só busca prazos do perfil responsável pela etapa atual.
Se um prazo foi cadastrado para "docente" mas o plano está em "validacao_pedagogica",
o prazo não é aplicado — o plano aparece como "sem_prazo".

## Correção
Agora a função também verifica o prazo do docente autor do plano como fallback.
Prioridade: prazo específico da etapa > prazo do docente > sem prazo.
Assim, se houver um prazo configurado para o docente, ele se aplica a todos os
planos daquele docente que ainda não foram publicados.
*/

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

  -- 1. Prioridade: prazo específico da etapa (individual sobre coletiva)
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

  IF FOUND THEN
    RETURN;
  END IF;

  -- 2. Fallback: prazo do docente autor (para etapas pedagogia/coordenacao)
  IF v_perfil_alvo != 'docente' AND p_docente_id IS NOT NULL THEN
    RETURN QUERY
    SELECT cp.data_inicio, cp.data_fim
    FROM public.calendario_prazos cp
    WHERE cp.ativo = true
      AND cp.perfil_alvo = 'docente'
      AND (
        cp.usuarios_ids && ARRAY[p_docente_id]::uuid[]
        OR array_length(cp.usuarios_ids, 1) IS NULL
      )
    ORDER BY
      CASE WHEN array_length(cp.usuarios_ids, 1) IS NULL THEN 1 ELSE 0 END
    LIMIT 1;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.obter_prazo_aplicavel(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.obter_prazo_aplicavel(text, uuid) TO authenticated;
