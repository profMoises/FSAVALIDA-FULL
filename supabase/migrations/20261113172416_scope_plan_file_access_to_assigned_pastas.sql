/*
# Restringe o acesso aos arquivos dos planos às pastas vinculadas

1. Novas funções auxiliares
   - `arquivo_plano_visivel(p_path)`: indica se o usuário atual pode ler o arquivo
     de um plano, considerando perfil, vínculos de pastas e status do plano.
   - `arquivo_plano_removivel(p_path)`: indica se o usuário atual pode remover o
     arquivo de um plano (admin sempre; coordenação apenas dentro do seu escopo).

2. Segurança (bucket `planos`)
   - A política de leitura liberava TODOS os arquivos para qualquer usuário de
     pedagogia, coordenação ou administração, sem considerar as pastas vinculadas.
     Agora pedagogia e coordenação só alcançam arquivos de planos das suas pastas.
   - A política de exclusão liberava qualquer arquivo para a coordenação; agora
     exige que o plano esteja no escopo dela.
   - Docentes continuam lendo e removendo os próprios arquivos e lendo os planos
     publicados das pastas às quais estão vinculados.
*/

CREATE OR REPLACE FUNCTION public.arquivo_plano_visivel(p_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.planos_aula p
    WHERE p.arquivo_path = p_path
      AND p.excluido_at IS NULL
      AND (
        public.current_profile_role() = 'admin'
        OR (
          public.current_profile_role() = ANY (ARRAY['pedagogia'::text, 'coordenacao'::text])
          AND (public.usuario_sem_vinculos() OR public.pasta_no_escopo_do_usuario(p.pasta_id))
        )
        OR (
          public.current_profile_role() = 'docente'
          AND p.status = 'publicado'
          AND public.pasta_no_escopo_do_usuario(p.pasta_id)
        )
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.arquivo_plano_removivel(p_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.planos_aula p
    WHERE p.arquivo_path = p_path
      AND (
        public.current_profile_role() = 'admin'
        OR (
          public.current_profile_role() = 'coordenacao'
          AND (public.usuario_sem_vinculos() OR public.pasta_no_escopo_do_usuario(p.pasta_id))
        )
      )
  )
$$;

REVOKE EXECUTE ON FUNCTION public.arquivo_plano_visivel(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.arquivo_plano_visivel(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.arquivo_plano_removivel(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.arquivo_plano_removivel(text) TO authenticated;

DROP POLICY IF EXISTS "planos_arquivos_leitura" ON storage.objects;
CREATE POLICY "planos_arquivos_leitura"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'planos'
  AND (
    (storage.foldername(name))[1] = (auth.uid())::text
    OR public.arquivo_plano_visivel(name)
  )
);

DROP POLICY IF EXISTS "planos_arquivos_delete_autorizado" ON storage.objects;
CREATE POLICY "planos_arquivos_delete_autorizado"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'planos'
  AND (
    (storage.foldername(name))[1] = (auth.uid())::text
    OR public.arquivo_plano_removivel(name)
  )
);
