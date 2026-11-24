/*
# Restringir execução das decisões de planos

1. Objetivo
- Remover o acesso público padrão às funções que validam, publicam ou devolvem planos.

2. Segurança
- Somente usuários autenticados podem executar as decisões.
- A função interna que grava o histórico não é executável diretamente por nenhum papel da API.
- Nenhum dado existente é alterado ou removido.
*/

REVOKE EXECUTE ON FUNCTION public.pedagogia_decidir(uuid, boolean, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.coordenacao_decidir(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pedagogia_decidir(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.coordenacao_decidir(uuid, boolean, text) TO authenticated;
