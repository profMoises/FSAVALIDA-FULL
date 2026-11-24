/*
# Histórico de interações dos planos de aula

1. Novas tabelas
- `plano_interacoes`: registra a linha do tempo de cada plano.
- `id`: identificador do evento.
- `plano_id`: plano relacionado.
- `autor_id`: usuário que realizou a ação.
- `autor_perfil`: perfil no momento do evento.
- `tipo`: envio, recebimento, devolução, reenvio ou publicação.
- `mensagem`: orientação escrita pela pedagogia ou coordenação quando o plano é devolvido.
- `criado_at`: data e hora do evento.

2. Fluxo alterado
- O envio do docente registra envio e recebimento pela pedagogia.
- A validação pedagógica registra o recebimento pela coordenação.
- O reenvio registra a ação do docente e o recebimento pela etapa correspondente.
- A devolução registra obrigatoriamente a orientação escrita.
- A publicação também fica registrada.

3. Segurança
- A leitura do histórico segue a mesma permissão de leitura do plano relacionado.
- Usuários autenticados podem ler o histórico, mas não podem inserir eventos diretamente.
- Os eventos são criados somente pelas funções protegidas do fluxo.
- Nenhuma tabela ou coluna existente é removida.
*/

CREATE TABLE IF NOT EXISTS public.plano_interacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plano_id uuid NOT NULL REFERENCES public.planos_aula(id) ON DELETE CASCADE,
  autor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  autor_perfil text NOT NULL CHECK (autor_perfil IN ('admin', 'docente', 'pedagogia', 'coordenacao')),
  tipo text NOT NULL CHECK (tipo IN (
    'envio_docente',
    'recebimento_pedagogia',
    'recebimento_coordenacao',
    'devolucao_pedagogia',
    'devolucao_coordenacao',
    'reenvio_docente',
    'publicacao'
  )),
  mensagem text,
  criado_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT plano_interacoes_mensagem_devolucao CHECK (
    tipo NOT IN ('devolucao_pedagogia', 'devolucao_coordenacao')
    OR length(btrim(coalesce(mensagem, ''))) >= 3
  )
);

CREATE INDEX IF NOT EXISTS plano_interacoes_plano_id_idx ON public.plano_interacoes (plano_id, criado_at);

ALTER TABLE public.plano_interacoes ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.plano_interacoes TO authenticated;
GRANT SELECT, INSERT ON public.plano_interacoes TO service_role;

DROP POLICY IF EXISTS "select_interacoes_plano" ON public.plano_interacoes;
CREATE POLICY "select_interacoes_plano" ON public.plano_interacoes FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1
      FROM public.planos_aula p
      WHERE p.id = plano_interacoes.plano_id
    )
  );

