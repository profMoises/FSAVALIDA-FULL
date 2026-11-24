import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CARD } from '@/components/ui';
import { formatarTempo } from '@/components/dashboard/TabelaTramitacao';
import type { DadosDashboardGerencial, EstatisticaTempo } from '@/lib/dashboard';

function CardSecao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className={`${CARD} p-5`}>
      <h2 className="mb-4 text-sm font-semibold text-slate-900">{titulo}</h2>
      {children}
    </div>
  );
}

function TabelaCursos({ dados }: { dados: DadosDashboardGerencial }) {
  if (dados.analise_cursos.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-400">Sem dados de cursos no período.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-500">
            <th className="px-3 py-2">Curso</th>
            <th className="px-3 py-2 text-right">Planos</th>
            <th className="px-3 py-2 text-right">Aguard. Ped.</th>
            <th className="px-3 py-2 text-right">Aguard. Coord.</th>
            <th className="px-3 py-2 text-right">Devol.</th>
            <th className="px-3 py-2 text-right">Publ.</th>
            <th className="px-3 py-2 text-right">% Publ.</th>
            <th className="px-3 py-2 text-right">Docentes</th>
            <th className="px-3 py-2 text-right">Atraso</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {dados.analise_cursos.map((c) => (
            <tr key={c.curso_nome} className="transition hover:bg-slate-50/70">
              <td className="px-3 py-2 font-medium text-slate-900">{c.curso_nome}</td>
              <td className="px-3 py-2 text-right text-slate-600">{c.total_planos}</td>
              <td className="px-3 py-2 text-right text-sky-700">{c.aguardando_pedagogia}</td>
              <td className="px-3 py-2 text-right text-blue-700">{c.aguardando_coordenacao}</td>
              <td className="px-3 py-2 text-right text-amber-700">{c.devolvidos}</td>
              <td className="px-3 py-2 text-right text-emerald-700">{c.publicados}</td>
              <td className="px-3 py-2 text-right font-medium text-slate-700">{c.percentual_publicacao}%</td>
              <td className="px-3 py-2 text-right text-slate-500">{c.docentes_enviaram}/{c.docentes_vinculados}</td>
              <td className="px-3 py-2 text-right">
                {c.planos_atraso > 0 ? (
                  <span className="font-medium text-red-600">{c.planos_atraso}</span>
                ) : (
                  <span className="text-slate-400">0</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TabelaDocentes({ dados }: { dados: DadosDashboardGerencial }) {
  if (dados.analise_docentes.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-400">Sem dados de docentes no período.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-500">
            <th className="px-3 py-2">Docente</th>
            <th className="px-3 py-2">Curso(s)</th>
            <th className="px-3 py-2 text-right">Planos</th>
            <th className="px-3 py-2 text-right">Em tramitação</th>
            <th className="px-3 py-2 text-right">Devol.</th>
            <th className="px-3 py-2 text-right">Publ.</th>
            <th className="px-3 py-2 text-right">Reenvios</th>
            <th className="px-3 py-2 text-right">Versões</th>
            <th className="px-3 py-2 text-right">Último envio</th>
            <th className="px-3 py-2 text-right">% Publ.</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {dados.analise_docentes.map((d) => (
            <tr key={d.docente_id} className="transition hover:bg-slate-50/70">
              <td className="px-3 py-2 font-medium text-slate-900">{d.docente_nome}</td>
              <td className="max-w-[140px] truncate px-3 py-2 text-slate-500" title={d.curso_nome}>{d.curso_nome}</td>
              <td className="px-3 py-2 text-right text-slate-600">{d.total_planos}</td>
              <td className="px-3 py-2 text-right text-sky-700">{d.em_tramitacao}</td>
              <td className="px-3 py-2 text-right text-amber-700">{d.devolvidos}</td>
              <td className="px-3 py-2 text-right text-emerald-700">{d.publicados}</td>
              <td className="px-3 py-2 text-right text-slate-500">{d.total_reenvios}</td>
              <td className="px-3 py-2 text-right text-slate-500">{d.total_versoes}</td>
              <td className="px-3 py-2 text-right text-slate-500">{d.ultimo_envio ?? '—'}</td>
              <td className="px-3 py-2 text-right font-medium text-slate-700">{d.percentual_publicados}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CardEstatisticaTempo({ titulo, stat }: { titulo: string; stat: EstatisticaTempo }) {
  const temDados = stat.amostras > 0;
  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <h3 className="text-xs font-medium text-slate-500">{titulo}</h3>
      {temDados ? (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div>
            <dt className="text-[11px] text-slate-400">Média</dt>
            <dd className="font-semibold text-slate-900">{formatarTempo(stat.media)}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-slate-400">Mediana</dt>
            <dd className="font-semibold text-slate-900">{formatarTempo(stat.mediana)}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-slate-400">Maior</dt>
            <dd className="text-slate-700">{formatarTempo(stat.maior)}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-slate-400">Menor</dt>
            <dd className="text-slate-700">{formatarTempo(stat.menor)}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-[11px] text-slate-400">Amostras</dt>
            <dd className="text-slate-500">{stat.amostras}</dd>
          </div>
        </dl>
      ) : (
        <p className="mt-3 text-xs text-slate-400">Sem dados suficientes.</p>
      )}
    </div>
  );
}

function TabelaEquipe({
  rotuloAprovados,
  rotuloDevolvidos,
  recebidos,
  analisados,
  aprovados,
  devolvidos,
  aguardando,
  individuais,
}: {
  rotuloAprovados: string;
  rotuloDevolvidos: string;
  recebidos: number;
  analisados: number;
  aprovados: number;
  devolvidos: number;
  aguardando: number;
  individuais: { nome: string; analisados: number; aprovados: number; devolvidos: number; ultima_acao: string }[];
}) {
  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          { label: 'Recebidos', valor: recebidos, cor: 'text-slate-900' },
          { label: 'Analisados', valor: analisados, cor: 'text-slate-700' },
          { label: rotuloAprovados, valor: aprovados, cor: 'text-emerald-700' },
          { label: rotuloDevolvidos, valor: devolvidos, cor: 'text-amber-700' },
          { label: 'Aguardando', valor: aguardando, cor: 'text-sky-700' },
        ].map((item) => (
          <div key={item.label} className="rounded-lg border border-slate-200 p-3">
            <p className="text-[11px] text-slate-400">{item.label}</p>
            <p className={`mt-1 text-xl font-bold ${item.cor}`}>{item.valor}</p>
          </div>
        ))}
      </div>

      {individuais.length > 0 && (
        <div className="mt-4">
          <h4 className="mb-2 text-xs font-medium text-slate-500">Análise individual</h4>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-500">
                <th className="px-3 py-2">Profissional</th>
                <th className="px-3 py-2 text-right">Analisados</th>
                <th className="px-3 py-2 text-right">Aprovados</th>
                <th className="px-3 py-2 text-right">Devolvidos</th>
                <th className="px-3 py-2 text-right">Última ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {individuais.map((ind) => (
                <tr key={ind.nome} className="transition hover:bg-slate-50/70">
                  <td className="px-3 py-2 font-medium text-slate-900">{ind.nome}</td>
                  <td className="px-3 py-2 text-right text-slate-600">{ind.analisados}</td>
                  <td className="px-3 py-2 text-right text-emerald-700">{ind.aprovados}</td>
                  <td className="px-3 py-2 text-right text-amber-700">{ind.devolvidos}</td>
                  <td className="px-3 py-2 text-right text-slate-500">{ind.ultima_acao}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {individuais.length === 0 && (
        <p className="mt-4 text-xs text-slate-400">
          Atribuição individual não registrada no histórico. Os dados são apresentados por equipe.
        </p>
      )}
    </div>
  );
}

export function SecoesAnalise({ dados }: { dados: DadosDashboardGerencial }) {
  const dadosEvolucao = useMemo(() => {
    const mapa = new Map<string, { envios: number; publicacoes: number; devolucoes: number }>();
    for (const e of dados.evolucao_envios) {
      const m = mapa.get(e.data) ?? { envios: 0, publicacoes: 0, devolucoes: 0 };
      m.envios = e.quantidade;
      mapa.set(e.data, m);
    }
    for (const e of dados.evolucao_publicacoes) {
      const m = mapa.get(e.data) ?? { envios: 0, publicacoes: 0, devolucoes: 0 };
      m.publicacoes = e.quantidade;
      mapa.set(e.data, m);
    }
    for (const e of dados.evolucao_devolucoes) {
      const m = mapa.get(e.data) ?? { envios: 0, publicacoes: 0, devolucoes: 0 };
      m.devolucoes = e.quantidade;
      mapa.set(e.data, m);
    }
    return Array.from(mapa.entries()).map(([data, v]) => ({ data, ...v }));
  }, [dados]);

  const dadosCursosGrafico = useMemo(
    () => dados.analise_cursos.slice(0, 8).map((c) => ({ name: c.curso_nome, Planos: c.total_planos, Publicados: c.publicados, Devolvidos: c.devolvidos })),
    [dados],
  );

  return (
    <div className="space-y-6">
      {/* Seção 2: Onde estão os planos */}
      <div>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Acompanhamento da tramitação dos planos</h2>
        <TabelaCursos dados={dados} />
      </div>

      {/* Gráficos comparativos de cursos */}
      {dadosCursosGrafico.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <CardSecao titulo="Comparativo de planos por curso">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={dadosCursosGrafico} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={110} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar dataKey="Planos" fill="#0284c7" radius={[0, 4, 4, 0]} />
                <Bar dataKey="Publicados" fill="#059669" radius={[0, 4, 4, 0]} />
                <Bar dataKey="Devolvidos" fill="#d97706" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardSecao>
          <CardSecao titulo="Percentual de publicação por curso">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={dados.analise_cursos.slice(0, 8)} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                <YAxis type="category" dataKey="curso_nome" tick={{ fontSize: 10 }} width={110} />
                <Tooltip formatter={(v) => `${v}%`} />
                <Bar dataKey="percentual_publicacao" fill="#0d7a6f" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardSecao>
        </div>
      )}

      {/* Seção 4: Análise por docente */}
      <div>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Análise por docente</h2>
        <CardSecao titulo="Participação dos docentes no processo">
          <TabelaDocentes dados={dados} />
        </CardSecao>
      </div>

      {/* Seção 5: Desempenho das equipes */}
      <div className="grid gap-4 lg:grid-cols-2">
        <CardSecao titulo="Desempenho da Pedagogia (NEP)">
          <TabelaEquipe
            rotuloAprovados="Aprovados"
            rotuloDevolvidos="Devolvidos"
            recebidos={dados.desempenho_pedagogia.planos_recebidos}
            analisados={dados.desempenho_pedagogia.planos_analisados}
            aprovados={dados.desempenho_pedagogia.planos_aprovados}
            devolvidos={dados.desempenho_pedagogia.planos_devolvidos}
            aguardando={dados.desempenho_pedagogia.aguardando_analise}
            individuais={dados.analise_individual_pedagogia}
          />
        </CardSecao>
        <CardSecao titulo="Desempenho da Coordenação Técnica">
          <TabelaEquipe
            rotuloAprovados="Publicados"
            rotuloDevolvidos="Devolvidos"
            recebidos={dados.desempenho_coordenacao.planos_recebidos}
            analisados={dados.desempenho_coordenacao.planos_analisados}
            aprovados={dados.desempenho_coordenacao.planos_aprovados}
            devolvidos={dados.desempenho_coordenacao.planos_devolvidos}
            aguardando={dados.desempenho_coordenacao.aguardando_analise}
            individuais={dados.analise_individual_coordenacao}
          />
        </CardSecao>
      </div>

      {/* Seção 6: Tempos de tramitação e gargalos */}
      <div>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Tempos de tramitação e gargalos</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <CardEstatisticaTempo titulo="Envio → Análise pedagógica" stat={dados.tempo_envio_pedagogia} />
          <CardEstatisticaTempo titulo="Análise pedagógica" stat={dados.tempo_analise_pedagogia} />
          <CardEstatisticaTempo titulo="Encaminhamento → Análise técnica" stat={dados.tempo_encaminhamento_coordenacao} />
          <CardEstatisticaTempo titulo="Total até publicação" stat={dados.tempo_total_publicacao} />
        </div>
        <p className="mt-3 text-xs text-slate-400">
          Os tempos são calculados em dias corridos a partir das datas reais registradas no histórico de movimentações.
          A mediana é apresentada junto à média para evitar distorções por casos extremos.
        </p>
      </div>

      {/* Seção 8: Evolução temporal */}
      <div>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Evolução temporal</h2>
        {dadosEvolucao.length === 0 ? (
          <CardSecao titulo="Evolução do fluxo">
            <p className="py-8 text-center text-sm text-slate-400">Sem dados de evolução no período.</p>
          </CardSecao>
        ) : (
          <CardSecao titulo="Envios, publicações e devoluções ao longo do tempo">
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={dadosEvolucao}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="data" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Line type="monotone" dataKey="envios" name="Envios" stroke="#0d7a6f" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="publicacoes" name="Publicações" stroke="#059669" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="devolucoes" name="Devoluções" stroke="#d97706" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardSecao>
        )}
      </div>

      {/* Seção 10: Síntese executiva */}
      <div>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Visão executiva</h2>
        <div className={`${CARD} p-5`}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs text-slate-400">% Planos publicados</p>
              <p className="text-2xl font-bold text-emerald-700">{dados.sintese.percentual_publicados}%</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">% Planos pendentes</p>
              <p className="text-2xl font-bold text-orange-600">{dados.sintese.percentual_pendentes}%</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Etapa com mais pendências</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {ROTULO_ETAPA_SINTESE[dados.sintese.etapa_mais_pendencias] ?? dados.sintese.etapa_mais_pendencias}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Curso com maior volume</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{dados.sintese.curso_maior_volume}</p>
            </div>
          </div>
          <div className="mt-4 border-t border-slate-100 pt-4">
            <p className="text-sm text-slate-600">
              {dados.indicadores.total_planos > 0 ? (
                <>
                  Neste período, {dados.indicadores.total_planos} plano{dados.indicadores.total_planos !== 1 ? 's' : ''} {' '}
                  {dados.indicadores.total_planos !== 1 ? 'foram cadastrados' : 'foi cadastrado'}.
                  Atualmente, {dados.indicadores.aguardando_pedagogia} aguarda{dados.indicadores.aguardando_pedagogia !== 1 ? 'm' : ''} análise pedagógica{' '}
                  e {dados.indicadores.aguardando_coordenacao} aguarda{dados.indicadores.aguardando_coordenacao !== 1 ? 'm' : ''} análise técnica.
                  {dados.indicadores.publicados > 0 && ` ${dados.indicadores.publicados} já ${dados.indicadores.publicados !== 1 ? 'foram publicados' : 'foi publicado'}.`}
                  {dados.indicadores.planos_atraso > 0 && ` ${dados.indicadores.planos_atraso} plano${dados.indicadores.planos_atraso !== 1 ? 's' : ''} está${dados.indicadores.planos_atraso !== 1 ? 'o' : ''} acima do prazo configurado.`}
                </>
              ) : (
                'Não há planos no período selecionado. Ajuste os filtros para visualizar dados.'
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

const ROTULO_ETAPA_SINTESE: Record<string, string> = {
  validacao_pedagogica: 'Análise pedagógica',
  validacao_coordenacao: 'Análise da coordenação',
  devolvido_docente: 'Correção pelo docente',
  publicado: 'Publicados',
};
