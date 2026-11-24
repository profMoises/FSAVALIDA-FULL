/*
# Bloquear usuários autenticados sem perfil válido (Item 2 da auditoria)

## Problema
Algumas verificações tratavam "sem perfil" como autorização:
- `relatorio_acessos` usava `current_profile_role() != 'admin'`; com perfil NULL o IF
  resulta em NULL e a exceção não era disparada (vazava nomes/e-mails de todos).
- `dashboard_gerencial` (e `dashboard_dados`, que o chama) caía no ELSE e liberava todas as pastas.
- `obter_prazo_aplicavel` e `verificar_sobreposicao_periodo` não verificavam perfil.
- Políticas de leitura com `USING (true)` ou cláusulas abertas liberavam dados a qualquer
  autenticado: pastas, prazos, histórico de prazos, configuração de prazos, links úteis,
  arquivos de links úteis e cadastros de usuários não docentes.

## Mudanças
1. Nova função `public.perfil_valido()` (SECURITY DEFINER, STABLE): true somente se o usuário
   logado tem linha em `profiles` com perfil admin, docente, pedagogia ou coordenacao.
   EXECUTE revogado de PUBLIC/anon e concedido a `authenticated`.
2. Funções corrigidas (corpo preservado; apenas a verificação foi ajustada):
   - `relatorio_acessos`: `!=` trocado por `IS DISTINCT FROM`.
   - `dashboard_gerencial`: nega quando o perfil não é válido.
   - `obter_prazo_aplicavel`: retorna vazio quando o perfil não é válido.
   - `verificar_sobreposicao_periodo`: nega quando o perfil não é válido.
3. Políticas recriadas exigindo `perfil_valido()` (mesmas regras para perfis legítimos):
   - `pastas.select_pastas`
   - `calendario_prazos.select_calendario_prazos`
   - `calendario_prazos_historico.select_calendario_prazos_hist`
   - `dashboard_config_prazos.select_config_prazos`
   - `links_uteis.select_links_uteis`
   - `storage.objects.read_links_uteis_bucket`
   - `profiles.select_profiles` (o próprio usuário continua vendo a própria linha)

## O que NÃO muda
Regras de compartilhamento de planos, tramitação, exclusão de planos/arquivos, demais
políticas e dados. Nenhuma linha é alterada ou removida.
*/

CREATE OR REPLACE FUNCTION public.perfil_valido()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
SELECT EXISTS (
  SELECT 1 FROM public.profiles
  WHERE id = auth.uid()
  AND perfil IN ('admin', 'docente', 'pedagogia', 'coordenacao')
)
$function$;

REVOKE EXECUTE ON FUNCTION public.perfil_valido() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.perfil_valido() TO authenticated, service_role;

DO $$
DECLARE
  d text;
BEGIN
  d := pg_get_functiondef('public.relatorio_acessos(text,timestamptz,timestamptz)'::regprocedure);
  IF position('current_profile_role() IS DISTINCT FROM ''admin''' in d) = 0 THEN
    d := replace(d,
      'IF public.current_profile_role() != ''admin'' THEN',
      'IF public.current_profile_role() IS DISTINCT FROM ''admin'' THEN');
    IF position('current_profile_role() IS DISTINCT FROM ''admin''' in d) = 0 THEN
      RAISE EXCEPTION 'relatorio_acessos: trecho esperado não encontrado';
    END IF;
    EXECUTE d;
  END IF;

  d := pg_get_functiondef('public.dashboard_gerencial(uuid,uuid,text,text,timestamptz,timestamptz)'::regprocedure);
  IF position('usuário sem perfil válido' in d) = 0 THEN
    d := replace(d,
      E'IF v_perfil = ''docente'' THEN',
      E'IF v_perfil IS NULL OR v_perfil NOT IN (''admin'', ''pedagogia'', ''coordenacao'', ''docente'') THEN\nRAISE EXCEPTION ''Acesso negado: usuário sem perfil válido.'';\nEND IF;\n\nIF v_perfil = ''docente'' THEN');
    IF position('usuário sem perfil válido' in d) = 0 THEN
      RAISE EXCEPTION 'dashboard_gerencial: trecho esperado não encontrado';
    END IF;
    EXECUTE d;
  END IF;

  d := pg_get_functiondef('public.obter_prazo_aplicavel(text,uuid)'::regprocedure);
  IF position('perfil_valido()' in d) = 0 THEN
    d := replace(d,
      E'BEGIN\nv_perfil_alvo := CASE',
      E'BEGIN\nIF NOT public.perfil_valido() THEN\nRETURN;\nEND IF;\n\nv_perfil_alvo := CASE');
    IF position('perfil_valido()' in d) = 0 THEN
      RAISE EXCEPTION 'obter_prazo_aplicavel: trecho esperado não encontrado';
    END IF;
    EXECUTE d;
  END IF;

  d := pg_get_functiondef('public.verificar_sobreposicao_periodo(text,text,date,date,uuid,uuid[])'::regprocedure);
  IF position('perfil_valido()' in d) = 0 THEN
    d := replace(d,
      E'BEGIN\nRETURN QUERY',
      E'BEGIN\nIF NOT public.perfil_valido() THEN\nRAISE EXCEPTION ''Acesso negado: usuário sem perfil válido.'';\nEND IF;\n\nRETURN QUERY');
    IF position('perfil_valido()' in d) = 0 THEN
      RAISE EXCEPTION 'verificar_sobreposicao_periodo: trecho esperado não encontrado';
    END IF;
    EXECUTE d;
  END IF;
END $$;

DROP POLICY IF EXISTS "select_pastas" ON public.pastas;
CREATE POLICY "select_pastas" ON public.pastas FOR SELECT
TO authenticated USING (public.perfil_valido());

DROP POLICY IF EXISTS "select_calendario_prazos" ON public.calendario_prazos;
CREATE POLICY "select_calendario_prazos" ON public.calendario_prazos FOR SELECT
TO authenticated USING (public.perfil_valido());

DROP POLICY IF EXISTS "select_calendario_prazos_hist" ON public.calendario_prazos_historico;
CREATE POLICY "select_calendario_prazos_hist" ON public.calendario_prazos_historico FOR SELECT
TO authenticated USING (public.perfil_valido());

DROP POLICY IF EXISTS "select_config_prazos" ON public.dashboard_config_prazos;
CREATE POLICY "select_config_prazos" ON public.dashboard_config_prazos FOR SELECT
TO authenticated USING (public.perfil_valido());

DROP POLICY IF EXISTS "select_links_uteis" ON public.links_uteis;
CREATE POLICY "select_links_uteis" ON public.links_uteis FOR SELECT
TO authenticated USING (ativo = true AND public.perfil_valido());

DROP POLICY IF EXISTS "read_links_uteis_bucket" ON storage.objects;
CREATE POLICY "read_links_uteis_bucket" ON storage.objects FOR SELECT
TO authenticated USING (bucket_id = 'links-uteis' AND public.perfil_valido());

DROP POLICY IF EXISTS "select_profiles" ON public.profiles;
CREATE POLICY "select_profiles" ON public.profiles FOR SELECT
TO authenticated
USING (
  id = auth.uid()
  OR (
    public.perfil_valido()
    AND (
      public.current_profile_role() = ANY (ARRAY['admin', 'pedagogia', 'coordenacao'])
      OR perfil <> 'docente'
      OR EXISTS (
        SELECT 1 FROM public.planos_aula p
        WHERE p.docente_id = profiles.id
        AND p.excluido_at IS NULL
        AND p.status = 'publicado'
        AND public.pasta_no_escopo_do_usuario(p.pasta_id)
      )
    )
  )
);
