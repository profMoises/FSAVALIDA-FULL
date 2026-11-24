/*
# Restringe a leitura do cadastro de usuários

1. Políticas alteradas
   - `select_profiles` em `public.profiles` (antes: USING (true))
   - `select_vinculos_pastas` em `public.profile_pastas` (antes: USING (true))

2. Segurança
   - Qualquer usuário autenticado, inclusive docentes, conseguia baixar nome,
     e-mail e perfil de TODOS os usuários. Agora um docente enxerga apenas:
     o próprio cadastro, os perfis que não são de docentes (necessário para exibir
     o autor das análises no histórico) e os docentes cujos planos publicados ele
     já pode ver dentro do seu escopo de pastas.
   - Administração, pedagogia e coordenação continuam enxergando todos os
     cadastros, pois as telas de usuários e os painéis dependem disso.
   - Os vínculos de pastas passam a ser visíveis apenas para o próprio usuário e
     para os perfis de gestão.

3. Observações
   - Nenhum dado é alterado ou removido.
*/

DROP POLICY IF EXISTS "select_profiles" ON public.profiles;
CREATE POLICY "select_profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (
  id = auth.uid()
  OR public.current_profile_role() = ANY (ARRAY['admin'::text, 'pedagogia'::text, 'coordenacao'::text])
  OR perfil <> 'docente'
  OR EXISTS (
    SELECT 1 FROM public.planos_aula p
    WHERE p.docente_id = profiles.id
      AND p.excluido_at IS NULL
      AND p.status = 'publicado'
      AND public.pasta_no_escopo_do_usuario(p.pasta_id)
  )
);

DROP POLICY IF EXISTS "select_vinculos_pastas" ON public.profile_pastas;
CREATE POLICY "select_vinculos_pastas"
ON public.profile_pastas FOR SELECT
TO authenticated
USING (
  profile_id = auth.uid()
  OR public.current_profile_role() = ANY (ARRAY['admin'::text, 'pedagogia'::text, 'coordenacao'::text])
);
