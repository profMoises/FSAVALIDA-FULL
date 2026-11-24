/*
# Restaura compatibilidade segura com a tela antiga do dashboard

1. Função alterada
   - `dashboard_dados(p_pasta_id, p_docente_id, p_data_inicio, p_data_fim)` passa a
     delegar integralmente para `dashboard_gerencial`.

2. Segurança
   - A tela antiga ainda pode existir em uma versão publicada ou em cache do
     navegador e chama `dashboard_dados`. A ausência de EXECUTE causava a mensagem
     "permission denied for function dashboard_dados".
   - A função não consulta mais diretamente as tabelas nem substitui o escopo do
     usuário pelo curso informado. Toda autorização e filtragem são feitas pela
     função gerencial atual, que impede docentes e respeita as pastas autorizadas.
   - O acesso é liberado somente para `authenticated`; `anon` e `PUBLIC` continuam
     bloqueados.

3. Observações
   - Nenhum dado é alterado ou removido.
   - A correção mantém compatibilidade enquanto a versão atual da interface usa
     `dashboard_gerencial` diretamente.
*/

CREATE OR REPLACE FUNCTION public.dashboard_dados(
  p_pasta_id uuid DEFAULT NULL,
  p_docente_id uuid DEFAULT NULL,
  p_data_inicio timestamptz DEFAULT NULL,
  p_data_fim timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.dashboard_gerencial(
    p_pasta_id,
    p_docente_id,
    NULL,
    NULL,
    p_data_inicio,
    p_data_fim
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dashboard_dados(uuid, uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_dados(uuid, uuid, timestamptz, timestamptz) TO authenticated;
