import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Modal } from '@/components/Modal';
import { BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY, CARD, INPUT, LABEL } from '@/components/ui';
import type { PerfilAtual } from '@/contexts/AuthContext';
import {
  listarCalendarioPrazos,
  salvarCalendarioPrazo,
  desativarCalendarioPrazo,
  situacaoPeriodo,
  ROTULO_PERFIL_ALVO,
  type CalendarioPrazo,
  type PerfilAlvo,
} from '@/lib/calendario-prazos';
import { listarUsuarios } from '@/lib/usuarios';
import { mensagemDeErro, type Usuario } from '@/lib/domain';

type Edicao = {
  id?: string;
  perfil_alvo: PerfilAlvo;
  data_inicio: string;
  data_fim: string;
  usuarios_ids: string[];
  selecionarTodos: boolean;
};

const SITUACAO_STYLE: Record<string, string> = {
  vigente: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  encerrado: 'bg-red-50 text-red-700 ring-red-600/20',
  futuro: 'bg-sky-50 text-sky-700 ring-sky-600/20',
};

const SITUACAO_LABEL: Record<string, string> = {
  vigente: 'Dentro do prazo',
  encerrado: 'Prazo encerrado',
  futuro: 'Não iniciado',
};

function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

function formatarDataHora(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(iso));
}

const SECOES: { perfil: PerfilAlvo; titulo: string; plural: string }[] = [
  { perfil: 'docente', titulo: 'Docentes', plural: 'docentes' },
  { perfil: 'coordenacao', titulo: 'Coordenadores', plural: 'coordenadores' },
  { perfil: 'pedagogia', titulo: 'Pedagogia', plural: 'pedagogas' },
];