CREATE OR REPLACE FUNCTION public.registrar_interacao(
  p_plano_id uuid,
  p_tipo text,
  p_mensagem text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_perfil text;
BEGIN
  v_perfil := public.current_profile_role();
  IF v_perfil IS NULL THEN
    RAISE EXCEPTION 'Usuário não encontrado.';
  END IF;
  IF p_tipo IN ('devolucao_pedagogia', 'devolucao_coordenacao')
    AND length(btrim(coalesce(p_mensagem, ''))) < 3 THEN
    RAISE EXCEPTION 'Escreva a orientação para o docente antes de devolver o plano.';
  END IF;

  INSERT INTO public.plano_interacoes (plano_id, autor_id, autor_perfil, tipo, mensagem)
  VALUES (p_plano_id, auth.uid(), v_perfil, p_tipo, nullif(btrim(p_mensagem), ''));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.registrar_interacao(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_interacao(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.enviar_plano(
  p_titulo text,
  p_pasta_id uuid,
  p_arquivo_path text,
  p_arquivo_nome text,
  p_arquivo_tamanho bigint
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF public.current_profile_role() IS DISTINCT FROM 'docente' THEN
    RAISE EXCEPTION 'Apenas docentes podem enviar planos de aula.';
  END IF;
  IF NOT public.pasta_no_escopo_do_usuario(p_pasta_id) THEN
    RAISE EXCEPTION 'A pasta escolhida não está disponível para o seu usuário.';
  END IF;
  IF p_arquivo_path IS NULL OR left(p_arquivo_path, 37) <> auth.uid()::text || '/' THEN
    RAISE EXCEPTION 'Arquivo inválido para este usuário.';
  END IF;

  INSERT INTO public.planos_aula (titulo, docente_id, pasta_id, arquivo_path, arquivo_nome, arquivo_tamanho, status)
  VALUES (btrim(p_titulo), auth.uid(), p_pasta_id, p_arquivo_path, p_arquivo_nome, p_arquivo_tamanho, 'validacao_pedagogica')
  RETURNING id INTO v_id;

  PERFORM public.registrar_interacao(v_id, 'envio_docente');
  PERFORM public.registrar_interacao(v_id, 'recebimento_pedagogia');
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reenviar_plano(
  p_plano_id uuid,
  p_arquivo_path text,
  p_arquivo_nome text,
  p_arquivo_tamanho bigint
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plano public.planos_aula%ROWTYPE;
  v_novo_status text;
  v_recebimento text;
BEGIN
  SELECT * INTO v_plano FROM public.planos_aula WHERE id = p_plano_id FOR UPDATE;
  IF NOT FOUND OR v_plano.docente_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Plano de aula não encontrado.';
  END IF;
  IF v_plano.status <> 'devolvido_docente' THEN
    RAISE EXCEPTION 'Este plano não está aguardando ajustes.';
  END IF;
  IF p_arquivo_path IS NULL OR left(p_arquivo_path, 37) <> auth.uid()::text || '/' THEN
    RAISE EXCEPTION 'Arquivo inválido para este usuário.';
  END IF;

  v_novo_status := CASE
    WHEN v_plano.devolvido_por = 'coordenacao' THEN 'validacao_coordenacao'
    ELSE 'validacao_pedagogica'
  END;
  v_recebimento := CASE
    WHEN v_plano.devolvido_por = 'coordenacao' THEN 'recebimento_coordenacao'
    ELSE 'recebimento_pedagogia'
  END;

  UPDATE public.planos_aula
  SET status = v_novo_status,
      devolvido_por = NULL,
      arquivo_path = p_arquivo_path,
      arquivo_nome = p_arquivo_nome,
      arquivo_tamanho = p_arquivo_tamanho,
      updated_at = now()
  WHERE id = p_plano_id;

  PERFORM public.registrar_interacao(p_plano_id, 'reenvio_docente');
  PERFORM public.registrar_interacao(p_plano_id, v_recebimento);
  RETURN v_novo_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.pedagogia_decidir(
  p_plano_id uuid,
  p_aprovar boolean,
  p_mensagem text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_novo_status text;
BEGIN
  IF public.current_profile_role() IS DISTINCT FROM 'pedagogia' THEN
    RAISE EXCEPTION 'Apenas a pedagogia pode validar esta etapa.';
  END IF;
  SELECT status INTO v_status FROM public.planos_aula WHERE id = p_plano_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Plano de aula não encontrado.'; END IF;
  IF v_status <> 'validacao_pedagogica' THEN
    RAISE EXCEPTION 'Este plano não está aguardando validação pedagógica.';
  END IF;
  IF NOT p_aprovar AND length(btrim(coalesce(p_mensagem, ''))) < 3 THEN
    RAISE EXCEPTION 'Escreva a orientação para o docente antes de devolver o plano.';
  END IF;

  v_novo_status := CASE WHEN p_aprovar THEN 'validacao_coordenacao' ELSE 'devolvido_docente' END;
  UPDATE public.planos_aula
  SET status = v_novo_status,
      devolvido_por = CASE WHEN p_aprovar THEN NULL ELSE 'pedagogia' END,
      updated_at = now()
  WHERE id = p_plano_id;

  IF p_aprovar THEN
    PERFORM public.registrar_interacao(p_plano_id, 'recebimento_coordenacao');
  ELSE
    PERFORM public.registrar_interacao(p_plano_id, 'devolucao_pedagogia', p_mensagem);
  END IF;
  RETURN v_novo_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.coordenacao_decidir(
  p_plano_id uuid,
  p_publicar boolean,
  p_mensagem text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_novo_status text;
BEGIN
  IF public.current_profile_role() IS DISTINCT FROM 'coordenacao' THEN
    RAISE EXCEPTION 'Apenas a coordenação técnica pode validar esta etapa.';
  END IF;
  SELECT status INTO v_status FROM public.planos_aula WHERE id = p_plano_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Plano de aula não encontrado.'; END IF;
  IF v_status <> 'validacao_coordenacao' THEN
    RAISE EXCEPTION 'Este plano não está aguardando validação da coordenação.';
  END IF;
  IF NOT p_publicar AND length(btrim(coalesce(p_mensagem, ''))) < 3 THEN
    RAISE EXCEPTION 'Escreva a orientação para o docente antes de devolver o plano.';
  END IF;

  v_novo_status := CASE WHEN p_publicar THEN 'publicado' ELSE 'devolvido_docente' END;
  UPDATE public.planos_aula
  SET status = v_novo_status,
      devolvido_por = CASE WHEN p_publicar THEN NULL ELSE 'coordenacao' END,
      updated_at = now()
  WHERE id = p_plano_id;

  IF p_publicar THEN
    PERFORM public.registrar_interacao(p_plano_id, 'publicacao');
  ELSE
    PERFORM public.registrar_interacao(p_plano_id, 'devolucao_coordenacao', p_mensagem);
  END IF;
  RETURN v_novo_status;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pedagogia_decidir(uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.coordenacao_decidir(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pedagogia_decidir(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.coordenacao_decidir(uuid, boolean, text) TO authenticated;
