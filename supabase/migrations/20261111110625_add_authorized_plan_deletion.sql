/*
# Exclusão autorizada de planos de aula

1. Alterações na tabela `planos_aula`
- `excluido_at`: data e hora da exclusão lógica.
- `excluido_por`: usuário que realizou a exclusão.
- O plano deixa de aparecer nas listas, mas seus eventos históricos permanecem.

2. Novo fluxo
- O docente pode excluir somente os próprios planos.
- Coordenação e administração podem excluir qualquer plano visível a elas.
- Pedagogia não pode excluir planos.
- O arquivo privado é removido junto com a exclusão.
- A exclusão é registrada no histórico do plano.

3. Segurança
- A autorização é conferida dentro de uma função SECURITY DEFINER usando `auth.uid()` e o perfil real do usuário.
- A função pode ser executada somente por usuários autenticados.
- As políticas de leitura escondem planos excluídos, mas mantêm o histórico acessível para auditoria.
- Nenhum registro é fisicamente removido.
*/

ALTER TABLE public.planos_aula
  ADD COLUMN IF NOT EXISTS excluido_at timestamptz,
  ADD COLUMN IF NOT EXISTS excluido_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.plano_interacoes
  DROP CONSTRAINT IF EXISTS plano_interacoes_tipo_check;
ALTER TABLE public.plano_interacoes
  ADD CONSTRAINT plano_interacoes_tipo_check CHECK (tipo IN (
    'envio_docente',
    'recebimento_pedagogia',
    'recebimento_coordenacao',
    'devolucao_pedagogia',
    'devolucao_coordenacao',
    'reenvio_docente',
    'publicacao',
    'exclusao_plano'
  ));

DROP POLICY IF EXISTS "select_planos_docente" ON public.planos_aula;
CREATE POLICY "select_planos_docente" ON public.planos_aula FOR SELECT
  TO authenticated USING (
    excluido_at IS NULL
    AND (docente_id = auth.uid() OR status = 'publicado')
  );

DROP POLICY IF EXISTS "select_planos_equipe" ON public.planos_aula;
CREATE POLICY "select_planos_equipe" ON public.planos_aula FOR SELECT
  TO authenticated USING (
    excluido_at IS NULL
    AND current_profile_role() IN ('admin', 'pedagogia', 'coordenacao')
  );

CREATE OR REPLACE FUNCTION public.excluir_plano(p_plano_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plano public.planos_aula%ROWTYPE;
  v_perfil text;
BEGIN
  v_perfil := public.current_profile_role();

  SELECT *
  INTO v_plano
  FROM public.planos_aula
  WHERE id = p_plano_id
  FOR UPDATE;

  IF NOT FOUND OR v_plano.excluido_at IS NOT NULL THEN
    RAISE EXCEPTION 'Plano de aula não encontrado.';
  END IF;

  IF v_perfil NOT IN ('admin', 'coordenacao')
     AND v_plano.docente_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Você não tem permissão para excluir este plano.';
  END IF;

  UPDATE public.planos_aula
  SET
    excluido_at = now(),
    excluido_por = auth.uid(),
    updated_at = now()
  WHERE id = p_plano_id;

  INSERT INTO public.plano_interacoes (
    plano_id,
    autor_id,
    autor_perfil,
    tipo
  )
  VALUES (
    p_plano_id,
    auth.uid(),
    v_perfil,
    'exclusao_plano'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.excluir_plano(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.excluir_plano(uuid) TO authenticated;