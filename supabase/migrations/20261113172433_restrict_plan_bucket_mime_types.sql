/*
# Limita os tipos de arquivo aceitos no bucket dos planos

1. Alteração
   - `storage.buckets.allowed_mime_types` do bucket `planos` passa a aceitar apenas
     planilhas (.xls / .xlsx) e o tipo genérico enviado por alguns navegadores.

2. Segurança
   - A validação de extensão existia apenas no navegador; um upload direto podia
     gravar qualquer conteúdo (HTML, SVG, executáveis) no bucket institucional.
   - O limite de 10 MB já existente é mantido.
*/

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream'
]
WHERE id = 'planos';
