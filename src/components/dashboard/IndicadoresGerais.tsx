import type { DadosDashboardGerencial, ItemTramitacao } from '@/lib/dashboard';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Clock,
  RotateCcw,
  TrendingUp,
  Users,
  Hourglass,
  Send,
} from 'lucide-react';
import { CARD } from '@/components/ui';

type CardIndicador = {
  icone: typeof Users;
  label: string;
  valor: number;
  cor: string;
  variacao?: string;
  complemento?: string;
};

function calcularVariacao(atual: number, anterior: number): string | undefined {
  if (anterior === 0) return undefined;
  const v = ((atual - anterior) / anterior) * 100;
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;
}

export function IndicadoresGerais({
  dados,
  periodoLabel,
  onVerPlanos,
}: {
  dados: DadosDashboardGerencial;
  periodoLabel: string;
  onVerPlanos: (titulo: string, planos: ItemTramitacao[]) => void;
}) {
  const inds = dados.indicadores;
  const cards: CardIndicador[] = [
    {
      icone: ClipboardList,
      label: 'Total de planos',
      valor: inds.total_planos,
      cor: 'bg-sky-50 text-sky-700',
      variacao: calcularVariacao(inds.total_planos, inds.total_planos_anterior),
      complemento: periodoLabel,
    },
    {
      icone: Send,
      label: 'Planos enviados',
      valor: inds.planos_enviados,
      cor: 'bg-teal-50 text-teal-700',
      complemento: 'Com envio no período',
    },
    {
      icone: Clock,
      label: 'Aguard. pedagogia',
      valor: inds.aguardando_pedagogia,
      cor: 'bg-sky-50 text-sky-700',
      complemento: 'Estoque atual',
    },
    {
      icone: Clock,
      label: 'Aguard. coordenação',
      valor: inds.aguardando_coordenacao,
      cor: 'bg-blue-50 text-blue-700',
      complemento: 'Estoque atual',
    },
    {
      icone: RotateCcw,
      label: 'Devolvidos',
      valor: inds.devolvidos,
      cor: 'bg-amber-50 text-amber-800',
      variacao: calcularVariacao(inds.devolvidos, inds.devolvidos_anterior),
      complemento: 'Estoque atual',
    },
    {
      icone: CheckCircle2,
      label: 'Publicados',
      valor: inds.publicados,
      cor: 'bg-emerald-50 text-emerald-700',
      variacao: calcularVariacao(inds.publicados, inds.publicados_anterior),
      complemento: 'Aprovação e publicação',
    },
    {
      icone: Users,
      label: 'Docentes ativos',
      valor: inds.docentes_ativos,
      cor: 'bg-teal-50 text-teal-700',
      complemento: 'Enviaram no período',
    },
    {
      icone: TrendingUp,
      label: 'Tempo médio tramitação',
      valor: inds.tempo_medio_horas,
      cor: 'bg-slate-100 text-slate-700',
      complemento: inds.tempo_medio_horas > 0 ? `${inds.tempo_medio_horas} h (publicados)` : 'Sem dados',
    },
    {
      icone: Hourglass,
      label: 'Pendências',
      valor: inds.pendencias,
      cor: 'bg-orange-50 text-orange-700',
      complemento: 'Exigem ação',
    },
    {
      icone: AlertTriangle,
      label: 'Planos com atraso',
      valor: inds.planos_atraso,
      cor: 'bg-red-50 text-red-700',
      complemento: inds.planos_atraso > 0 ? 'Acima do prazo' : 'Nenhum atraso',
    },
  ];

  const planosPorIndicador: Record<string, ItemTramitacao[]> = {
    'Total de planos': dados.tramitacao,
    'Planos enviados': dados.tramitacao.filter((plano) => Boolean(plano.data_primeiro_envio)),
    'Aguard. pedagogia': dados.tramitacao.filter((plano) => plano.status === 'validacao_pedagogica'),
    'Aguard. coordenação': dados.tramitacao.filter((plano) => plano.status === 'validacao_coordenacao'),
    Devolvidos: dados.tramitacao.filter((plano) => plano.status === 'devolvido_docente'),
    Publicados: dados.tramitacao.filter((plano) => plano.status === 'publicado'),
    'Docentes ativos': dados.tramitacao.filter((plano) => Boolean(plano.data_primeiro_envio)),
    'Tempo médio tramitação': dados.tramitacao.filter((plano) => plano.status === 'publicado'),
    Pendências: dados.tramitacao.filter((plano) => plano.status !== 'publicado'),
    'Planos com atraso': dados.tramitacao.filter((plano) => plano.situacao_prazo === 'encerrado'),
  };

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-5">
      {cards.map((card) => (
        <button
          key={card.label}
          type="button"
          onClick={() => onVerPlanos(card.label, planosPorIndicador[card.label] ?? [])}
          className={`${CARD} p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-teal-600 focus:ring-offset-2`}
          aria-label={`Ver planos do indicador ${card.label}`}
        >
          <div className="mb-3 flex items-center justify-between">
            <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${card.cor}`}>
              <card.icone className="h-5 w-5" />
            </div>
            {card.variacao && (
              <span className={`text-xs font-semibold ${card.variacao.startsWith('+') ? 'text-emerald-600' : 'text-red-600'}`}>
                {card.variacao}
              </span>
            )}
          </div>
          <p className="text-2xl font-bold text-slate-900">{card.valor}</p>
          <p className="mt-1 text-xs font-medium text-slate-600">{card.label}</p>
          {card.complemento && (
            <p className="mt-0.5 text-[11px] text-slate-400">{card.complemento}</p>
          )}
        </button>
      ))}
    </div>
  );
}
