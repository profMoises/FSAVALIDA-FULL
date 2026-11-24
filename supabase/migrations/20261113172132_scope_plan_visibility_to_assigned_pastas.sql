/*
# Restringe a leitura de planos às pastas vinculadas ao usuário

1. Nova função
   - `usuario_sem_vinculos()`: indica se o usuário atual não possui nenhuma pasta
     vinculada (nem em `profiles.pasta_id`, nem em `profile_pastas`). Nesse caso o
     comportamento histórico de "vê todas as pastas" é preservado.

2. Segurança
   - A política `select_planos_equipe` deixava pedagogia e coordenação lerem TODOS
     os planos de TODAS as pastas. Passa a exigir que a pasta do plano esteja no
     escopo do usuário (ou que ele não tenha vínculos).
   - A política `select_planos_docente` perde o ramo amplo de equipe (coberto pela
     política acima) e mantém: plano próprio ou plano publicado dentro do escopo.

3. Observações
   - Administradores continuam vendo tudo.
   - Nenhum dado é alterado ou removido.
*/

CREATE OR REPLACE FUNCTION public.usuario_sem_vinculos()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.profile_pastas pp WHERE pp.profile_id = auth.uid())
     AND NOT EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = auth.uid() AND pr.pasta_id IS NOT NULL)
$$;

REVOKE EXECUTE ON FUNCTION public.usuario_sem_vinculos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.usuario_sem_vinculos() TO authenticated;

DROP POLICY IF EXISTS "select_planos_equipe" ON public.planos_aula;
CREATE POLICY "select_planos_equipe"
ON public.planos_aula FOR SELECT
TO authenticated
USING (
  excluido_at IS NULL
  AND (
    public.current_profile_role() = 'admin'
    OR (
      public.current_profile_role() = ANY (ARRAY['pedagogia'::text, 'coordenacao'::text])
      AND (public.usuario_sem_vinculos() OR public.pasta_no_escopo_do_usuario(pasta_id))
    )
  )
);

DROP POLICY IF EXISTS "select_planos_docente" ON public.planos_aula;
CREATE POLICY "select_planos_docente"
ON public.planos_aula FOR SELECT
TO authenticated
USING (
  excluido_at IS NULL
  AND (
    docente_id = auth.uid()
    OR (status = 'publicado' AND public.pasta_no_escopo_do_usuario(pasta_id))
  )
);
