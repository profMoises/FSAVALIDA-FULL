import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, History, Loader2, Lock, Plus, Trash2 } from 'lucide-react';
import { ConfirmModal } from '@/components/ConfirmModal';
import { DecidirPlanoModal } from '@/components/planos/DecidirPlanoModal';
import { EnviarPlanoModal } from '@/components/planos/EnviarPlanoModal';
import { HistoricoPlanoModal } from '@/components/planos/HistoricoPlanoModal';
import { PlanoCard } from '@/components/planos/PlanoCard';
import { BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY, INPUT, LABEL, CARD } from '@/components/ui';
import type { PerfilAtual } from '@/contexts/AuthContext';
import { listarPastas } from '@/lib/pastas';
import { abrirPlanilha, decidirCoordenacao, decidirPedagogia, excluirPlano, listarInteracoes, listarPlanos } from '@/lib/planos';
import { idsDaSubarvore, ordenarArvore, rotuloIndentado, type PastaComProfundidade } from '@/lib/folders';
import { mensagemDeErro, type InteracaoPlano, type Pasta, type Plano, type StatusPlano } from '@/lib/domain';

type Filtro = 'todos' | StatusPlano;

const FILTROS: { id: Filtro; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'validacao_pedagogica', label: 'Validação pedagógica' },
  { id: 'validacao_coordenacao', label: 'Validação da coordenação' },
  { id: 'devolvido_docente', label: 'Devolvidos' },
  { id: 'publicado', label: 'Publicados' },
];

const SUBTITULO: Record<PerfilAtual['perfil'], string> = {
  admin: 'Visão geral de todos os planos de aula.',
  docente: 'Acompanhe os planos que você enviou para validação.',
  pedagogia: 'Planos enviados pelos docentes para a validação pedagógica.',
  coordenacao: 'Planos aguardando a validação técnica e a publicação.',
};

type Decisao = { plano: Plano; aprovar: boolean };

function textosDecisao(perfil: PerfilAtual['perfil'], aprovar: boolean) {
  if (perfil === 'coordenacao') {
    return aprovar
      ? {
          titulo: 'Publicar este plano?',
          mensagem: 'Ele ficará disponível na aba Publicações para o docente, a pedagogia e a coordenação da pasta.',
          botao: 'Validar e publicar',
        }
      : {
          titulo: 'Devolver ao docente?',
          mensagem: 'O docente receberá o plano para ajustes e, depois, enviará de volta direto para a coordenação.',
          botao: 'Devolver ao docente',
        };
  }
  return aprovar
    ? {
        titulo: 'Validar este plano?',
        mensagem: 'O plano seguirá para a validação da coordenação técnica.',
        botao: 'Validar e enviar',
      }
    : {
        titulo: 'Devolver ao docente?',
        mensagem: 'O docente receberá o plano para ajustes e, depois, enviará de volta para a pedagogia.',
        botao: 'Devolver ao docente',
      };
}

const MENSAGEM_EXCLUSAO_BLOQUEADA =
  'Planos enviados para validação não podem ser excluídos. Se houver devolutiva, envie uma nova versão pelo botão Enviar ajustes.';

