import { supabase } from '@/lib/supabase';
import type { Perfil } from '@/lib/domain';

export type TipoRelatorio = 'resumo' | 'nunca_logaram' | 'historico' | 'sem_acesso_periodo';

export type FiltroRelatorio = {
  perfil: Perfil | 'todos';
  tipo: TipoRelatorio;
  dataInicio: string | null;
  dataFim: string | null;
};

export type ResumoAcessos = {
  total_cadastrados: number;
  ja_logaram: number;
  nunca_logaram: number;
  sem_acesso_periodo: number;
  acessos_no_periodo: number;
};

export type UsuarioAcesso = {
  id: string;
  nome: string;
  email: string;
  perfil: string;
  vinculo: string;
  created_at: string;
  last_sign_in_at: string | null;
  ja_logou: boolean;
  total_acessos: number;
  primeiro_login: string | null;
  ultimo_login: string | null;
  acessos_no_periodo: number;
  email_verified: boolean;
  dias_desde_ultimo: number | null;
};

export type HistoricoLogin = {
  nome: string;
  email: string;
  perfil: string;
  data_hora: string;
  user_agent: string | null;
};

export type DadosRelatorio = {
  resumo: ResumoAcessos;
  usuarios: UsuarioAcesso[];
  historico: HistoricoLogin[];
};

export async function obterRelatorioAcessos(filtro: FiltroRelatorio): Promise<DadosRelatorio> {
  const { data, error } = await supabase.rpc('relatorio_acessos', {
    p_perfil: filtro.perfil === 'todos' ? null : filtro.perfil,
    p_data_inicio: filtro.dataInicio ? new Date(filtro.dataInicio).toISOString() : null,
    p_data_fim: filtro.dataFim ? new Date(filtro.dataFim + 'T23:59:59').toISOString() : null,
  });
  if (error) {
    const codigo = (error as { code?: string }).code;
    if (codigo === 'P0001' && error.message) throw new Error(error.message);
    throw new Error('Não foi possível gerar o relatório de acessos.');
  }
  return data as DadosRelatorio;
}

export const ROTULO_TIPO_RELATORIO: Record<TipoRelatorio, string> = {
  resumo: 'Resumo geral de acessos',
  nunca_logaram: 'Usuários que nunca fizeram login',
  historico: 'Histórico de logins',
  sem_acesso_periodo: 'Usuários sem acesso no período',
};

export const ROTULO_PERFIL_FILTRO: Record<Perfil | 'todos', string> = {
  admin: 'Administradores',
  docente: 'Docentes',
  pedagogia: 'Pedagogia (NEP)',
  coordenacao: 'Coordenação Técnica',
  todos: 'Todos os usuários',
};
