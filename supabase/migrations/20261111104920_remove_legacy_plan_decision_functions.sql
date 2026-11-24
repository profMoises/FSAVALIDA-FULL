/*
# Remover versões antigas das decisões de planos

1. Objetivo
- Retirar as assinaturas antigas das funções de decisão que não recebiam orientação.
- Garantir que toda devolução use as novas funções com mensagem e gere histórico.

2. Segurança
- As funções antigas deixam de ser chamadas pelo Data API.
- As funções atuais continuam disponíveis apenas para usuários autenticados.
- Nenhuma tabela, coluna ou registro é removido.
*/

REVOKE EXECUTE ON FUNCTION public.pedagogia_decidir(uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.coordenacao_decidir(uuid, boolean) FROM PUBLIC, anon, authenticated;
DROP FUNCTION IF EXISTS public.pedagogia_decidir(uuid, boolean);
DROP FUNCTION IF EXISTS public.coordenacao_decidir(uuid, boolean);

REVOKE EXECUTE ON FUNCTION public.registrar_interacao(uuid, text, text) FROM PUBLIC, anon, authenticated;
