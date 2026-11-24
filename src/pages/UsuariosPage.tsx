import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Loader2, Pencil, Search, Trash2, UserPlus, FileText, Upload, Download, Users, X } from 'lucide-react';
import { ConfirmModal } from '@/components/ConfirmModal';
import { Modal } from '@/components/Modal';
import { BTN_ICON, BTN_PRIMARY, BTN_SECONDARY, CARD, INPUT, LABEL } from '@/components/ui';
import { listarPastas } from '@/lib/pastas';
import { chamarAdminUsuarios, listarUsuarios } from '@/lib/usuarios';
import { ordenarArvore, type PastaComProfundidade } from '@/lib/folders';
import { PERFIL_LABEL, PERFIL_STYLE, mensagemDeErro, type Perfil, type Pasta, type Usuario } from '@/lib/domain';
import { RelatorioAcessosModal } from '@/components/RelatorioAcessosModal';
import { ImportarUsuariosModal } from '@/components/ImportarUsuariosModal';
import { ExportarUsuariosModal } from '@/components/ExportarUsuariosModal';
import { mensagemDeSenhaFraca } from '@/lib/senha';

const PERFIS: Perfil[] = ['docente', 'pedagogia', 'coordenacao', 'admin'];
const MIN_SENHA = 8;

function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function alternarId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((atual) => atual !== id) : [...ids, id];
}

type UsuarioModalProps = {
  usuario?: Usuario;
  pastas: PastaComProfundidade[];
  onSalvo: () => void;
  onFechar: () => void;
};

