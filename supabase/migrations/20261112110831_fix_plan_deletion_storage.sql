/*
# Corrigir exclusão de planos: remover arquivo via API de storage

## Problema
A função excluir_plano tentava `DELETE FROM storage.objects`, mas o Supabase
possui um trigger `protect_objects_delete` que bloqueia exclusões diretas via SQL
na tabela de storage. Isso causava erro em toda tentativa de exclusão.

## Correção
1. A função excluir_plano não tenta mais excluir o arquivo do storage.
   Ela executa apenas a exclusão lógica (soft delete) e registra o histórico.
2. O arquivo é removido pela API de storage do frontend, que respeita as políticas RLS.
3. Adicionada política de DELETE no bucket "planos" para:
   - Docente: excluir arquivos em sua própria pasta (user_id/path[0]).
   - Admin e coordenacao: excluir qualquer arquivo no bucket "planos".
4. A pedagogia não recebe permissão de exclusão de arquivos.

## Segurança
- A autorização da exclusão lógica continua na função SECURITY DEFINER.
- A política de storage é restrita aos mesmos perfis que podem excluir planos.
- Nenhum dado existente é alterado ou removido.
- Nenhum registro é fisicamente removido do banco.
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

  SELECT *
  INTO v_plano
  FROM public.planos_aula
  WHERE id = p_plano_id
  FOR UPDATE;

  IF NOT FOUND OR v_plano.excluido_at IS NOT NULL THEN
    RAISE EXCEPTION 'Plano de aula não encontrado.';
  END IF;

  IF v_perfil NOT IN ('admin', 'coordenacao')
     AND v_plano.docente_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Você não tem permissão para excluir este plano.';
  END IF;

  UPDATE public.planos_aula
  SET
    excluido_at = now(),
    excluido_por = auth.uid(),
    updated_at = now()
  WHERE id = p_plano_id;

  INSERT INTO public.plano_interacoes (
    plano_id,
    autor_id,
    autor_perfil,
    tipo
  )
  VALUES (
    p_plano_id,
    auth.uid(),
    v_perfil,
    'exclusao_plano'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.excluir_plano(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.excluir_plano(uuid) TO authenticated;

DROP POLICY IF EXISTS "planos_arquivos_delete_autorizado" ON storage.objects;
CREATE POLICY "planos_arquivos_delete_autorizado" ON storage.objects FOR DELETE
  TO authenticated USING (
    bucket_id = 'planos'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.current_profile_role() IN ('admin', 'coordenacao')
    )
  );
