import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Usuario } from '@/lib/domain';


type LinhaUsuario = Omit<Usuario, 'pasta_ids'> & { vinculos: { pasta_id: string }[] };

export async function listarUsuarios(): Promise<Usuario[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, nome, email, perfil, pasta_id, vinculos:profile_pastas(pasta_id)')
    .order('nome');
  if (error) throw new Error('Não foi possível carregar os usuários.');
  return ((data ?? []) as LinhaUsuario[]).map(({ vinculos, ...usuario }) => ({
    ...usuario,
    pasta_ids: vinculos.map((vinculo) => vinculo.pasta_id),
  }));
}

export async function listarDocentes(): Promise<Usuario[]> {
  const todos = await listarUsuarios();
  return todos.filter((u) => u.perfil === 'docente');
}

export async function chamarAdminUsuarios(body: Record<string, unknown>): Promise<void> {
  const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string }>('admin-users', { body });

  if (error) {
    let mensagem = 'Não foi possível concluir a ação. Tente novamente.';
    if (error instanceof FunctionsHttpError) {
      try {
        const corpo = (await error.context.json()) as { error?: string };
        if (corpo.error) mensagem = corpo.error;
      } catch {
        // resposta sem conteúdo JSON: mantém a mensagem padrão
      }
    }
    throw new Error(mensagem);
  }

  if (!data?.ok) throw new Error(data?.error ?? 'Não foi possível concluir a ação. Tente novamente.');
}
