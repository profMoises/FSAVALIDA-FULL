/*
# Bloqueia a função legada dashboard_dados

1. Segurança
   - `dashboard_dados` substituía o conjunto de pastas autorizadas pelo id enviado
     pelo cliente (`v_pastas_autorizadas := ARRAY[p_pasta_id]`), permitindo que um
     usuário de pedagogia ou coordenação consultasse indicadores de cursos fora do
     seu escopo via `/rest/v1/rpc/dashboard_dados`.
   - A função foi substituída por `dashboard_gerencial` e não é mais chamada pela
     aplicação. O EXECUTE é revogado de PUBLIC, anon e authenticated.

2. Observações
   - A função é mantida (nada é removido); apenas deixa de ser acessível pelos
     clientes da API.
*/

REVOKE EXECUTE ON FUNCTION public.dashboard_dados(uuid, uuid, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