export function ConfiguracaoPrazosPage({ profile }: { profile: PerfilAtual }) {
  const podeGerenciar = profile.perfil === 'admin' || profile.perfil === 'coordenacao' || profile.perfil === 'pedagogia';

  const [prazos, setPrazos] = useState<CalendarioPrazo[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [edicao, setEdicao] = useState<Edicao | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erroSalvar, setErroSalvar] = useState<string | null>(null);
  const [exclusao, setExclusao] = useState<CalendarioPrazo | null>(null);
  const [desativando, setDesativando] = useState(false);
  const [erroDesativar, setErroDesativar] = useState<string | null>(null);
  const [nomesResponsaveis, setNomesResponsaveis] = useState<Record<string, string>>({});

  const carregar = async () => {
    setErro(null);
    try {
      const [listaPrazos, listaUsuarios] = await Promise.all([listarCalendarioPrazos(), listarUsuarios()]);
      setPrazos(listaPrazos);
      setUsuarios(listaUsuarios);

      const responsaveis = listaPrazos
        .map((p) => p.criado_por)
        .filter((id): id is string => id !== null);
      if (responsaveis.length > 0) {
        const { data: dadosResp } = await supabase
          .from('profiles')
          .select('id, nome')
          .in('id', [...new Set(responsaveis)]);
        const mapa: Record<string, string> = {};
        for (const r of dadosResp ?? []) mapa[r.id] = r.nome;
        setNomesResponsaveis(mapa);
      }
    } catch (e) {
      setErro(mensagemDeErro(e, 'Não foi possível carregar os períodos.'));
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregar();
  }, []);

  const usuariosPorPerfil = useMemo(() => {
    const mapa: Record<PerfilAlvo, Usuario[]> = {
      docente: usuarios.filter((u) => u.perfil === 'docente'),
      pedagogia: usuarios.filter((u) => u.perfil === 'pedagogia'),
      coordenacao: usuarios.filter((u) => u.perfil === 'coordenacao'),
    };
    return mapa;
  }, [usuarios]);

  const nomesUsuarios = (ids: string[]) => {
    if (ids.length === 0) return 'Todos';
    return ids.map((id) => usuarios.find((u) => u.id === id)?.nome ?? '—').join(', ');
  };

  const iniciarNovo = (perfil: PerfilAlvo) => {
    setErroSalvar(null);
    setEdicao({
      perfil_alvo: perfil,
      data_inicio: '',
      data_fim: '',
      usuarios_ids: [],
      selecionarTodos: true,
    });
  };

  const iniciarEdicao = (prazo: CalendarioPrazo) => {
    setErroSalvar(null);
    setEdicao({
      id: prazo.id,
      perfil_alvo: prazo.perfil_alvo,
      data_inicio: prazo.data_inicio,
      data_fim: prazo.data_fim,
      usuarios_ids: prazo.usuarios_ids ?? [],
      selecionarTodos: (prazo.usuarios_ids ?? []).length === 0,
    });
  };

  const executarSalvar = async () => {
    if (!edicao) return;
    if (!edicao.data_inicio || !edicao.data_fim) {
      setErroSalvar('Preencha as datas de início e encerramento.');
      return;
    }
    if (edicao.data_fim < edicao.data_inicio) {
      setErroSalvar('A data final não pode ser anterior à data inicial.');
      return;
    }

    setSalvando(true);
    setErroSalvar(null);

    try {
      await salvarCalendarioPrazo({
        id: edicao.id,
        perfil_alvo: edicao.perfil_alvo,
        finalidade: edicao.perfil_alvo === 'docente' ? 'envio_docente' : edicao.perfil_alvo === 'pedagogia' ? 'analise_pedagogica' : 'analise_coordenacao',
        data_inicio: edicao.data_inicio,
        data_fim: edicao.data_fim,
        usuarios_ids: edicao.selecionarTodos ? [] : edicao.usuarios_ids,
      });
      setEdicao(null);
      await carregar();
    } catch (e) {
      setErroSalvar(mensagemDeErro(e, 'Não foi possível salvar o período.'));
    } finally {
      setSalvando(false);
    }
  };

  const executarDesativacao = async () => {
    if (!exclusao) return;
    setDesativando(true);
    setErroDesativar(null);
    try {
      await desativarCalendarioPrazo(exclusao.id);
      setExclusao(null);
      await carregar();
    } catch (e) {
      setErroDesativar(mensagemDeErro(e, 'Não foi possível desativar o período.'));
    } finally {
      setDesativando(false);
    }
  };

  const prazosAtivos = useMemo(() => prazos.filter((p) => p.ativo), [prazos]);

  const toggleTodos = (perfil: PerfilAlvo, checked: boolean) => {
    if (!edicao || edicao.perfil_alvo !== perfil) return;
    if (checked) {
      setEdicao({ ...edicao, selecionarTodos: true, usuarios_ids: [] });
    } else {
      setEdicao({ ...edicao, selecionarTodos: false });
    }
  };

  const toggleUsuario = (usuarioId: string, checked: boolean) => {
    if (!edicao) return;
    setEdicao({
      ...edicao,
      selecionarTodos: false,
      usuarios_ids: checked
        ? [...edicao.usuarios_ids, usuarioId]
        : edicao.usuarios_ids.filter((id) => id !== usuarioId),
    });
  };

  return (
    <section className="animate-fade-in">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Configuração de prazos</h1>
        <p className="mt-2 text-sm text-slate-500">
          Defina períodos por data para docentes, coordenadores e pedagogia. Apenas data de início e data final.
        </p>
      </div>

      {!podeGerenciar && (
        <div className={`${CARD} mt-6 p-6 text-center`}>
          <p className="text-sm text-slate-500">
            Você tem acesso apenas à visualização dos períodos. A configuração está disponível para administradores, coordenação técnica e pedagogia.
          </p>
        </div>
      )}

      {carregando && (
        <div className="mt-10 flex items-center justify-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
        </div>
      )}

      {erro && <p className="mt-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</p>}

      {!carregando && !erro && (
        <>
          {/* Três blocos de configuração */}
          <div className="mt-6 space-y-6">
            {SECOES.map((secao) => {
              const prazosSecao = prazosAtivos.filter((p) => p.perfil_alvo === secao.perfil);
              const usuariosSecao = usuariosPorPerfil[secao.perfil];
              return (
                <div key={secao.perfil} className={`${CARD} overflow-hidden`}>
                  <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-5 py-3">
                    <div>
                      <h2 className="text-base font-semibold text-slate-900">{secao.titulo}</h2>
                      <p className="text-xs text-slate-500">
                        {usuariosSecao.length} {secao.plural} cadastrados
                      </p>
                    </div>
                    {podeGerenciar && (
                      <button type="button" onClick={() => iniciarNovo(secao.perfil)} className={BTN_SECONDARY}>
                        <Plus className="h-4 w-4" />
                        Novo período
                      </button>
                    )}
                  </div>

                  <div className="p-5">
                    {prazosSecao.length === 0 ? (
                      <p className="py-6 text-center text-sm text-slate-500">
                        Nenhum período cadastrado para {secao.titulo.toLowerCase()}.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {prazosSecao.map((prazo) => {
                          const situacao = situacaoPeriodo(prazo);
                          return (
                            <div key={prazo.id} className="flex flex-col gap-3 rounded-lg border border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-sm font-medium text-slate-900">
                                    {formatarData(prazo.data_inicio)} a {formatarData(prazo.data_fim)}
                                  </span>
                                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${SITUACAO_STYLE[situacao]}`}>
                                    {SITUACAO_LABEL[situacao]}
                                  </span>
                                </div>
                                <p className="mt-1 text-xs text-slate-500">
                                  {nomesUsuarios(prazo.usuarios_ids ?? [])}
                                </p>
                              </div>
                              {podeGerenciar && (
                                <div className="flex items-center gap-1">
                                  <button type="button" onClick={() => iniciarEdicao(prazo)} className={BTN_SECONDARY} title="Editar período">
                                    <Pencil className="h-4 w-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => { setErroDesativar(null); setExclusao(prazo); }}
                                    className={`${BTN_DANGER} px-3`}
                                    title="Desativar período"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Tabela completa de configurações */}
          <div className="mt-8">
            <h2 className="mb-3 text-lg font-semibold text-slate-900">Períodos cadastrados</h2>
            {prazos.length === 0 ? (
              <div className={`${CARD} p-8 text-center`}>
                <CalendarDays className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-3 text-sm text-slate-500">Nenhum período cadastrado ainda.</p>
              </div>
            ) : (
              <div className={`${CARD} overflow-x-auto`}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                      <th className="px-4 py-3 font-medium">Grupo</th>
                      <th className="px-4 py-3 font-medium">Usuários</th>
                      <th className="px-4 py-3 font-medium">Data inicial</th>
                      <th className="px-4 py-3 font-medium">Data final</th>
                      <th className="px-4 py-3 font-medium">Situação</th>
                      <th className="px-4 py-3 font-medium">Responsável</th>
                      <th className="px-4 py-3 font-medium">Última alteração</th>
                      {podeGerenciar && <th className="px-4 py-3 font-medium text-right">Ação</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {prazos.map((prazo) => {
                      const situacao = situacaoPeriodo(prazo);
                      return (
                        <tr key={prazo.id} className={prazo.ativo ? '' : 'opacity-50'}>
                          <td className="px-4 py-3 font-medium text-slate-900">
                            {ROTULO_PERFIL_ALVO[prazo.perfil_alvo]}
                            {!prazo.ativo && <span className="ml-2 text-xs text-slate-400">(inativo)</span>}
                          </td>
                          <td className="max-w-[200px] truncate px-4 py-3 text-slate-600" title={nomesUsuarios(prazo.usuarios_ids ?? [])}>
                            {nomesUsuarios(prazo.usuarios_ids ?? [])}
                          </td>
                          <td className="px-4 py-3 text-slate-600">{formatarData(prazo.data_inicio)}</td>
                          <td className="px-4 py-3 text-slate-600">{formatarData(prazo.data_fim)}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${SITUACAO_STYLE[situacao]}`}>
                              {SITUACAO_LABEL[situacao]}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {prazo.criado_por ? (nomesResponsaveis[prazo.criado_por] ?? '—') : '—'}
                          </td>
                          <td className="px-4 py-3 text-slate-500">{formatarDataHora(prazo.atualizado_em)}</td>
                          {podeGerenciar && (
                            <td className="px-4 py-3 text-right">
                              <button type="button" onClick={() => iniciarEdicao(prazo)} className={BTN_SECONDARY} title="Editar período">
                                <Pencil className="h-4 w-4" />
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Modal de edição/criação */}
      {edicao && (
        <Modal
          titulo={`${edicao.id ? 'Editar período' : 'Novo período'} — ${ROTULO_PERFIL_ALVO[edicao.perfil_alvo]}`}
          onFechar={() => setEdicao(null)}
          largura="md"
          rodape={
            <>
              <button type="button" onClick={() => setEdicao(null)} className={BTN_SECONDARY}>Cancelar</button>
              <button
                type="button"
                onClick={executarSalvar}
                disabled={salvando}
                className={BTN_PRIMARY}
              >
                {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
                Salvar período
              </button>
            </>
          }
        >
          <div className="space-y-4">
            <div>
              <label className={LABEL}>Selecionar usuários</label>
              <label className="mb-2 flex cursor-pointer items-center gap-2 rounded-lg border border-teal-200 bg-teal-50/50 px-3 py-2.5 text-sm font-medium text-slate-800">
                <input
                  type="checkbox"
                  checked={edicao.selecionarTodos}
                  onChange={(e) => toggleTodos(edicao.perfil_alvo, e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                />
                Todos os {SECOES.find((s) => s.perfil === edicao.perfil_alvo)?.plural ?? 'usuários'}
              </label>
              {!edicao.selecionarTodos && (
                <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 p-2">
                  {usuariosPorPerfil[edicao.perfil_alvo].map((u) => {
                    const selecionado = edicao.usuarios_ids.includes(u.id);
                    return (
                      <label key={u.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-slate-50">
                        <input
                          type="checkbox"
                          checked={selecionado}
                          onChange={(e) => toggleUsuario(u.id, e.target.checked)}
                          className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                        />
                        <span className="text-slate-700">{u.nome}</span>
                      </label>
                    );
                  })}
                  {usuariosPorPerfil[edicao.perfil_alvo].length === 0 && (
                    <p className="px-2 py-1.5 text-xs text-slate-400">Nenhum usuário cadastrado neste perfil.</p>
                  )}
                </div>
              )}
              {edicao.selecionarTodos && (
                <p className="text-xs text-slate-500">
                  A configuração se aplica a todos os usuários deste grupo, incluindo novos cadastros.
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={LABEL}>Data de início</label>
                <input
                  type="date"
                  value={edicao.data_inicio}
                  onChange={(e) => setEdicao({ ...edicao, data_inicio: e.target.value })}
                  className={INPUT}
                />
              </div>
              <div>
                <label className={LABEL}>Data final</label>
                <input
                  type="date"
                  value={edicao.data_fim}
                  min={edicao.data_inicio || undefined}
                  onChange={(e) => setEdicao({ ...edicao, data_fim: e.target.value })}
                  className={INPUT}
                />
              </div>
            </div>

            <p className="text-xs text-slate-500">
              A data final é inclusiva: no dia da data final, o usuário ainda está dentro do prazo.
            </p>

            {erroSalvar && <p className="text-sm text-red-600">{erroSalvar}</p>}
          </div>
        </Modal>
      )}

      {/* Confirmação de desativação */}
      {exclusao && (
        <Modal
          titulo="Desativar período?"
          onFechar={() => setExclusao(null)}
          largura="sm"
          rodape={
            <>
              <button type="button" onClick={() => setExclusao(null)} className={BTN_SECONDARY}>Cancelar</button>
              <button type="button" onClick={executarDesativacao} disabled={desativando} className={BTN_DANGER}>
                {desativando && <Loader2 className="h-4 w-4 animate-spin" />}
                Desativar
              </button>
            </>
          }
        >
          <p className="text-sm leading-relaxed text-slate-600">
            O período de {formatarData(exclusao.data_inicio)} a {formatarData(exclusao.data_fim)} será desativado.
            O histórico será preservado para consulta.
          </p>
          {erroDesativar && <p className="mt-3 text-sm text-red-600">{erroDesativar}</p>}
        </Modal>
      )}
    </section>
  );
}
