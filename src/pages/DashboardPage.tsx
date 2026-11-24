import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  Loader2,
  XCircle,
  Copy,
} from 'lucide-react';
import { BTN_PRIMARY, BTN_SECONDARY, CARD, INPUT, LABEL } from '@/components/ui';
import type { PerfilAtual } from '@/contexts/AuthContext';
import { listarDocentes } from '@/lib/usuarios';
import { listarPastas } from '@/lib/pastas';
import { ordenarArvore, rotuloIndentado, type PastaComProfundidade } from '@/lib/folders';
import { mensagemDeErro, type Pasta, type Usuario } from '@/lib/domain';
import {
  obterDashboardGerencial,
  PERIODOS,
  calcularDatas,
} from '@/lib/dashboard-data';
import {
  exportarXlsx,
  exportarCsv,
  exportarPdf,
} from '@/lib/dashboard-export';
import type { DadosDashboardGerencial, FiltrosDashboard } from '@/lib/dashboard';
import { IndicadoresGerais } from '@/components/dashboard/IndicadoresGerais';
import { TabelaTramitacao } from '@/components/dashboard/TabelaTramitacao';
import { SecoesAnalise } from '@/components/dashboard/SecoesAnalise';
import { DetalhePlanoModal, DetalheIndicadorModal } from '@/components/dashboard/DashboardModals';

export function DashboardPage({ profile }: { profile: PerfilAtual }) {
  if (profile.perfil === 'docente') {
    return (
      <div className={`${CARD} p-10 text-center`}>
        <p className="text-sm text-slate-500">
          O dashboard gerencial está disponível apenas para administradores, pedagogia e coordenação técnica.
        </p>
      </div>
    );
  }

  return <DashboardConteudo />;
}

