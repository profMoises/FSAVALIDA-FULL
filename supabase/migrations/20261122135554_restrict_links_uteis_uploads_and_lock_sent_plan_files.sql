/*
# Itens 3 e 4 da auditoria: arquivos dos Links Úteis e exclusão de arquivos de planos enviados

## Item 3 — Links Úteis
1. Bucket `links-uteis` (continua PRIVADO):
   - `file_size_limit` = 10 MB (antes: sem limite).
   - `allowed_mime_types` = PDF, Word, Excel, PowerPoint (OOXML e legado), OpenDocument,
     CSV, TXT, PNG, JPEG (antes: qualquer tipo).
2. Upload direto pelo navegador removido: as políticas `admin_write_links_uteis_bucket`
   (INSERT) e `admin_update_links_uteis_bucket` (UPDATE) foram excluídas. O envio passa a
   ser feito somente pela Edge Function `links-uteis-upload`, que confirma que o chamador
   é admin, verifica tamanho, extensão e o CONTEÚDO real do arquivo (assinatura binária /
   estrutura interna) antes de gravar com `service_role`.
3. Mantidos sem alteração: leitura (`read_links_uteis_bucket`) e exclusão pelo admin
   (`admin_delete_links_uteis_bucket`). Arquivos existentes não são tocados; limites de
   bucket só valem para novos envios.

## Item 4 — Arquivos de planos
1. Nova função `public.arquivo_plano_em_uso(p_path)` (SECURITY DEFINER): true quando o
   arquivo é o arquivo atual de um plano ativo (não excluído). Todo plano ativo já foi
   enviado para validação (não existe status de rascunho).
2. Política `planos_arquivos_delete_autorizado` recriada: o docente só remove arquivos da
   própria pasta que NÃO estejam em uso por um plano ativo (envios que falharam, versões
   anteriores substituídas em reenvio e arquivos de planos já excluídos pela função oficial).
   A parte de admin/coordenação (`arquivo_plano_removivel`) permanece idêntica.
3. Tramitação, compartilhamento, upload, leitura e a função `excluir_plano` não mudam.

## Recuperação (definições anteriores)
- admin_write_links_uteis_bucket: FOR INSERT TO authenticated
  WITH CHECK ((bucket_id = 'links-uteis') AND (current_profile_role() = 'admin'))
- admin_update_links_uteis_bucket: FOR UPDATE TO authenticated
  USING ((bucket_id = 'links-uteis') AND (current_profile_role() = 'admin'))
- planos_arquivos_delete_autorizado: FOR DELETE TO authenticated
  USING ((bucket_id = 'planos') AND (((storage.foldername(name))[1] = auth.uid()::text)
  OR arquivo_plano_removivel(name)))
- bucket links-uteis: file_size_limit NULL, allowed_mime_types NULL
Nenhum dado ou arquivo é alterado ou removido.
*/

UPDATE storage.buckets
SET file_size_limit = 10485760,
    allowed_mime_types = ARRAY[
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/msword',
      'application/vnd.ms-excel',
      'application/vnd.ms-powerpoint',
      'application/vnd.oasis.opendocument.text',
      'application/vnd.oasis.opendocument.spreadsheet',
      'application/vnd.oasis.opendocument.presentation',
      'text/csv',
      'text/plain',
      'image/png',
      'image/jpeg'
    ]
WHERE id = 'links-uteis';

DROP POLICY IF EXISTS "admin_write_links_uteis_bucket" ON storage.objects;
DROP POLICY IF EXISTS "admin_update_links_uteis_bucket" ON storage.objects;

CREATE OR REPLACE FUNCTION public.arquivo_plano_em_uso(p_path text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
SELECT EXISTS (
  SELECT 1 FROM public.planos_aula p
  WHERE p.arquivo_path = p_path
  AND p.excluido_at IS NULL
)
$function$;

REVOKE EXECUTE ON FUNCTION public.arquivo_plano_em_uso(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.arquivo_plano_em_uso(text) TO authenticated, service_role;

DROP POLICY IF EXISTS "planos_arquivos_delete_autorizado" ON storage.objects;
CREATE POLICY "planos_arquivos_delete_autorizado" ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'planos'
  AND (
    (
      (storage.foldername(name))[1] = (auth.uid())::text
      AND NOT public.arquivo_plano_em_uso(name)
    )
    OR public.arquivo_plano_removivel(name)
  )
);
