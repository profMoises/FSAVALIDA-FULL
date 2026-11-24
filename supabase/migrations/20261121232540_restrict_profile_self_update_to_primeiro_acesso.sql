/*
# Impedir alteração indevida de perfil e dados administrativos (Item 1 da auditoria)

## Problema
O papel `authenticated` tinha permissão de escrita em TODAS as colunas de
`public.profiles` e `public.profile_pastas`. Como a política `update_own_profile`
só verifica `id = auth.uid()`, qualquer usuário podia trocar o próprio `perfil`
(ex.: para 'admin'), `pasta_id`, `email` e `nome` por chamada direta à API.

## Mudanças
1. `public.profiles`
   - REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER de `authenticated` e `anon`.
   - GRANT UPDATE apenas na coluna `primeiro_acesso` para `authenticated`
     (necessário para concluir a troca obrigatória de senha no primeiro acesso).
   - SELECT permanece inalterado.
2. `public.profile_pastas`
   - REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER de `authenticated` e `anon`.
   - SELECT permanece inalterado.

## O que NÃO muda
- Políticas RLS existentes permanecem (a `update_own_profile` continua limitando à própria linha).
- `service_role` mantém todas as permissões: a gestão administrativa (criar, editar,
  excluir, importar usuários e vínculos) é feita pela Edge Function `admin-users`,
  que valida que o chamador é administrador antes de usar `service_role`.
- Troca de senha usa o Supabase Auth e não depende desta tabela.
- Nenhum dado é alterado ou removido.
*/

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.profiles FROM authenticated, anon;
GRANT UPDATE (primeiro_acesso) ON public.profiles TO authenticated;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.profile_pastas FROM authenticated, anon;
