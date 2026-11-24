import { supabase } from '@/lib/supabase';

export type PerfilAlvo = 'docente' | 'pedagogia' | 'coordenacao';
export type FinalidadePrazo = 'envio_docente' | 'analise_pedagogica' | 'analise_coordenacao';

export type CalendarioPrazo = {
  id: string;
  perfil_alvo: PerfilAlvo;
  finalidade: FinalidadePrazo;
  data_inicio: string;
  data_fim: string;
  usuarios_ids: string[];
  criado_por: string | null;
  criado_at: string;
  atualizado_em: string;
  ativo: boolean;
};

export type CalendarioPrazoHistorico = {
  id: string;
  calendario_id: string;
  acao: string;
  alterado_por: string | null;
  alterado_em: string;
  snapshot: Record<string, unknown>;
};

export type SobreposicaoPeriodo = {
  id: string;
  data_inicio: string;
  data_fim: string;
  usuarios_ids: string[];
};

function erroAmigavel(error: { code?: string; message?: string } | null, padrao: string): Error {
  if (error?.code === 'P0001' && error.message) return new Error(error.message);
  return new Error(padrao);
}

export async function listarCalendarioPrazos(): Promise<CalendarioPrazo[]> {
  const { data, error } = await supabase
    .from('calendario_prazos')
    .select('id, perfil_alvo, finalidade, data_inicio, data_fim, usuarios_ids, criado_por, criado_at, atualizado_em, ativo')
    .order('data_inicio', { ascending: false });
  if (error) throw new Error('Não foi possível carregar os períodos configurados.');
  return (data ?? []) as CalendarioPrazo[];
}

export async function listarHistoricoCalendario(calendarioId: string): Promise<CalendarioPrazoHistorico[]> {
  const { data, error } = await supabase
    .from('calendario_prazos_historico')
    .select('id, calendario_id, acao, alterado_por, alterado_em, snapshot')
    .eq('calendario_id', calendarioId)
    .order('alterado_em', { ascending: false });
  if (error) throw new Error('Não foi possível carregar o histórico de alterações.');
  return (data ?? []) as CalendarioPrazoHistorico[];
}

export async function verificarSobreposicao(
  perfilAlvo: PerfilAlvo,
  finalidade: FinalidadePrazo,
  dataInicio: string,
  dataFim: string,
  excluirId?: string,
  usuariosIds?: string[],
): Promise<SobreposicaoPeriodo[]> {
  const { data, error } = await supabase.rpc('verificar_sobreposicao_periodo', {
    p_perfil_alvo: perfilAlvo,
    p_finalidade: finalidade,
    p_data_inicio: dataInicio,
    p_data_fim: dataFim,
    p_excluir_id: excluirId ?? null,
    p_usuarios_ids: usuariosIds ?? [],
  });
  if (error) throw erroAmigavel(error as { code?: string; message?: string }, 'Não foi possível verificar sobreposições.');
  return (data ?? []) as SobreposicaoPeriodo[];
}

export async function salvarCalendarioPrazo(input: {
  id?: string;
  perfil_alvo: PerfilAlvo;
  finalidade: FinalidadePrazo;
  data_inicio: string;
  data_fim: string;
  usuarios_ids: string[];
}): Promise<void> {
  if (input.id) {
    const { error } = await supabase
      .from('calendario_prazos')
      .update({
        perfil_alvo: input.perfil_alvo,
        finalidade: input.finalidade,
        data_inicio: input.data_inicio,
        data_fim: input.data_fim,
        usuarios_ids: input.usuarios_ids,
        atualizado_em: new Date().toISOString(),
      })
      .eq('id', input.id);
    if (error) throw erroAmigavel(error as { code?: string; message?: string }, 'Não foi possível salvar o período.');
  } else {
    const { error } = await supabase.from('calendario_prazos').insert({
      perfil_alvo: input.perfil_alvo,
      finalidade: input.finalidade,
      data_inicio: input.data_inicio,
      data_fim: input.data_fim,
      usuarios_ids: input.usuarios_ids,
    });
    if (error) throw erroAmigavel(error as { code?: string; message?: string }, 'Não foi possível criar o período.');
  }
}

export async function desativarCalendarioPrazo(id: string): Promise<void> {
  const { error } = await supabase
    .from('calendario_prazos')
    .update({ ativo: false, atualizado_em: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error('Não foi possível desativar o período.');
}

export function situacaoPeriodo(prazo: CalendarioPrazo): 'vigente' | 'encerrado' | 'futuro' {
  const hoje = new Date();
  const inicio = new Date(prazo.data_inicio + 'T00:00:00');
  const fim = new Date(prazo.data_fim + 'T23:59:59');
  if (hoje < inicio) return 'futuro';
  if (hoje > fim) return 'encerrado';
  return 'vigente';
}

export const ROTULO_PERFIL_ALVO: Record<PerfilAlvo, string> = {
  docente: 'Docentes',
  pedagogia: 'Pedagogia',
  coordenacao: 'Coordenação Técnica',
};

export const ROTULO_FINALIDADE: Record<FinalidadePrazo, string> = {
  envio_docente: 'Período de envio de planos',
  analise_pedagogica: 'Período de análise pedagógica',
  analise_coordenacao: 'Período de análise da coordenação',
};

export const FINALIDADES_POR_PERFIL: Record<PerfilAlvo, FinalidadePrazo[]> = {
  docente: ['envio_docente'],
  pedagogia: ['analise_pedagogica'],
  coordenacao: ['analise_coordenacao'],
};
