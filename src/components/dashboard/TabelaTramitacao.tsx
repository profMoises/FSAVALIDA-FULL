import { useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Search,
} from 'lucide-react';
import { CARD, INPUT } from '@/components/ui';
import { ROTULOS_STATUS } from '@/components/dashboard/DashboardModals';
import type { ItemTramitacao } from '@/lib/dashboard';

const ROTULO_SITUACAO: Record<string, { label: string; classe: string }> = {
  dentro_prazo: { label: 'Dentro do prazo', classe: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' },
  nao_iniciado: { label: 'Não iniciado', classe: 'bg-sky-50 text-sky-700 ring-sky-600/20' },
  encerrado: { label: 'Prazo encerrado', classe: 'bg-red-50 text-red-700 ring-red-600/20' },
  sem_prazo: { label: 'Sem prazo', classe: 'bg-slate-100 text-slate-500 ring-slate-400/20' },
  concluido: { label: 'Concluído', classe: 'bg-teal-50 text-teal-700 ring-teal-600/20' },
};

const ROTULO_PERFIL_RESP: Record<string, string> = {
  pedagogia: 'Pedagogia',
  coordenacao: 'Coordenação',
  docente: 'Docente',
  concluido: 'Concluído',
};

function formatarTempo(horas: number): string {
  if (horas < 1) return `${Math.round(horas * 60)} min`;
  if (horas < 24) return `${horas.toFixed(1)} h`;
  return `${(horas / 24).toFixed(1)} dias`;
}

type OrdemColuna = 'titulo' | 'curso_nome' | 'data_entrada' | 'tempo_etapa' | 'responsavel_atual';

export function TabelaTramitacao({
  planos,
  onVerDetalhe,
  prazos = {},
}: {
  planos: ItemTramitacao[];
  onVerDetalhe: (id: string) => void;
  prazos?: Record<string, number>;
}) {
  const [busca, setBusca] = useState('');
  const [filtroSituacao, setFiltroSituacao] = useState('todos');
  const [ordemColuna, setOrdemColuna] = useState<OrdemColuna>('data_entrada');
  const [ordemAsc, setOrdemAsc] = useState(false);
  const [pagina, setPagina] = useState(0);
  const porPagina = 10;

  const planosFiltrados = useMemo(() => {
    let resultado = planos;
    if (busca) {
      const b = busca.toLowerCase();
      resultado = resultado.filter(
        (p) =>
          p.titulo.toLowerCase().includes(b) ||
          p.docente_nome?.toLowerCase().includes(b) ||
          p.curso_nome?.toLowerCase().includes(b),
      );
    }
    if (filtroSituacao !== 'todos') {
      resultado = resultado.filter((p) => p.situacao_prazo === filtroSituacao);
    }
    resultado = [...resultado].sort((a, b) => {
      let cmp = 0;
      switch (ordemColuna) {
        case 'titulo':
          cmp = a.titulo.localeCompare(b.titulo, 'pt-BR');
          break;
        case 'curso_nome':
          cmp = (a.curso_nome ?? '').localeCompare(b.curso_nome ?? '', 'pt-BR');
          break;
        case 'data_entrada':
          cmp = (a.data_entrada_etapa_iso ?? '').localeCompare(b.data_entrada_etapa_iso ?? '');
          break;
        case 'tempo_etapa':
          cmp = a.tempo_etapa_horas - b.tempo_etapa_horas;
          break;
        case 'responsavel_atual':
          cmp = (a.responsavel_atual ?? '').localeCompare(b.responsavel_atual ?? '', 'pt-BR');
          break;
      }
      return ordemAsc ? cmp : -cmp;
    });
    return resultado;
  }, [planos, busca, filtroSituacao, ordemColuna, ordemAsc]);

  const totalPaginas = Math.ceil(planosFiltrados.length / porPagina);
  const inicio = pagina * porPagina;
  const planosPagina = planosFiltrados.slice(inicio, inicio + porPagina);

  const alternarOrdem = (col: OrdemColuna) => {
    if (ordemColuna === col) {
      setOrdemAsc((v) => !v);
    } else {
      setOrdemColuna(col);
      setOrdemAsc(true);
    }
  };

  const Setinha = ({ col }: { col: OrdemColuna }) =>
    ordemColuna === col ? (
      <span className="ml-1 text-slate-400">{ordemAsc ? '↑' : '↓'}</span>
    ) : null;

  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar plano, docente, curso..."
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                setPagina(0);
              }}
              className={`${INPUT} max-w-[260px] pl-9`}
            />
          </div>
          <select
            value={filtroSituacao}
            onChange={(e) => {
              setFiltroSituacao(e.target.value);
              setPagina(0);
            }}
            className={`${INPUT} max-w-[180px]`}
          >
            <option value="todos">Todas as situações</option>
            <option value="dentro_prazo">Dentro do prazo</option>
            <option value="nao_iniciado">Não iniciado</option>
            <option value="encerrado">Prazo encerrado</option>
            <option value="sem_prazo">Sem prazo config.</option>
            <option value="concluido">Concluído</option>
          </select>
        </div>
        <span className="text-xs text-slate-500">
          {planosFiltrados.length} de {planos.length} planos
        </span>
      </div>

      {planosPagina.length === 0 ? (
        <p className="px-6 py-10 text-center text-sm text-slate-500">Nenhum plano encontrado com os critérios selecionados.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-500">
                <th className="cursor-pointer px-4 py-3 hover:text-slate-700" onClick={() => alternarOrdem('titulo')}>
                  Plano<Setinha col="titulo" />
                </th>
                <th className="cursor-pointer px-4 py-3 hover:text-slate-700" onClick={() => alternarOrdem('curso_nome')}>
                  Curso<Setinha col="curso_nome" />
                </th>
                <th className="px-4 py-3">Pasta</th>
                <th className="px-4 py-3">Docente</th>
                <th className="px-4 py-3">Status</th>
                <th className="cursor-pointer px-4 py-3 hover:text-slate-700" onClick={() => alternarOrdem('responsavel_atual')}>
                  Com quem está<Setinha col="responsavel_atual" />
                </th>
                <th className="px-4 py-3">Entrada na etapa</th>
                <th className="px-4 py-3">Última movimentação</th>
                <th className="px-4 py-3">Último responsável</th>
                <th className="px-4 py-3">Prazo</th>
                <th className="cursor-pointer px-4 py-3 hover:text-slate-700" onClick={() => alternarOrdem('tempo_etapa')}>
                  Tempo na etapa<Setinha col="tempo_etapa" />
                </th>
                <th className="px-4 py-3">Situação</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {planosPagina.map((p) => {
                const sit = ROTULO_SITUACAO[p.situacao_prazo] ?? ROTULO_SITUACAO.sem_prazo;
                return (
                  <tr
                    key={p.id}
                    className="cursor-pointer transition hover:bg-slate-50/70"
                    onClick={() => onVerDetalhe(p.id)}
                  >
                    <td className="max-w-[160px] truncate px-4 py-3 font-medium text-slate-900" title={p.titulo}>{p.titulo}</td>
                    <td className="px-4 py-3 text-slate-600">{p.curso_nome ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{p.pasta_nome ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{p.docente_nome ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                        {ROTULOS_STATUS[p.status] ?? p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <div>{p.responsavel_atual ?? '—'}</div>
                      {p.responsavel_perfil && (
                        <div className="text-[11px] text-slate-400">{ROTULO_PERFIL_RESP[p.responsavel_perfil] ?? p.responsavel_perfil}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{p.data_entrada_etapa ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{p.data_ultima_interacao ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{p.ultimo_autor_nome ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {p.prazo_data_inicio && p.prazo_data_fim
                        ? `${p.prazo_data_inicio} a ${p.prazo_data_fim}`
                        : 'Sem prazo'}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{formatarTempo(p.tempo_etapa_horas)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${sit.classe}`}>
                        {sit.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={(evento) => {
                          evento.stopPropagation();
                          onVerDetalhe(p.id);
                        }}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-teal-700"
                        title="Ver detalhes e histórico"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPaginas > 1 && (
        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
          <span className="text-xs text-slate-500">
            Página {pagina + 1} de {totalPaginas}
          </span>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setPagina((p) => Math.max(0, p - 1))}
              disabled={pagina === 0}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setPagina((p) => Math.min(totalPaginas - 1, p + 1))}
              disabled={pagina >= totalPaginas - 1}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export { formatarTempo };
