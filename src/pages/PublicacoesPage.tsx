import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Download, Folder, FileSpreadsheet, Home, Loader2, SlidersHorizontal } from 'lucide-react';
import type { PerfilAtual } from '@/contexts/AuthContext';
import { SelecionarPastasModal } from '@/components/publicacoes/SelecionarPastasModal';
import { BTN_ICON, BTN_SECONDARY, CARD } from '@/components/ui';
import { listarPastas } from '@/lib/pastas';
import { abrirPlanilha, listarPlanos } from '@/lib/planos';
import { caminhoDaPasta, idsDaSubarvore, ordenarArvore } from '@/lib/folders';
import { formatarDataHora, formatarTamanho, mensagemDeErro, type Pasta, type Plano } from '@/lib/domain';

export function PublicacoesPage({ profile }: { profile: PerfilAtual }) {
  const modoSelecao = profile.perfil === 'pedagogia' || profile.perfil === 'coordenacao';
  const perfilDocente = profile.perfil === 'docente';
  const pastaInicial = null;
  const [pastas, setPastas] = useState<Pasta[]>([]);
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [escolha, setEscolha] = useState<string[] | null>(null);
  const [seletorAberto, setSeletorAberto] = useState(false);
  const [atualId, setAtualId] = useState<string | null>(pastaInicial);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const [listaPastas, listaPlanos] = await Promise.all([listarPastas(), listarPlanos()]);
        if (!ativo) return;
        setPastas(listaPastas);
        setPlanos(listaPlanos);
      } catch (erroCarga) {
        if (ativo) setErro(mensagemDeErro(erroCarga, 'Não foi possível carregar as publicações.'));
      } finally {
        if (ativo) setCarregando(false);
      }
    })();
    return () => {
      ativo = false;
    };
  }, []);

  const pastasAutorizadasDocente = useMemo(() => {
    if (!perfilDocente) return null;
    const ids = new Set<string>();
    if (profile.pasta_id) {
      for (const id of idsDaSubarvore(pastas, profile.pasta_id)) ids.add(id);
    }
    for (const idVinculo of profile.pasta_ids) {
      for (const id of idsDaSubarvore(pastas, idVinculo)) ids.add(id);
    }
    const raizesAutorizadas = new Set<string>();
    if (profile.pasta_id) raizesAutorizadas.add(profile.pasta_id);
    for (const idVinculo of profile.pasta_ids) raizesAutorizadas.add(idVinculo);
    return { raizes: raizesAutorizadas, todas: ids };
  }, [pastas, perfilDocente, profile.pasta_id, profile.pasta_ids]);

  const selecionadas = useMemo(() => {
    if (escolha) return escolha;
    if (perfilDocente && pastasAutorizadasDocente) {
      return [...pastasAutorizadasDocente.raizes];
    }
    return pastas.map((pasta) => pasta.id);
  }, [modoSelecao, perfilDocente, pastasAutorizadasDocente, profile.pasta_id, profile.pasta_ids, escolha, pastas]);

  const visiveis = useMemo(() => {
    const ids = new Set<string>();
    selecionadas.forEach((id) => idsDaSubarvore(pastas, id).forEach((item) => ids.add(item)));
    return ids;
  }, [pastas, selecionadas]);

  const raizes = useMemo(() => {
    const marcadas = new Set(selecionadas);
    return pastas
      .filter(
        (pasta) =>
          marcadas.has(pasta.id) &&
          !caminhoDaPasta(pastas, pasta.id)
            .slice(0, -1)
            .some((ancestral) => marcadas.has(ancestral.id)),
      )
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [pastas, selecionadas]);

  const publicados = useMemo(
    () => planos.filter((plano) => plano.status === 'publicado' && visiveis.has(plano.pasta_id)),
    [planos, visiveis],
  );

  const caminho = useMemo(() => (atualId ? caminhoDaPasta(pastas, atualId) : []), [pastas, atualId]);

  const caminhoVisivel = caminho;

  const subpastas = useMemo(() => {
    if (atualId === null) return raizes;
    return pastas
      .filter((pasta) => pasta.pai_id === atualId && visiveis.has(pasta.id))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [pastas, atualId, visiveis, raizes]);

  const planosDaPasta = useMemo(
    () =>
      publicados
        .filter((plano) => plano.pasta_id === atualId)
        .sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR')),
    [publicados, atualId],
  );

  const arvore = useMemo(() => ordenarArvore(pastas), [pastas]);

  const contarPlanos = (pastaId: string) => {
    const dentro = idsDaSubarvore(pastas, pastaId);
    return publicados.filter((plano) => dentro.has(plano.pasta_id)).length;
  };

  const baixar = async (plano: Plano) => {
    setErro(null);
    try {
      await abrirPlanilha(plano.arquivo_path);
    } catch (erroAbrir) {
      setErro(mensagemDeErro(erroAbrir, 'Não foi possível abrir a planilha.'));
    }
  };

  const semSelecao = selecionadas.length === 0;
  const vazio = subpastas.length === 0 && planosDaPasta.length === 0;
  const crumbs = caminhoVisivel;

  return (
    <section className="animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Publicações</h1>
          <p className="mt-2 text-sm text-slate-500">Planos de aula publicados, organizados por pasta.</p>
        </div>
        {modoSelecao && !carregando && (
          <button type="button" onClick={() => setSeletorAberto(true)} className={BTN_SECONDARY}>
            <SlidersHorizontal className="h-4 w-4" />
            Pastas exibidas ({selecionadas.length})
          </button>
        )}
      </div>

      {carregando && (
        <div className="mt-10 flex items-center justify-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando publicações...
        </div>
      )}

      {!carregando && (
        <div className={`${CARD} mt-8 overflow-hidden`}>
          <div className="flex flex-wrap items-center gap-1 border-b border-slate-100 bg-slate-50/70 px-5 py-3 text-sm">
            <button
              type="button"
              onClick={() => setAtualId(pastaInicial)}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-medium text-slate-700 transition hover:bg-white hover:text-teal-700"
            >
              <Home className="h-4 w-4" />
              {modoSelecao ? 'Pastas selecionadas' : caminhoVisivel[0]?.nome ?? 'Início'}
            </button>
            {crumbs.map((pasta) => (
              <span key={pasta.id} className="flex items-center gap-1">
                <ChevronRight className="h-4 w-4 text-slate-400" />
                <button
                  type="button"
                  onClick={() => setAtualId(pasta.id)}
                  className="rounded-md px-2 py-1 font-medium text-slate-700 transition hover:bg-white hover:text-teal-700"
                >
                  {pasta.nome}
                </button>
              </span>
            ))}
          </div>

          {erro && (
            <p role="alert" className="border-b border-red-100 bg-red-50 px-5 py-3 text-sm text-red-700">
              {erro}
            </p>
          )}

          {semSelecao && (
            <div className="px-6 py-14 text-center">
              <p className="text-sm font-medium text-slate-700">Nenhuma pasta selecionada.</p>
              <p className="mt-1 text-sm text-slate-500">Use “Pastas exibidas” para escolher o que deseja visualizar.</p>
            </div>
          )}

          {!semSelecao && vazio && (
            <div className="px-6 py-14 text-center">
              <p className="text-sm font-medium text-slate-700">Esta pasta ainda não tem planos publicados.</p>
              <p className="mt-1 text-sm text-slate-500">Os planos aparecerão aqui depois da publicação pela coordenação.</p>
            </div>
          )}

          <ul className="divide-y divide-slate-100">
            {subpastas.map((pasta) => {
              const quantidade = contarPlanos(pasta.id);
              return (
                <li key={pasta.id}>
                  <button
                    type="button"
                    onClick={() => setAtualId(pasta.id)}
                    className="group flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-teal-50/50"
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50 text-teal-700 transition group-hover:bg-teal-100">
                      <Folder className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-slate-900">{pasta.nome}</span>
                      <span className="block text-xs text-slate-500">
                        {quantidade} {quantidade === 1 ? 'plano publicado' : 'planos publicados'}
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-teal-700" />
                  </button>
                </li>
              );
            })}

            {planosDaPasta.map((plano) => (
              <li key={plano.id} className="flex items-center gap-4 px-5 py-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                  <FileSpreadsheet className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-900">{plano.titulo}</p>
                  <p className="truncate text-xs text-slate-500">
                    {plano.docente?.nome ?? 'Docente'} · {plano.arquivo_nome} ({formatarTamanho(plano.arquivo_tamanho)}) ·{' '}
                    {formatarDataHora(plano.updated_at)}
                  </p>
                </div>
                <button type="button" onClick={() => baixar(plano)} className={BTN_ICON} aria-label={`Baixar ${plano.titulo}`} title="Baixar planilha">
                  <Download className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {seletorAberto && (
        <SelecionarPastasModal
          pastas={arvore}
          selecionadas={selecionadas}
          onAplicar={(ids) => {
            setEscolha(ids);
            setAtualId(null);
            setSeletorAberto(false);
          }}
          onFechar={() => setSeletorAberto(false)}
        />
      )}
    </section>
  );
}