export function PlanosPage({ profile }: { profile: PerfilAtual }) {
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [interacoes, setInteracoes] = useState<InteracaoPlano[]>([]);
  const [pastas, setPastas] = useState<Pasta[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [pastaFiltro, setPastaFiltro] = useState('todas');
  const [novoEnvio, setNovoEnvio] = useState(false);
  const [reenvio, setReenvio] = useState<Plano | null>(null);
  const [decisao, setDecisao] = useState<Decisao | null>(null);
  const [historicoPlano, setHistoricoPlano] = useState<Plano | null>(null);
  const [exclusao, setExclusao] = useState<Plano | null>(null);
  const [processando, setProcessando] = useState(false);
  const [erroDecisao, setErroDecisao] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setErroCarga(null);
    try {
      const [listaPlanos, listaPastas, listaInteracoes] = await Promise.all([listarPlanos(), listarPastas(), listarInteracoes()]);
      setPlanos(listaPlanos);
      setPastas(listaPastas);
      setInteracoes(listaInteracoes);
    } catch (erro) {
      setErroCarga(mensagemDeErro(erro, 'Não foi possível carregar os planos de aula.'));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const pastasDisponiveis: PastaComProfundidade[] = useMemo(() => {
    const arvore = ordenarArvore(pastas);
    if (profile.perfil !== 'docente') return arvore;
    const permitidas = new Set<string>();
    if (profile.pasta_id) {
      for (const id of idsDaSubarvore(pastas, profile.pasta_id)) permitidas.add(id);
    }
    for (const idVinculo of profile.pasta_ids) {
      for (const id of idsDaSubarvore(pastas, idVinculo)) permitidas.add(id);
    }
    return arvore.filter((pasta) => permitidas.has(pasta.id));
  }, [pastas, profile.perfil, profile.pasta_id, profile.pasta_ids]);

  const planosDaPasta = useMemo(
    () => planos.filter((plano) => pastaFiltro === 'todas' || plano.pasta_id === pastaFiltro),
    [planos, pastaFiltro],
  );

  const planosVisiveis = useMemo(
    () => planosDaPasta.filter((plano) => filtro === 'todos' || plano.status === filtro),
    [planosDaPasta, filtro],
  );

  const contagem = (filtroAlvo: Filtro) =>
    filtroAlvo === 'todos' ? planosDaPasta.length : planosDaPasta.filter((p) => p.status === filtroAlvo).length;

  const executarDecisao = async (orientacao: string) => {
    if (!decisao) return;
    setProcessando(true);
    setErroDecisao(null);
    try {
      if (profile.perfil === 'pedagogia') {
        await decidirPedagogia(decisao.plano.id, decisao.aprovar, orientacao);
      } else {
        await decidirCoordenacao(decisao.plano.id, decisao.aprovar, orientacao);
      }
      setDecisao(null);
      await carregar();
    } catch (erro) {
      setErroDecisao(mensagemDeErro(erro, 'Não foi possível concluir a ação. Tente novamente.'));
    } finally {
      setProcessando(false);
    }
  };

  const executarExclusao = async () => {
    if (!exclusao) return;
    setProcessando(true);
    setErroAcao(null);
    try {
      await excluirPlano(exclusao);
      setExclusao(null);
      await carregar();
    } catch (erro) {
      setErroAcao(mensagemDeErro(erro, 'Não foi possível excluir o plano de aula.'));
    } finally {
      setProcessando(false);
    }
  };

  const baixar = async (plano: Plano) => {
    setErroAcao(null);
    try {
      await abrirPlanilha(plano.arquivo_path);
    } catch (erro) {
      setErroAcao(mensagemDeErro(erro, 'Não foi possível abrir a planilha.'));
    }
  };

  return (
    <section className="animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Planos de aula</h1>
          <p className="mt-2 text-sm text-slate-500">{SUBTITULO[profile.perfil]}</p>
        </div>
        {profile.perfil === 'docente' && (
          <button type="button" onClick={() => setNovoEnvio(true)} className={BTN_PRIMARY}>
            <Plus className="h-4 w-4" />
            Enviar plano
          </button>
        )}
      </div>

      <div className="mt-8 flex flex-wrap items-end gap-3">
        <div className="min-w-[220px]">
          <label htmlFor="filtro-pasta" className={LABEL}>
            Pasta
          </label>
          <select
            id="filtro-pasta"
            value={pastaFiltro}
            onChange={(e) => setPastaFiltro(e.target.value)}
            className={`${INPUT} min-w-[220px]`}
          >
            <option value="todas">Todas as pastas</option>
            {pastasDisponiveis.map((pasta) => (
              <option key={pasta.id} value={pasta.id}>
                {rotuloIndentado(pasta.nome, pasta.profundidade)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
        {FILTROS.map((item) => {
          const ativo = filtro === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setFiltro(item.id)}
              aria-pressed={ativo}
              className={`inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-full border px-4 text-sm font-medium transition ${
                ativo
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              {item.label}
              <span
                className={`rounded-full px-2 py-0.5 text-xs ${ativo ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`}
              >
                {contagem(item.id)}
              </span>
            </button>
          );
        })}
      </div>

      {profile.perfil === 'docente' && (
        <p className="mt-6 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          {MENSAGEM_EXCLUSAO_BLOQUEADA}
        </p>
      )}

      {erroAcao && (
        <p role="alert" className="mt-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {erroAcao}
        </p>
      )}

      <div className="mt-6 space-y-3">
        {carregando && (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando planos...
          </div>
        )}

        {!carregando && erroCarga && (
          <div className={`${CARD} flex flex-col items-center gap-4 p-8 text-center`}>
            <p className="text-sm text-slate-600">{erroCarga}</p>
            <button type="button" onClick={carregar} className={BTN_SECONDARY}>
              Tentar novamente
            </button>
          </div>
        )}

        {!carregando && !erroCarga && planosVisiveis.length === 0 && (
          <div className={`${CARD} px-6 py-14 text-center`}>
            <p className="text-sm font-medium text-slate-700">Nenhum plano de aula por aqui.</p>
            <p className="mt-1 text-sm text-slate-500">Quando houver planos nesta etapa, eles aparecerão nesta lista.</p>
          </div>
        )}

        {!carregando &&
          !erroCarga &&
          planosVisiveis.map((plano) => (
            <PlanoCard key={plano.id} plano={plano}>
              <button type="button" onClick={() => setHistoricoPlano(plano)} className={BTN_SECONDARY}>
                <History className="h-4 w-4" />
                Histórico
              </button>
              {profile.perfil === 'docente' && plano.docente_id === profile.id && (
                <button
                  type="button"
                  disabled
                  className={`${BTN_SECONDARY} cursor-not-allowed opacity-60`}
                  title={MENSAGEM_EXCLUSAO_BLOQUEADA}
                  aria-label={`Exclusão indisponível. ${MENSAGEM_EXCLUSAO_BLOQUEADA}`}
                >
                  <Lock className="h-4 w-4" />
                  Excluir
                </button>
              )}
              {(profile.perfil === 'coordenacao' || profile.perfil === 'admin') && (
                <button
                  type="button"
                  onClick={() => setExclusao(plano)}
                  className={BTN_DANGER}
                  aria-label={`Excluir ${plano.titulo}`}
                >
                  <Trash2 className="h-4 w-4" />
                  Excluir
                </button>
              )}
              <button type="button" onClick={() => baixar(plano)} className={BTN_SECONDARY} aria-label="Baixar planilha">
                <Download className="h-4 w-4" />
                Planilha
              </button>

              {profile.perfil === 'docente' && plano.status === 'devolvido_docente' && (
                <button type="button" onClick={() => setReenvio(plano)} className={BTN_PRIMARY}>
                  Enviar ajustes
                </button>
              )}

              {((profile.perfil === 'pedagogia' && plano.status === 'validacao_pedagogica') ||
                (profile.perfil === 'coordenacao' && plano.status === 'validacao_coordenacao')) && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setErroDecisao(null);
                        setDecisao({ plano, aprovar: false });
                      }}
                      className={BTN_SECONDARY}
                    >
                      Devolver
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setErroDecisao(null);
                        setDecisao({ plano, aprovar: true });
                      }}
                      className={BTN_PRIMARY}
                    >
                      {profile.perfil === 'coordenacao' ? 'Validar e publicar' : 'Validar'}
                    </button>
                  </>
                )}
            </PlanoCard>
          ))}
      </div>

      {novoEnvio && (
        <EnviarPlanoModal
          userId={profile.id}
          pastas={pastasDisponiveis}
          onConcluido={() => {
            setNovoEnvio(false);
            carregar();
          }}
          onFechar={() => setNovoEnvio(false)}
        />
      )}

      {reenvio && (
        <EnviarPlanoModal
          userId={profile.id}
          plano={reenvio}
          pastas={[]}
          onConcluido={() => {
            setReenvio(null);
            carregar();
          }}
          onFechar={() => setReenvio(null)}
        />
      )}

      {decisao && (
        <DecidirPlanoModal
          aprovar={decisao.aprovar}
          titulo={textosDecisao(profile.perfil, decisao.aprovar).titulo}
          mensagem={textosDecisao(profile.perfil, decisao.aprovar).mensagem}
          textoConfirmar={textosDecisao(profile.perfil, decisao.aprovar).botao}
          processando={processando}
          erro={erroDecisao}
          onConfirmar={executarDecisao}
          onFechar={() => setDecisao(null)}
        />
      )}

      {historicoPlano && (
        <HistoricoPlanoModal
          plano={historicoPlano}
          interacoes={interacoes.filter((interacao) => interacao.plano_id === historicoPlano.id)}
          onFechar={() => setHistoricoPlano(null)}
        />
      )}

      {exclusao && (
        <ConfirmModal
          titulo="Excluir plano de aula?"
          mensagem={`O plano “${exclusao.titulo}” e o arquivo anexado serão removidos das listas. O histórico continuará preservado para consulta.`}
          textoConfirmar="Excluir plano"
          perigo
          processando={processando}
          erro={erroAcao}
          onConfirmar={executarExclusao}
          onFechar={() => setExclusao(null)}
        />
      )}
    </section>
  );
}
