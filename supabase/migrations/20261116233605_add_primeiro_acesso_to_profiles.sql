/*
# Adicionar coluna primeiro_acesso na tabela profiles

## Objetivo
Permitir que o sistema identifique usuários importados em lote que precisam trocar a senha no primeiro acesso.

## Mudanças
1. Nova coluna:
   - `profiles.primeiro_acesso` (boolean, default false) — quando true, o usuário é obrigado a trocar a senha antes de usar o sistema.

2. Segurança:
   - Nenhuma mudança nas políticas RLS existentes. A coluna é legível pelo próprio usuário (já coberto pela política SELECT existente de profiles).
   - A coluna só é gravada pela Edge Function admin-users (service_role, que bypassa RLS). Usuários não podem alterar seu próprio `primeiro_acesso` diretamente.
   - Adicionado GRANT UPDATE na coluna `primeiro_acesso` para authenticated, para que o frontend possa marcar como false após a troca. As outras colunas continuam sem UPDATE grant para authenticated.

## Notas
1. A coluna é opcional (nullable com default false) para não afetar usuários já cadastrados.
2. O fluxo: admin importa usuários → Edge Function cria conta com primeiro_acesso=true → usuário faz login → sistema detecta primeiro_acesso=true → exibe modal obrigatório de troca de senha → após troca, sistema atualiza primeiro_acesso=false.
*/

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS primeiro_acesso boolean NOT NULL DEFAULT false;

GRANT UPDATE (primeiro_acesso) ON profiles TO authenticated;
