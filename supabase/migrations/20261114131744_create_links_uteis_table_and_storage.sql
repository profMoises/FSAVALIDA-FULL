/*
# Links Úteis — recursos de apoio para docentes

## Objetivo
Criar uma tabela para armazenar links úteis gerenciados pelo administrador,
visíveis para docentes em um modal na área deles. Os links podem ser externos
(URL) ou arquivos para download (armazenados no Supabase Storage).

## Nova tabela: links_uteis
- `id` (uuid, PK)
- `titulo` (text, not null) — nome do recurso
- `descricao` (text) — descrição curta
- `url` (text) — endereço externo ou caminho do arquivo no storage
- `tipo` (text, not null) — 'link_externo' ou 'arquivo_download'
- `icone` (text, not null default 'link') — nome do ícone lucide-react
- `ordem` (int, not null default 0) — ordem de exibição
- `ativo` (boolean, not null default true)
- `criado_por` (uuid, FK profiles) — quem cadastrou
- `criado_em` (timestamptz) — data de criação
- `atualizado_em` (timestamptz) — última alteração

## Storage
- Bucket `links-uteis` para armazenar arquivos de download
- Docentes podem ler (SELECT + download via signed URL)
- Admin pode gravar (INSERT + upload)

## Segurança — RLS
- SELECT: todos os autenticados veem links ativos
- INSERT/UPDATE/DELETE: apenas admin
- Storage: leitura pública para links ativos, gravação apenas admin
*/

CREATE TABLE IF NOT EXISTS public.links_uteis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  descricao text,
  url text,
  tipo text NOT NULL CHECK (tipo IN ('link_externo', 'arquivo_download')) DEFAULT 'link_externo',
  icone text NOT NULL DEFAULT 'link',
  ordem int NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  criado_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS links_uteis_ordem_idx ON public.links_uteis (ordem, ativo);

ALTER TABLE public.links_uteis ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.links_uteis TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.links_uteis TO authenticated;

DROP POLICY IF EXISTS "select_links_uteis" ON public.links_uteis;
CREATE POLICY "select_links_uteis"
ON public.links_uteis FOR SELECT
TO authenticated USING (ativo = true);

DROP POLICY IF EXISTS "admin_insert_links_uteis" ON public.links_uteis;
CREATE POLICY "admin_insert_links_uteis"
ON public.links_uteis FOR INSERT
TO authenticated
WITH CHECK (public.current_profile_role() = 'admin');

DROP POLICY IF EXISTS "admin_update_links_uteis" ON public.links_uteis;
CREATE POLICY "admin_update_links_uteis"
ON public.links_uteis FOR UPDATE
TO authenticated
USING (public.current_profile_role() = 'admin')
WITH CHECK (public.current_profile_role() = 'admin');

DROP POLICY IF EXISTS "admin_delete_links_uteis" ON public.links_uteis;
CREATE POLICY "admin_delete_links_uteis"
ON public.links_uteis FOR DELETE
TO authenticated
USING (public.current_profile_role() = 'admin');

-- Admin também pode ver links inativos (para gerenciar)
DROP POLICY IF EXISTS "admin_select_all_links" ON public.links_uteis;
CREATE POLICY "admin_select_all_links"
ON public.links_uteis FOR SELECT
TO authenticated
USING (public.current_profile_role() = 'admin');

-- ============================================================
-- Storage bucket para arquivos de download
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('links-uteis', 'links-uteis', false)
ON CONFLICT (id) DO NOTHING;

-- Leitura: admin pode listar, todos autenticados podem baixar via signed URL
DROP POLICY IF EXISTS "read_links_uteis_bucket" ON storage.objects;
CREATE POLICY "read_links_uteis_bucket"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'links-uteis');

-- Gravação: apenas admin
DROP POLICY IF EXISTS "admin_write_links_uteis_bucket" ON storage.objects;
CREATE POLICY "admin_write_links_uteis_bucket"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'links-uteis' AND public.current_profile_role() = 'admin');

DROP POLICY IF EXISTS "admin_update_links_uteis_bucket" ON storage.objects;
CREATE POLICY "admin_update_links_uteis_bucket"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'links-uteis' AND public.current_profile_role() = 'admin');

DROP POLICY IF EXISTS "admin_delete_links_uteis_bucket" ON storage.objects;
CREATE POLICY "admin_delete_links_uteis_bucket"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'links-uteis' AND public.current_profile_role() = 'admin');
