/*
# Fluxo de validação dos planos de aula

1. Funções do fluxo (executadas no servidor, com verificação de perfil e de etapa)
- `enviar_plano`: docente envia um novo plano para a validação pedagógica dentro da pasta dele (ou de uma subpasta).
- `reenviar_plano`: docente envia a versão ajustada de um plano devolvido. Se a devolução veio da pedagogia, volta para a pedagogia. Se veio da coordenação, volta direto para a coordenação, sem passar pela pedagogia.
- `pedagogia_decidir`: pedagogia valida (envia para a coordenação) ou devolve ao docente.
- `coordenacao_decidir`: coordenação técnica valida e publica, ou devolve ao docente.

2. Segurança
- Todas as funções exigem o perfil correto e conferem a etapa atual do plano antes de mudar o status.
- Somente o docente dono do plano pode reenviá-lo.
- Permissões de execução removidas de usuários anônimos e liberadas apenas para usuários logados.

3. Arquivos
- Leitura de planilhas publicadas passa a valer também para docentes da mesma pasta.
*/

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

  UPDATE public.planos_aula
  SET status = v_novo_status,
      devolvido_por = NULL,
      arquivo_path = p_arquivo_path,
      arquivo_nome = p_arquivo_nome,
      arquivo_tamanho = p_arquivo_tamanho,
      updated_at = now()
  WHERE id = p_plano_id;

  RETURN v_novo_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.pedagogia_decidir(p_plano_id uuid, p_aprovar boolean)
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
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plano de aula não encontrado.';
  END IF;
  IF v_status <> 'validacao_pedagogica' THEN
    RAISE EXCEPTION 'Este plano não está aguardando validação pedagógica.';
  END IF;

  v_novo_status := CASE WHEN p_aprovar THEN 'validacao_coordenacao' ELSE 'devolvido_docente' END;

  UPDATE public.planos_aula
  SET status = v_novo_status,
      devolvido_por = CASE WHEN p_aprovar THEN NULL ELSE 'pedagogia' END,
      updated_at = now()
  WHERE id = p_plano_id;

  RETURN v_novo_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.coordenacao_decidir(p_plano_id uuid, p_publicar boolean)
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
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plano de aula não encontrado.';
  END IF;
  IF v_status <> 'validacao_coordenacao' THEN
    RAISE EXCEPTION 'Este plano não está aguardando validação da coordenação.';
  END IF;

  v_novo_status := CASE WHEN p_publicar THEN 'publicado' ELSE 'devolvido_docente' END;

  UPDATE public.planos_aula
  SET status = v_novo_status,
      devolvido_por = CASE WHEN p_publicar THEN NULL ELSE 'coordenacao' END,
      updated_at = now()
  WHERE id = p_plano_id;

  RETURN v_novo_status;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enviar_plano(text, uuid, text, text, bigint) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reenviar_plano(uuid, text, text, bigint) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.pedagogia_decidir(uuid, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.coordenacao_decidir(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enviar_plano(text, uuid, text, text, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reenviar_plano(uuid, text, text, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pedagogia_decidir(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.coordenacao_decidir(uuid, boolean) TO authenticated;

DROP POLICY IF EXISTS "planos_arquivos_leitura" ON storage.objects;
CREATE POLICY "planos_arquivos_leitura" ON storage.objects FOR SELECT
  TO authenticated USING (
    bucket_id = 'planos'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.current_profile_role() IN ('admin', 'pedagogia', 'coordenacao')
      OR EXISTS (
        SELECT 1 FROM public.planos_aula p
        WHERE p.arquivo_path = storage.objects.name
          AND p.status = 'publicado'
          AND public.pasta_no_escopo_do_usuario(p.pasta_id)
      )
    )
  );
