/*
# Bloqueia o helper interno de fila de notificações

1. Segurança
   - `_fila_notificacao(plano_id, evento, assunto)` podia ser chamada por qualquer
     usuário autenticado via `/rest/v1/rpc/_fila_notificacao`, enfileirando e-mails
     institucionais com assunto escolhido pelo chamador.
   - O EXECUTE passa a ser revogado de PUBLIC, anon e authenticated. As funções
     `enviar_plano`, `reenviar_plano` e `pedagogia_decidir` continuam chamando o
     helper normalmente, pois são SECURITY DEFINER e executam como o proprietário.
*/

REVOKE EXECUTE ON FUNCTION public._fila_notificacao(uuid, text, text) FROM PUBLIC, anon, authenticated;
