import { supabase } from '@/lib/supabase';
import type {
  DadosDashboardGerencial,
  FiltrosDashboard,
  PeriodoDashboard,
} from '@/lib/dashboard';

export function calcularDatas(filtros: FiltrosDashboard): { inicio: string | null; fim: string | null } {
  const agora = new Date();
  if (filtros.periodo === 'personalizado') {
    return { inicio: filtros.dataInicio, fim: filtros.dataFim };
  }
  if (filtros.periodo === 'hoje') {
    const inicio = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
    const fim = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 23, 59, 59);
    return { inicio: inicio.toISOString(), fim: fim.toISOString() };
  }
  if (filtros.periodo === '7dias') {
    const inicio = new Date(agora.getTime() - 7 * 24 * 60 * 60 * 1000);
    return { inicio: inicio.toISOString(), fim: null };
  }
  if (filtros.periodo === '30dias') {
    const inicio = new Date(agora.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { inicio: inicio.toISOString(), fim: null };
  }
  if (filtros.periodo === '90dias') {
    const inicio = new Date(agora.getTime() - 90 * 24 * 60 * 60 * 1000);
    return { inicio: inicio.toISOString(), fim: null };
  }
  if (filtros.periodo === '6meses') {
    const inicio = new Date(agora.getTime() - 180 * 24 * 60 * 60 * 1000);
    return { inicio: inicio.toISOString(), fim: null };
  }
  if (filtros.periodo === 'ano') {
    const inicio = new Date(agora.getFullYear(), 0, 1);
    return { inicio: inicio.toISOString(), fim: null };
  }
  if (filtros.periodo === 'ano_anterior') {
    const inicio = new Date(agora.getFullYear() - 1, 0, 1);
    const fim = new Date(agora.getFullYear() - 1, 11, 31, 23, 59, 59);
    return { inicio: inicio.toISOString(), fim: fim.toISOString() };
  }
  return { inicio: null, fim: null };
}

export async function obterDashboardGerencial(
  filtros: FiltrosDashboard,
): Promise<DadosDashboardGerencial> {
  const { inicio, fim } = calcularDatas(filtros);
  const { data, error } = await supabase.rpc('dashboard_gerencial', {
    p_pasta_id: filtros.pastaId,
    p_docente_id: filtros.docenteId,
    p_responsavel_perfil: filtros.responsavelPerfil,
    p_status: filtros.status,
    p_data_inicio: inicio,
    p_data_fim: fim,
  });
  if (error) {
    const codigo = (error as { code?: string }).code;
    throw new Error(
      codigo === 'P0001' ? error.message : 'Não foi possível carregar os dados do painel. Tente novamente.',
    );
  }
  return data as DadosDashboardGerencial;
}

export async function obterPrazosConfigurados(): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from('dashboard_config_prazos')
    .select('etapa, prazo_dias');
  if (error) throw new Error('Não foi possível carregar os prazos configurados.');
  const mapa: Record<string, number> = {};
  for (const linha of data ?? []) {
    mapa[linha.etapa] = linha.prazo_dias;
  }
  return mapa;
}

export async function salvarPrazoConfigurado(etapa: string, prazoDias: number): Promise<void> {
  const { error } = await supabase
    .from('dashboard_config_prazos')
    .upsert({ etapa, prazo_dias: prazoDias }, { onConflict: 'etapa' });
  if (error) throw new Error('Não foi possível salvar o prazo. Verifique se você é administrador.');
}

export const PERIODOS: { id: PeriodoDashboard; label: string }[] = [
  { id: 'hoje', label: 'Hoje' },
  { id: '7dias', label: 'Últimos 7 dias' },
  { id: '30dias', label: 'Últimos 30 dias' },
  { id: '90dias', label: 'Últimos 90 dias' },
  { id: '6meses', label: 'Últimos 6 meses' },
  { id: 'ano', label: 'Ano atual' },
  { id: 'ano_anterior', label: 'Ano anterior' },
  { id: 'personalizado', label: 'Personalizado' },
];