function SelecaoMultiplaPastas({
  pastas,
  selecionadas,
  onToggle,
  obrigatorio,
}: {
  pastas: PastaComProfundidade[];
  selecionadas: string[];
  onToggle: (id: string) => void;
  obrigatorio: boolean;
}) {
  const [busca, setBusca] = useState('');
  const filtradas = useMemo(() => {
    if (!busca.trim()) return pastas;
    const termo = busca.toLowerCase();
    return pastas.filter((pasta) => pasta.nome.toLowerCase().includes(termo));
  }, [pastas, busca]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Pesquisar pasta pelo nome..."
          className={`${INPUT} pl-9`}
        />
      </div>
      {obrigatorio && (
        <p className="text-xs text-slate-500">Selecione pelo menos uma pasta. O docente só poderá enviar planos para as pastas marcadas.</p>
      )}
      {filtradas.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-sm text-slate-500">
          {busca ? 'Nenhuma pasta encontrada.' : 'Cadastre pastas antes de vinculá-las.'}
        </p>
      ) : (
<div className="max-h-32 space-y-0.5 overflow-y-auto rounded-lg border border-slate-200 p-2">

      
          {filtradas.map((pasta) => (
            <label
              key={pasta.id}
              className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50"
              style={{ paddingLeft: `${8 + pasta.profundidade * 20}px` }}
            >
              <input
                type="checkbox"
                checked={selecionadas.includes(pasta.id)}
                onChange={() => onToggle(pasta.id)}
                className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
              />
              {pasta.nome}
            </label>
          ))}
        </div>
      )}
      {selecionadas.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selecionadas.map((id) => {
            const pasta = pastas.find((p) => p.id === id);
            if (!pasta) return null;
            return (
              <span key={id} className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-700">
                {pasta.nome}
                <button type="button" onClick={() => onToggle(id)} className="text-teal-500 hover:text-teal-900" aria-label={`Remover ${pasta.nome}`}>
                  ×
                </button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

function UsuarioModal({ usuario, pastas, onSalvo, onFechar }: UsuarioModalProps) {
  const [nome, setNome] = useState(usuario?.nome ?? '');
  const [email, setEmail] = useState(usuario?.email ?? '');
  const [perfil, setPerfil] = useState<Perfil>(usuario?.perfil ?? 'docente');
  const pastaId = usuario?.pasta_id ?? '';
  const [pastaIds, setPastaIds] = useState<string[]>(usuario?.pasta_ids ?? []);
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const exigeSenha = !usuario;
  const pastasMultiplas = perfil === 'docente' || perfil === 'pedagogia' || perfil === 'coordenacao';

  const salvar = async (evento: FormEvent) => {
    evento.preventDefault();
    setErro(null);
    if (perfil === 'docente' && pastaIds.length === 0 && !pastaId) {
      setErro('Vincule o docente a pelo menos uma pasta.');
      return;
    }
    if ((exigeSenha || senha) && senha.length < MIN_SENHA) {
      setErro(`A senha deve ter pelo menos ${MIN_SENHA} caracteres.`);
      return;
    }

    if (exigeSenha || senha) {
      const avisoSenha = mensagemDeSenhaFraca(senha);
      if (avisoSenha) {
        setErro(`Senha fraca: ${avisoSenha}`);
        return;
      }
    }

    setSalvando(true);
    try {
      await chamarAdminUsuarios({
        action: usuario ? 'update' : 'create',
        id: usuario?.id,
        nome: nome.trim(),
        email: email.trim(),
        perfil,
        pasta_id: perfil === 'docente' ? (pastaIds.length > 0 ? null : pastaId || null) : null,
        pasta_ids: pastasMultiplas ? pastaIds : [],
        senha: senha || undefined,
      });
      onSalvo();
    } catch (erroSalvar) {
      setErro(mensagemDeErro(erroSalvar, 'Não foi possível salvar o usuário.'));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal
  titulo={usuario ? 'Editar usuário' : 'Novo usuário'}
  descricao="Defina os dados de acesso e as pastas às quais o usuário está vinculado."
  onFechar={onFechar}
  largura="xl"
      rodape={
        <>
          <button type="button" onClick={onFechar} disabled={salvando} className={BTN_SECONDARY}>
            Cancelar
          </button>
          <button type="submit" form="form-usuario" disabled={salvando} className={BTN_PRIMARY}>
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar usuário
          </button>
        </>
      }
    >
      <form id="form-usuario" onSubmit={salvar} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="nome-usuario" className={LABEL}>
              Nome completo
            </label>
            <input id="nome-usuario" required value={nome} onChange={(e) => setNome(e.target.value)} className={INPUT} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="email-usuario" className={LABEL}>
              E-mail de acesso
            </label>
            <input
              id="email-usuario"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@escola.com"
              className={INPUT}
            />
          </div>
          <div>
            <label htmlFor="perfil-usuario" className={LABEL}>
              Perfil
            </label>
            <select id="perfil-usuario" value={perfil} onChange={(e) => setPerfil(e.target.value as Perfil)} className={INPUT}>
              {PERFIS.map((item) => (
                <option key={item} value={item}>
                  {PERFIL_LABEL[item]}
                </option>
              ))}
            </select>
          </div>
          {perfil === 'docente' && (
            <div className="sm:col-span-2">
              <p className={LABEL}>Pastas vinculadas</p>
              <SelecaoMultiplaPastas
                pastas={pastas}
                selecionadas={pastaIds}
                onToggle={(id) => setPastaIds((atuais) => alternarId(atuais, id))}
                obrigatorio
              />
            </div>
          )}
          {perfil !== 'docente' && pastasMultiplas && (
            <div className="sm:col-span-2">
              <p className={LABEL}>Pastas vinculadas</p>
              <p className="mb-2 text-xs text-slate-500">Sem nenhuma pasta marcada, o usuário vê todas as pastas.</p>
              <SelecaoMultiplaPastas
                pastas={pastas}
                selecionadas={pastaIds}
                onToggle={(id) => setPastaIds((atuais) => alternarId(atuais, id))}
                obrigatorio={false}
              />
            </div>
          )}
          <div className="sm:col-span-2">
            <label htmlFor="senha-usuario" className={LABEL}>
              {usuario ? 'Nova senha' : 'Senha inicial'}
            </label>
            <input
              id="senha-usuario"
              type="text"
              autoComplete="new-password"
              required={exigeSenha}
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder={usuario ? 'Deixe em branco para manter a senha atual' : 'Ex.: Lucas123!'}
              className={INPUT}
            />
            <p className="mt-1.5 text-xs text-slate-500">
              Use 8 ou mais caracteres, com letra maiúscula, minúscula, número e símbolo. A senha pode continuar fácil de lembrar.
            </p>
          </div>
        </div>

        {erro && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {erro}
          </p>
        )}
      </form>
    </Modal>
  );
}

export function UsuariosPage({ currentUserId, perfilAtual }: { currentUserId: string; perfilAtual: Perfil }) {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [pastas, setPastas] = useState<Pasta[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [edicao, setEdicao] = useState<Usuario | 'novo' | null>(null);
  const [exclusao, setExclusao] = useState<Usuario | null>(null);
  const [processando, setProcessando] = useState(false);
  const [erroExclusao, setErroExclusao] = useState<string | null>(null);
  const [relatorioAberto, setRelatorioAberto] = useState(false);
  const [importarAberto, setImportarAberto] = useState(false);
  const [exportarAberto, setExportarAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const [filtroPerfil, setFiltroPerfil] = useState<Perfil | 'todos'>('todos');

  const carregar = async () => {
    setErroCarga(null);
    try {
      const [listaUsuarios, listaPastas] = await Promise.all([listarUsuarios(), listarPastas()]);
      setUsuarios(listaUsuarios);
      setPastas(listaPastas);
    } catch (erro) {
      setErroCarga(mensagemDeErro(erro, 'Não foi possível carregar os usuários.'));
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregar();
  }, []);

  const arvore = useMemo(() => ordenarArvore(pastas), [pastas]);
  const nomeDaPasta = (pastaId: string | null) => pastas.find((p) => p.id === pastaId)?.nome ?? 'Sem pasta';
  const descricaoPastas = (usuario: Usuario) => {
    if (usuario.perfil === 'admin') return 'Todas as pastas';
    if (usuario.perfil === 'docente') {
      if (usuario.pasta_ids.length > 0) return usuario.pasta_ids.map(nomeDaPasta).join(', ');
      return nomeDaPasta(usuario.pasta_id);
    }
    if (usuario.pasta_ids.length === 0) return 'Todas as pastas';
    return usuario.pasta_ids.map(nomeDaPasta).join(', ');
  };

  const contagemPorPerfil = useMemo(() => {
    const contagem: Record<Perfil, number> = { docente: 0, pedagogia: 0, coordenacao: 0, admin: 0 };
    usuarios.forEach((usuario) => {
      contagem[usuario.perfil] += 1;
    });
    return contagem;
  }, [usuarios]);

  const usuariosFiltrados = useMemo(() => {
    const termo = normalizar(busca);
    return usuarios.filter((usuario) => {
      if (filtroPerfil !== 'todos' && usuario.perfil !== filtroPerfil) return false;
      if (!termo) return true;
      return normalizar(`${usuario.nome} ${usuario.email}`).includes(termo);
    });
  }, [usuarios, busca, filtroPerfil]);

  const filtrando = busca.trim() !== '' || filtroPerfil !== 'todos';

  const confirmarExclusao = async () => {
    if (!exclusao) return;
    setProcessando(true);
    setErroExclusao(null);
    try {
      await chamarAdminUsuarios({ action: 'delete', id: exclusao.id });
      setExclusao(null);
      await carregar();
    } catch (erro) {
      setErroExclusao(mensagemDeErro(erro, 'Não foi possível excluir o usuário.'));
    } finally {
      setProcessando(false);
    }
  };

  return (
    <section className="animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Usuários</h1>
          <p className="mt-2 text-sm text-slate-500">Crie acessos, defina senhas iniciais e vincule usuários às pastas necessárias.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {perfilAtual === 'admin' && (
            <button type="button" onClick={() => setRelatorioAberto(true)} className={BTN_SECONDARY}>
              <FileText className="h-4 w-4" />
              Gerar relatório
            </button>
          )}
          {perfilAtual === 'admin' && (
            <button type="button" onClick={() => setExportarAberto(true)} className={BTN_SECONDARY}>
              <Download className="h-4 w-4" />
              Exportar
            </button>
          )}
          {perfilAtual === 'admin' && (
            <button type="button" onClick={() => setImportarAberto(true)} className={BTN_SECONDARY}>
              <Upload className="h-4 w-4" />
              Importar
            </button>
          )}
          <button type="button" onClick={() => setEdicao('novo')} className={BTN_PRIMARY}>
            <UserPlus className="h-4 w-4" />
            Novo usuário
          </button>
        </div>
      </div>

      {!carregando && !erroCarga && usuarios.length > 0 && (
        <div className={`${CARD} mt-8 p-4 sm:p-5`}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
            <div className="flex items-center gap-3 lg:pr-5 lg:border-r lg:border-slate-100">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                <Users className="h-5 w-5" />
              </span>
              <div>
                <p className="text-2xl font-semibold leading-tight text-slate-900">{usuarios.length}</p>
                <p className="text-xs text-slate-500">{usuarios.length === 1 ? 'usuário cadastrado' : 'usuários cadastrados'}</p>
              </div>
            </div>

            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Pesquisar por nome ou e-mail..."
                aria-label="Pesquisar usuário"
                className={`${INPUT} pl-9 pr-9`}
              />
              {busca && (
                <button
                  type="button"
                  onClick={() => setBusca('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Limpar pesquisa"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Filtrar por perfil">
            {(['todos', ...PERFIS] as const).map((opcao) => {
              const ativo = filtroPerfil === opcao;
              const quantidade = opcao === 'todos' ? usuarios.length : contagemPorPerfil[opcao];
              return (
                <button
                  key={opcao}
                  type="button"
                  onClick={() => setFiltroPerfil(opcao)}
                  aria-pressed={ativo}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    ativo
                      ? 'border-teal-600 bg-teal-600 text-white'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {opcao === 'todos' ? 'Todos' : PERFIL_LABEL[opcao]}
                  <span className={`rounded-full px-1.5 py-0.5 text-[11px] ${ativo ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`}>
                    {quantidade}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className={`${CARD} ${usuarios.length > 0 && !carregando && !erroCarga ? 'mt-4' : 'mt-8'} overflow-hidden`}>
        {!carregando && !erroCarga && filtrando && usuarios.length > 0 && (
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/60 px-5 py-2.5 text-xs text-slate-500">
            <span>
              Mostrando <strong className="font-semibold text-slate-700">{usuariosFiltrados.length}</strong> de {usuarios.length} usuários
            </span>
            <button
              type="button"
              onClick={() => {
                setBusca('');
                setFiltroPerfil('todos');
              }}
              className="font-medium text-teal-700 hover:text-teal-900"
            >
              Limpar filtros
            </button>
          </div>
        )}

        {carregando && (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando usuários...
          </div>
        )}

        {!carregando && erroCarga && (
          <div className="flex flex-col items-center gap-4 px-6 py-14 text-center">
            <p className="text-sm text-slate-600">{erroCarga}</p>
            <button type="button" onClick={carregar} className={BTN_PRIMARY}>
              Tentar novamente
            </button>
          </div>
        )}

        {!carregando && !erroCarga && usuarios.length === 0 && (
          <div className="px-6 py-14 text-center">
            <p className="text-sm font-medium text-slate-700">Nenhum usuário cadastrado.</p>
          </div>
        )}

        {!carregando && !erroCarga && usuarios.length > 0 && usuariosFiltrados.length === 0 && (
          <div className="px-6 py-14 text-center">
            <p className="text-sm font-medium text-slate-700">Nenhum usuário encontrado.</p>
            <p className="mt-1 text-sm text-slate-500">Confira o nome ou e-mail digitado, ou mude o filtro de perfil.</p>
          </div>
        )}

        {!carregando && !erroCarga && usuariosFiltrados.length > 0 && (
          <ul className="divide-y divide-slate-100">
            {usuariosFiltrados.map((usuario) => (
              <li key={usuario.id} className="flex flex-col gap-3 px-5 py-4 transition hover:bg-slate-50/70 sm:flex-row sm:items-center">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-700">
                  {usuario.nome.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-900">
                    {usuario.nome}
                    {usuario.id === currentUserId && <span className="ml-2 text-xs font-normal text-slate-400">(você)</span>}
                  </p>
                  <p className="truncate text-sm text-slate-500">{usuario.email}</p>
                </div>
                <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                  <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${PERFIL_STYLE[usuario.perfil]}`}>
                    {PERFIL_LABEL[usuario.perfil]}
                  </span>
                  <span className="max-w-[200px] truncate text-xs text-slate-500">{descricaoPastas(usuario)}</span>
                  <button type="button" onClick={() => setEdicao(usuario)} className={BTN_ICON} aria-label="Editar usuário" title="Editar usuário">
                    <Pencil className="h-4 w-4" />
                  </button>
                  {usuario.id !== currentUserId && (
                    <button
                      type="button"
                      onClick={() => {
                        setErroExclusao(null);
                        setExclusao(usuario);
                      }}
                      className={`${BTN_ICON} hover:bg-red-50 hover:text-red-600`}
                      aria-label="Excluir usuário"
                      title="Excluir usuário"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {edicao && (
        <UsuarioModal
          usuario={edicao === 'novo' ? undefined : edicao}
          pastas={arvore}
          onSalvo={() => {
            setEdicao(null);
            carregar();
          }}
          onFechar={() => setEdicao(null)}
        />
      )}

      {relatorioAberto && <RelatorioAcessosModal onFechar={() => setRelatorioAberto(false)} />}

      {importarAberto && (
        <ImportarUsuariosModal
          onFechar={() => setImportarAberto(false)}
          onConcluido={carregar}
        />
      )}

      {exportarAberto && <ExportarUsuariosModal onFechar={() => setExportarAberto(false)} />}

      {exclusao && (
        <ConfirmModal
          titulo="Excluir usuário?"
          mensagem={`O acesso de ${exclusao.nome} será removido. Usuários com planos de aula enviados não podem ser excluídos.`}
          textoConfirmar="Excluir usuário"
          perigo
          processando={processando}
          erro={erroExclusao}
          onConfirmar={confirmarExclusao}
          onFechar={() => setExclusao(null)}
        />
      )}
    </section>
  );
}
