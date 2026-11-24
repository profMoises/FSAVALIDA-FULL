import { supabase } from '@/lib/supabase';
import type { Pasta } from '@/lib/domain';

export async function listarPastas(): Promise<Pasta[]> {
  const { data, error } = await supabase.from('pastas').select('id, nome, pai_id').order('nome');
  if (error) throw new Error('Não foi possível carregar as pastas.');
  return (data ?? []) as Pasta[];
}

export async function salvarPasta(input: { id?: string; nome: string; pai_id: string | null }): Promise<void> {
  const { error } = input.id
    ? await supabase.from('pastas').update({ nome: input.nome, pai_id: input.pai_id }).eq('id', input.id)
    : await supabase.from('pastas').insert({ nome: input.nome, pai_id: input.pai_id });
  if (error) throw new Error('Não foi possível salvar a pasta. Verifique se o nome já não está em uso.');
}

export async function excluirPasta(id: string): Promise<void> {
  const { error } = await supabase.from('pastas').delete().eq('id', id);
  if (error) throw new Error('Não foi possível excluir a pasta. Pastas com planos de aula não podem ser excluídas.');
}
