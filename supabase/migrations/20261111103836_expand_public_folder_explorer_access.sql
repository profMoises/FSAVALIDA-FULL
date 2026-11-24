/*
# Acesso amplo ao explorador de publicações

1. Objetivo
- Permitir que qualquer usuário autenticado navegue por toda a árvore de pastas.
- Permitir que qualquer usuário autenticado veja os planos de aula já publicados, independentemente da pasta vinculada ao seu perfil.
- Manter planos em validação e devolvidos protegidos pelas regras existentes.

2. Segurança
- A tabela `pastas` continua somente com leitura para usuários autenticados e escrita administrativa.
- A tabela `planos_aula` continua protegida por RLS; o novo acesso cobre apenas linhas com `status = 'publicado'` ou o próprio plano do docente.
- A leitura dos arquivos no bucket privado `planos` segue a mesma regra: o arquivo do próprio usuário ou de um plano publicado.
- O serviço administrativo recebe permissões explícitas para gravar perfis e vínculos de pastas.

3. Compatibilidade
- Nenhuma coluna ou registro existente é removido.
- Os vínculos múltiplos de pastas continuam opcionais e não limitam a navegação pública das publicações.
*/

GRANT INSERT, UPDATE, DELETE ON public.profiles TO service_role;
GRANT SELECT, INSERT, DELETE ON public.profile_pastas TO service_role;

DROP POLICY IF EXISTS "select_planos_docente" ON public.planos_aula;
CREATE POLICY "select_planos_docente" ON public.planos_aula FOR SELECT
  TO authenticated USING (
    docente_id = auth.uid()
    OR status = 'publicado'
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
      )
    )
  );
