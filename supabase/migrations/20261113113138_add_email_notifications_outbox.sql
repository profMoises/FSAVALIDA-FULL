/*
# Notificações automáticas por e-mail — tabela outbox e integração com o fluxo

## Objetivo
Criar uma fila de notificações (outbox) que registra e-mails a enviar quando:
1. Um docente envia/reenvia um plano → pedagogia responsável pela pasta é notificada.
2. A pedagogia aprova e encaminha → coordenador técnico responsável pela pasta é notificada.

## Nova tabela: notificacoes_email
- id (uuid, pk)
- plano_id (uuid, fk → planos_aula, ON DELETE CASCADE)
- evento (text): 'envio_docente' | 'encaminhamento_coordenacao'
- destinatario_email (text): e-mail do destinatário
- destinatario_nome (text): nome do destinatário
- assunto (text): assunto do e-mail
- status (text): 'pendente' | 'enviado' | 'erro'
- tentativas (int, default 0)
- provider_id (text): ID retornado pelo Resend
- erro_mensagem (text): mensagem de erro da última tentativa
- criado_at (timestamptz, default now())
- enviado_at (timestamptz): quando foi confirmado pelo provedor
- idempotencia_key (text, unique): evita notificações duplicadas por evento+plano+destinatário

## Segurança
- RLS habilitado.
- SELECT para authenticated (admin pode auditar).
- INSERT/UPDATE/DELETE somente para service_role (edge function processa a fila).
- Grants explícitos para service_role.

## Modificações nas funções do fluxo
- enviar_plano: após inserir o plano, insere notificações para pedagogia vinculada à pasta.
- reenviar_plano: após atualizar status, insere notificações para pedagogia (quando volta para pedagogia).
- pedagogia_decidir: quando aprova (encaminha para coordenação), insere notificação para coordenador da pasta.

## Regra de destinatários
- Pedagogia: usuários com perfil='pedagogia' que têm a pasta em profile_pastas.
  Se nenhum pedagogo vinculado à pasta, notifica todos os pedagogos (regra global atual).
- Coordenação: usuários com perfil='coordenacao' que têm a pasta em profile_pastas.
  Se nenhum coordenador vinculado à pasta, notifica todos os coordenadores (regra global atual).

## Idempotência
- idempotencia_key = evento || ':' || plano_id || ':' || destinatario_email
- UNIQUE constraint evita duplicatas.
- ON CONFLICT DO NOTHING garante que re-execução não cria duplicatas.
*/

CREATE TABLE IF NOT EXISTS public.notificacoes_email (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plano_id uuid NOT NULL REFERENCES public.planos_aula(id) ON DELETE CASCADE,
  evento text NOT NULL CHECK (evento IN ('envio_docente', 'encaminhamento_coordenacao')),
  destinatario_email text NOT NULL,
  destinatario_nome text NOT NULL,
  assunto text NOT NULL,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'enviado', 'erro')),
  tentativas integer NOT NULL DEFAULT 0,
  provider_id text,
  erro_mensagem text,
  criado_at timestamptz NOT NULL DEFAULT now(),
  enviado_at timestamptz,
  idempotencia_key text NOT NULL,
  CONSTRAINT notificacoes_email_idempotencia_unique UNIQUE (idempotencia_key)
);

CREATE INDEX IF NOT EXISTS notificacoes_email_status_idx ON public.notificacoes_email (status);
CREATE INDEX IF NOT EXISTS notificacoes_email_plano_id_idx ON public.notificacoes_email (plano_id);

ALTER TABLE public.notificacoes_email ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.notificacoes_email TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notificacoes_email TO service_role;

DROP POLICY IF EXISTS "select_notificacoes_email" ON public.notificacoes_email;
CREATE POLICY "select_notificacoes_email" ON public.notificacoes_email FOR SELECT
  TO authenticated USING (public.current_profile_role() = 'admin');

CREATE OR REPLACE FUNCTION public._fila_notificacao(
  p_plano_id uuid,
  p_evento text,
  p_assunto text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plano record;
  v_dest record;
  v_key text;
  v_perfil_alvo text;
  v_tem_vinculado boolean;
BEGIN
  SELECT pa.titulo, pa.arquivo_nome, pa.pasta_id, pa.docente_id,
         d.nome AS docente_nome, pt.nome AS pasta_nome
  INTO v_plano
  FROM public.planos_aula pa
  LEFT JOIN public.profiles d ON d.id = pa.docente_id
  LEFT JOIN public.pastas pt ON pt.id = pa.pasta_id
  WHERE pa.id = p_plano_id;

  IF NOT FOUND THEN RETURN; END IF;

  IF p_evento = 'envio_docente' THEN
    v_perfil_alvo := 'pedagogia';
  ELSIF p_evento = 'encaminhamento_coordenacao' THEN
    v_perfil_alvo := 'coordenacao';
  ELSE
    RETURN;
  END IF;

  v_tem_vinculado := false;

  FOR v_dest IN
    SELECT pr.email, pr.nome
    FROM public.profiles pr
    JOIN public.profile_pastas pp ON pp.profile_id = pr.id
    WHERE pr.perfil = v_perfil_alvo AND pp.pasta_id = v_plano.pasta_id
  LOOP
    v_tem_vinculado := true;
    v_key := p_evento || ':' || p_plano_id::text || ':' || v_dest.email;
    INSERT INTO public.notificacoes_email (plano_id, evento, destinatario_email, destinatario_nome, assunto, idempotencia_key)
    VALUES (p_plano_id, p_evento, v_dest.email, v_dest.nome, p_assunto, v_key)
    ON CONFLICT DO NOTHING;
  END LOOP;

  IF NOT v_tem_vinculado THEN
    FOR v_dest IN
      SELECT pr.email, pr.nome
      FROM public.profiles pr
      WHERE pr.perfil = v_perfil_alvo
    LOOP
      v_key := p_evento || ':' || p_plano_id::text || ':' || v_dest.email;
      INSERT INTO public.notificacoes_email (plano_id, evento, destinatario_email, destinatario_nome, assunto, idempotencia_key)
      VALUES (p_plano_id, p_evento, v_dest.email, v_dest.nome, p_assunto, v_key)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public._fila_notificacao(uuid, text, text) FROM PUBLIC, anon;

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

  PERFORM public._fila_notificacao(v_id, 'envio_docente', 'NOVO PLANO DE AULA AGUARDANDO ANÁLISE');

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enviar_plano(text, uuid, text, text, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enviar_plano(text, uuid, text, text, bigint) TO authenticated;

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

  IF v_novo_status = 'validacao_pedagogica' THEN
    PERFORM public._fila_notificacao(p_plano_id, 'envio_docente', 'NOVO PLANO DE AULA AGUARDANDO ANÁLISE');
  END IF;

  RETURN v_novo_status;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reenviar_plano(uuid, text, text, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reenviar_plano(uuid, text, text, bigint) TO authenticated;

CREATE OR REPLACE FUNCTION public.pedagogia_decidir(p_plano_id uuid, p_aprovar boolean, p_mensagem text DEFAULT NULL)
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

  IF p_aprovar THEN
    PERFORM public._fila_notificacao(p_plano_id, 'encaminhamento_coordenacao', 'PLANO DE AULA ENCAMINHADO PARA ANÁLISE DA COORDENAÇÃO');
  END IF;

  RETURN v_novo_status;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pedagogia_decidir(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pedagogia_decidir(uuid, boolean, text) TO authenticated;
