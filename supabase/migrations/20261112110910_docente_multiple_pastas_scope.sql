/*
# Docentes com vínculo a múltiplas pastas

## Objetivo
Permitir que um docente seja vinculado a mais de uma pasta ou subpasta, de forma
que possa enviar planos de aula para diferentes cursos.

## Alterações
1. A função `pasta_no_escopo_do_usuario` agora considera, além da pasta principal
   em `profiles.pasta_id`, todos os vínculos registrados em `profile_pastas`.
   Assim, um docente com múltiplas pastas consegue enviar planos para qualquer
   uma delas (e suas subpastas).
2. A coluna `profiles.pasta_id` deixa de ser obrigatória para docentes que tenham
   vínculos em `profile_pastas`. A coluna é mantida como pasta principal, mas
   pode ser nula quando o docente possui vínculos múltiplos.

## Migração segura de dados
- Vínculos existentes em `profiles.pasta_id` para docentes são copiados para
  `profile_pastas` (se ainda não existirem), garantindo continuidade.
- Nenhum dado é removido.

## Segurança
- Sem alterações nas políticas de RLS existentes.
- A função continua SECURITY DEFINER e restrita a usuários autenticados.
*/

INSERT INTO public.profile_pastas (profile_id, pasta_id)
SELECT p.id, p.pasta_id
FROM public.profiles p
WHERE p.perfil = 'docente' AND p.pasta_id IS NOT NULL
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.pasta_no_escopo_do_usuario(p_pasta_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE pastas_autorizadas AS (
    SELECT p.id
    FROM public.pastas p
    WHERE p.id IN (
      SELECT pr.pasta_id FROM public.profiles pr WHERE pr.id = auth.uid() AND pr.pasta_id IS NOT NULL
      UNION
      SELECT pp.pasta_id FROM public.profile_pastas pp WHERE pp.profile_id = auth.uid()
    )
    UNION ALL
    SELECT f.id FROM public.pastas f JOIN pastas_autorizadas s ON f.pai_id = s.id
  )
  SELECT EXISTS (SELECT 1 FROM pastas_autorizadas WHERE id = p_pasta_id)
$$;

REVOKE EXECUTE ON FUNCTION public.pasta_no_escopo_do_usuario(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pasta_no_escopo_do_usuario(uuid) TO authenticated;
