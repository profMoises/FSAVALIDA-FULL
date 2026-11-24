/*
# Estrutura do sistema de validação de planos de aula

1. Novas tabelas
- `pastas`: pastas e subpastas (uma pasta pode ter uma pasta pai).
- `profiles`: perfil de cada usuário (nome, e-mail, perfil de acesso e pasta vinculada). Cada linha corresponde a um usuário de autenticação.
- `planos_aula`: planos de aula enviados pelos docentes, com o arquivo da planilha e a etapa atual do fluxo.

2. Bucket de arquivos
- `planos`: bucket privado para as planilhas, limitado a 10 MB por arquivo.

3. Funções auxiliares
- `current_profile_role()`: devolve o perfil do usuário logado.
- `pasta_no_escopo_do_usuario(pasta)`: verifica se a pasta está na pasta vinculada ao usuário ou em alguma subpasta dela.

4. Segurança
- RLS ativado em todas as tabelas.
- Administrador gerencia pastas. Ninguém escreve diretamente em perfis ou planos: as mudanças de status passam pelas funções do fluxo e pela função de administração de usuários.
- Docentes veem os próprios planos e os publicados dentro da pasta deles. Pedagogia, coordenação e administração veem todos os planos.
- Arquivos: docentes enviam apenas para a própria pasta de arquivos; leitura permitida ao dono, administração, pedagogia e coordenação.

5. Notas importantes
- Planos e pastas usam proteção contra exclusão acidental: não é possível apagar um usuário ou pasta que tenha planos vinculados.
- Pastas excluídas removem as subpastas vazias; usuários perdem apenas o vínculo com a pasta.
*/

CREATE TABLE IF NOT EXISTS public.pastas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL CHECK (length(btrim(nome)) > 0),
  pai_id uuid REFERENCES public.pastas(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pastas_pai_id_idx ON public.pastas (pai_id);

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text NOT NULL CHECK (length(btrim(nome)) > 0),
  email text NOT NULL,
  perfil text NOT NULL CHECK (perfil IN ('admin', 'docente', 'pedagogia', 'coordenacao')),
  pasta_id uuid REFERENCES public.pastas(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS profiles_pasta_id_idx ON public.profiles (pasta_id);

CREATE TABLE IF NOT EXISTS public.planos_aula (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL CHECK (length(btrim(titulo)) > 0),
  docente_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  pasta_id uuid NOT NULL REFERENCES public.pastas(id) ON DELETE RESTRICT,
  arquivo_path text NOT NULL,
  arquivo_nome text NOT NULL,
  arquivo_tamanho bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'validacao_pedagogica' CHECK (
    status IN ('validacao_pedagogica', 'validacao_coordenacao', 'devolvido_docente', 'publicado')
  ),
  devolvido_por text CHECK (devolvido_por IN ('pedagogia', 'coordenacao')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT planos_devolvido_consistente CHECK ((status = 'devolvido_docente') = (devolvido_por IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS planos_aula_docente_id_idx ON public.planos_aula (docente_id);
CREATE INDEX IF NOT EXISTS planos_aula_pasta_id_idx ON public.planos_aula (pasta_id);
CREATE INDEX IF NOT EXISTS planos_aula_status_idx ON public.planos_aula (status);

CREATE OR REPLACE FUNCTION public.current_profile_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT perfil FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.pasta_no_escopo_do_usuario(p_pasta_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE subarvore AS (
    SELECT p.id FROM public.pastas p
    WHERE p.id = (SELECT pr.pasta_id FROM public.profiles pr WHERE pr.id = auth.uid())
    UNION ALL
    SELECT f.id FROM public.pastas f JOIN subarvore s ON f.pai_id = s.id
  )
  SELECT EXISTS (SELECT 1 FROM subarvore WHERE id = p_pasta_id)
$$;

REVOKE EXECUTE ON FUNCTION public.current_profile_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_profile_role() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.pasta_no_escopo_do_usuario(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pasta_no_escopo_do_usuario(uuid) TO authenticated;

ALTER TABLE public.pastas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planos_aula ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pastas TO authenticated;
GRANT SELECT ON public.profiles TO authenticated;
GRANT SELECT ON public.planos_aula TO authenticated;

DROP POLICY IF EXISTS "select_pastas" ON public.pastas;
CREATE POLICY "select_pastas" ON public.pastas FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_pastas_admin" ON public.pastas;
CREATE POLICY "insert_pastas_admin" ON public.pastas FOR INSERT
  TO authenticated WITH CHECK (public.current_profile_role() = 'admin');

DROP POLICY IF EXISTS "update_pastas_admin" ON public.pastas;
CREATE POLICY "update_pastas_admin" ON public.pastas FOR UPDATE
  TO authenticated USING (public.current_profile_role() = 'admin')
  WITH CHECK (public.current_profile_role() = 'admin');

DROP POLICY IF EXISTS "delete_pastas_admin" ON public.pastas;
CREATE POLICY "delete_pastas_admin" ON public.pastas FOR DELETE
  TO authenticated USING (public.current_profile_role() = 'admin');

-- Nomes, perfis e e-mails dos usuários são visíveis a todos os usuários logados, pois o sistema é interno.
DROP POLICY IF EXISTS "select_profiles" ON public.profiles;
CREATE POLICY "select_profiles" ON public.profiles FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "select_planos_equipe" ON public.planos_aula;
CREATE POLICY "select_planos_equipe" ON public.planos_aula FOR SELECT
  TO authenticated USING (public.current_profile_role() IN ('admin', 'pedagogia', 'coordenacao'));

DROP POLICY IF EXISTS "select_planos_docente" ON public.planos_aula;
CREATE POLICY "select_planos_docente" ON public.planos_aula FOR SELECT
  TO authenticated USING (
    docente_id = auth.uid()
    OR (status = 'publicado' AND public.pasta_no_escopo_do_usuario(pasta_id))
  );

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('planos', 'planos', false, 10485760)
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 10485760;

DROP POLICY IF EXISTS "planos_arquivos_upload_docente" ON storage.objects;
CREATE POLICY "planos_arquivos_upload_docente" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (
    bucket_id = 'planos'
    AND public.current_profile_role() = 'docente'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "planos_arquivos_leitura" ON storage.objects;
CREATE POLICY "planos_arquivos_leitura" ON storage.objects FOR SELECT
  TO authenticated USING (
    bucket_id = 'planos'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.current_profile_role() IN ('admin', 'pedagogia', 'coordenacao')
    )
  );