function DashboardConteudo() {
  const [dados, setDados] = useState<DadosDashboardGerencial | null>(null);
  const [pastas, setPastas] = useState<Pasta[]>([]);
  const [docentes, setDocentes] = useState<Usuario[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [planoDetalheId, setPlanoDetalheId] = useState<string | null>(null);
  const [indicadorDetalhe, setIndicadorDetalhe] = useState<{ titulo: string; planos: DadosDashboardGerencial['tramitacao'] } | null>(null);
  const [filtros, setFiltros] = useState<FiltrosDashboard>({
    pastaId: null,
    docenteId: null,
    responsavelPerfil: null,
    status: null,
    periodo: 'ano',
    dataInicio: null,
    dataFim: null,
  });

  const carregar = useCallback(async () => {
    setErro(null);
    setCarregando(true);
    try {
      const [dadosDash, listaPastas, listaDocentes] = await Promise.all([
        obterDashboardGerencial(filtros),
        listarPastas(),
        listarDocentes(),
      ]);
      setDados(dadosDash);
      setPastas(listaPastas);
      setDocentes(listaDocentes);
    } catch (e) {
      setErro(mensagemDeErro(e, 'Não foi possível carregar o dashboard.'));
    } finally {
      setCarregando(false);
    }
  }, [filtros]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const arvorePastas: PastaComProfundidade[] = useMemo(() => ordenarArvore(pastas), [pastas]);

  const limparFiltros = () => {
    setFiltros({
      pastaId: null,
      docenteId: null,
      responsavelPerfil: null,
      status: null,
      periodo: 'ano',
      dataInicio: null,
      dataFim: null,
    });
  };

  const temFiltrosAtivos =
    filtros.pastaId ||
    filtros.docenteId ||
    filtros.responsavelPerfil ||
    filtros.status ||
    filtros.periodo !== 'ano';

  const periodoLabel = useMemo(() => {
    const p = PERIODOS.find((per) => per.id === filtros.periodo);
    const { inicio, fim } = calcularDatas(filtros);
    if (filtros.periodo === 'personalizado' && inicio && fim) {
      return `${new Date(inicio).toLocaleDateString('pt-BR')} a ${new Date(fim).toLocaleDateString('pt-BR')}`;
    }
    return p?.label ?? 'Ano atual';
  }, [filtros]);

  return (
    <section className="animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Dashboard gerencial</h1>
          <p className="mt-2 text-sm text-slate-500">
            Acompanhe a tramitação dos planos de aula: volume, pendências, responsáveis, tempos e gargalos.
          </p>
        </div>
      </div>

      {/* Filtros */}
      <div className={`${CARD} mt-6 p-4`}>
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-700">
          <Filter className="h-4 w-4 text-teal-700" />
          Filtros
          {temFiltrosAtivos && (
            <span className="inline-flex rounded-full bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700">
              Filtros ativos
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-[200px]">
            <label htmlFor="filtro-curso" className={LABEL}>Curso / Pasta</label>
            <select
              id="filtro-curso"
              value={filtros.pastaId ?? ''}
              onChange={(e) => setFiltros((f) => ({ ...f, pastaId: e.target.value || null }))}
              className={INPUT}
            >
              <option value="">Todos os cursos</option>
              {arvorePastas.map((pasta) => (
                <option key={pasta.id} value={pasta.id}>{rotuloIndentado(pasta.nome, pasta.profundidade)}</option>
              ))}
            </select>
          </div>

          <div className="min-w-[180px]">
            <label htmlFor="filtro-docente" className={LABEL}>Docente</label>
            <select
              id="filtro-docente"
              value={filtros.docenteId ?? ''}
              onChange={(e) => setFiltros((f) => ({ ...f, docenteId: e.target.value || null }))}
              className={INPUT}
            >
              <option value="">Todos os docentes</option>
              {docentes.map((d) => (
                <option key={d.id} value={d.id}>{d.nome}</option>
              ))}
            </select>
          </div>

          <div className="min-w-[180px]">
            <label htmlFor="filtro-responsavel" className={LABEL}>Responsável atual</label>
            <select
              id="filtro-responsavel"
              value={filtros.responsavelPerfil ?? ''}
              onChange={(e) => setFiltros((f) => ({ ...f, responsavelPerfil: e.target.value || null }))}
              className={INPUT}
            >
              <option value="">Todos</option>
              <option value="pedagogia">Pedagogia</option>
              <option value="coordenacao">Coordenação técnica</option>
              <option value="docente">Docente (devolvidos)</option>
            </select>
          </div>

          <div className="min-w-[160px]">
            <label htmlFor="filtro-status" className={LABEL}>Status do plano</label>
            <select
              id="filtro-status"
              value={filtros.status ?? ''}
              onChange={(e) => setFiltros((f) => ({ ...f, status: e.target.value || null }))}
              className={INPUT}
            >
              <option value="">Todos os status</option>
              <option value="validacao_pedagogica">Aguardando pedagogia</option>
              <option value="validacao_coordenacao">Aguardando coordenação</option>
              <option value="devolvido_docente">Devolvidos</option>
              <option value="publicado">Publicados</option>
            </select>
          </div>

          <div>
            <label htmlFor="filtro-periodo" className={LABEL}>Período</label>
            <select
              id="filtro-periodo"
              value={filtros.periodo}
              onChange={(e) => setFiltros((f) => ({ ...f, periodo: e.target.value as FiltrosDashboard['periodo'] }))}
              className={INPUT}
            >
              {PERIODOS.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </div>

          {filtros.periodo === 'personalizado' && (
            <>
              <div>
                <label htmlFor="data-inicio" className={LABEL}>Data inicial</label>
                <input
                  id="data-inicio"
                  type="date"
                  value={filtros.dataInicio ? filtros.dataInicio.split('T')[0] : ''}
                  onChange={(e) =>
                    setFiltros((f) => ({
                      ...f,
                      dataInicio: e.target.value ? new Date(e.target.value).toISOString() : null,
                    }))
                  }
                  className={INPUT}
                />
              </div>
              <div>
                <label htmlFor="data-fim" className={LABEL}>Data final</label>
                <input
                  id="data-fim"
                  type="date"
                  value={filtros.dataFim ? filtros.dataFim.split('T')[0] : ''}
                  onChange={(e) =>
                    setFiltros((f) => ({
                      ...f,
                      dataFim: e.target.value ? new Date(e.target.value + 'T23:59:59').toISOString() : null,
                    }))
                  }
                  className={INPUT}
                />
              </div>
            </>
          )}

          {temFiltrosAtivos && (
            <button type="button" onClick={limparFiltros} className={BTN_SECONDARY}>
              <XCircle className="h-4 w-4" />
              Limpar filtros
            </button>
          )}
        </div>
      </div>

      {erro && (
        <p role="alert" className="mt-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</p>
      )}

      {carregando && (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando dashboard...
        </div>
      )}

      {!carregando && dados && (
        <>
          {/* Barra de ações: exportação + contagem */}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <span className="font-medium text-slate-700">{dados.total_registros}</span>
              {dados.total_registros === 1 ? 'plano encontrado' : 'planos encontrados'}
              <span className="text-slate-300">·</span>
              <span>{periodoLabel}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => exportarXlsx(dados, filtros)}
                className={BTN_SECONDARY}
                title="Exportar em Excel (XLSX) com múltiplas abas"
              >
                <FileSpreadsheet className="h-4 w-4" />
                Excel
              </button>
              <button
                type="button"
                onClick={() => exportarCsv(dados, filtros)}
                className={BTN_SECONDARY}
                title="Exportar tabela em CSV"
              >
                <Copy className="h-4 w-4" />
                CSV
              </button>
              <button
                type="button"
                onClick={() => exportarPdf(dados, filtros)}
                className={BTN_PRIMARY}
                title="Gerar relatório em PDF"
              >
                <FileText className="h-4 w-4" />
                PDF
              </button>
            </div>
          </div>

          {/* Seção 1: Indicadores gerais */}
          <div className="mt-6">
            <IndicadoresGerais
              dados={dados}
              periodoLabel={periodoLabel}
              onVerPlanos={(titulo, planos) => setIndicadorDetalhe({ titulo, planos })}
            />
          </div>

          {/* Seção 2: Onde estão os planos - tabela de tramitação */}
          <div className="mt-8">
            <h2 className="mb-3 text-lg font-semibold text-slate-900">Onde estão os planos?</h2>
            {dados.tramitacao.length === 0 ? (
              <div className={`${CARD} p-10 text-center`}>
                <p className="text-sm text-slate-500">
                  Nenhum plano encontrado com os filtros selecionados.
                </p>
                {filtros.pastaId && (
                  <p className="mt-2 text-xs text-slate-400">
                    Verifique se há planos cadastrados neste curso ou em suas sub-pastas.
                  </p>
                )}
              </div>
            ) : (
              <TabelaTramitacao
                planos={dados.tramitacao}
                prazos={dados.prazos_configurados}
                onVerDetalhe={setPlanoDetalheId}
              />
            )}
          </div>

          {/* Seções 3-10: Análises */}
          <div className="mt-8">
            <SecoesAnalise dados={dados} />
          </div>
        </>
      )}

      {!carregando && !erro && dados && dados.total_registros === 0 && (
        <div className={`${CARD} mt-6 p-10 text-center`}>
          <Download className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-3 text-sm text-slate-500">
            Não há dados para os filtros selecionados. Ajuste os filtros ou o período para visualizar informações.
          </p>
        </div>
      )}

      {indicadorDetalhe && (
        <DetalheIndicadorModal
          titulo={indicadorDetalhe.titulo}
          planos={indicadorDetalhe.planos}
          onFechar={() => setIndicadorDetalhe(null)}
          onVerDetalhe={(id) => {
            setIndicadorDetalhe(null);
            setPlanoDetalheId(id);
          }}
        />
      )}

      {planoDetalheId && (
        <DetalhePlanoModal planoId={planoDetalheId} onFechar={() => setPlanoDetalheId(null)} />
      )}
    </section>
  );
}
