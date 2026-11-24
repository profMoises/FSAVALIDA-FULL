/*
# Correção crítica de segurança: restringir acesso do docente às pastas vinculadas

## Problema
A migração `expand_public_folder_explorer_access` tornou visíveis a TODOS os
docentes TODOS os planos publicados, sem filtrar pela pasta autorizada.
Da mesma forma, a política de leitura do bucket `planos` permitia baixar
qualquer arquivo de plano publicado, mesmo de pastas às quais o docente
não tem acesso.

## Correção
1. `select_planos_docente`: o docente vê planos publicados APENAS se a pasta
   do plano estiver em seu escopo autorizado (pasta_id + profile_pastas +
   subpastas descendentes). Os demais perfis (admin, pedagogia, coordenacao)
   continuam vendo todos os planos sem excluidos, como antes.
2. `planos_arquivos_leitura`: o docente pode baixar apenas:
   - Seus próprios arquivos (pasta user_id/path[0])
   - Arquivos de planos publicados cuja pasta está em seu escopo
   Admin, pedagogia e coordenacao mantêm acesso total ao bucket.

## Segurança
- Nenhum dado é alterado ou removido.
- As políticas existentes para admin, pedagogia e coordenacao são preservadas.
- A função `pasta_no_escopo_do_usuario` já considera múltiplas pastas.
*/

DROP POLICY IF EXISTS "select_planos_docente" ON public.planos_aula;
CREATE POLICY "select_planos_docente" ON public.planos_aula FOR SELECT
  TO authenticated USING (
    excluido_at IS NULL
    AND (
      docente_id = auth.uid()
      OR (
        status = 'publicado'
        AND public.pasta_no_escopo_do_usuario(pasta_id)
      )
      OR public.current_profile_role() IN ('admin', 'pedagogia', 'coordenacao')
    )
  );

DROP POLICY IF EXISTS "planos_arquivos_leitura" ON storage.objects;
CREATE POLICY "planos_arquivos_leitura" ON storage.objects FOR SELECT
  TO authenticated USING (
    bucket_id = 'planos'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.current_profile_role() IN ('admin', 'pedagogia', 'coordenacao')
      OR EXISTS (
        SELECT 1
        FROM public.planos_aula p
        WHERE p.arquivo_path = storage.objects.name
          AND p.status = 'publicado'
          AND p.excluido_at IS NULL
          AND (
            public.current_profile_role() = 'docente'
            AND public.pasta_no_escopo_do_usuario(p.pasta_id)
            OR public.current_profile_role() IN ('admin', 'pedagogia', 'coordenacao')
          )
      )
    )
  );
