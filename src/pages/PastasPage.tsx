import { useEffect, useMemo, useState } from 'react';
import { FolderPlus, FolderOpen, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { ConfirmModal } from '@/components/ConfirmModal';
import { PastaModal } from '@/components/admin/PastaModal';
import { BTN_ICON, BTN_PRIMARY, CARD } from '@/components/ui';
import { excluirPasta, listarPastas } from '@/lib/pastas';
import { listarUsuarios } from '@/lib/usuarios';
import { ordenarArvore } from '@/lib/folders';
import { mensagemDeErro, type Pasta, type Usuario } from '@/lib/domain';

type Edicao = { pasta?: Pasta; paiPadrao: string | null };

export function PastasPage() {
  const [pastas, setPastas] = useState<Pasta[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [edicao, setEdicao] = useState<Edicao | null>(null);
  const [exclusao, setExclusao] = useState<Pasta | null>(null);
  const [processando, setProcessando] = useState(false);
  const [erroExclusao, setErroExclusao] = useState<string | null>(null);

  const carregar = async () => {
    setErroCarga(null);
    try {
      const [listaPastas, listaUsuarios] = await Promise.all([listarPastas(), listarUsuarios()]);
      setPastas(listaPastas);
      setUsuarios(listaUsuarios);
    } catch (erro) {
      setErroCarga(mensagemDeErro(erro, 'Não foi possível carregar as pastas.'));
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregar();
  }, []);

  const arvore = useMemo(() => ordenarArvore(pastas), [pastas]);

  const vinculados = (pastaId: string) =>
    usuarios.filter(
      (usuario) =>
        usuario.pasta_id === pastaId || usuario.pasta_ids.includes(pastaId),
    );

  const confirmarExclusao = async () => {
    if (!exclusao) return;
    setProcessando(true);
    setErroExclusao(null);
    try {
      await excluirPasta(exclusao.id);
      setExclusao(null);
      await carregar();
    } catch (erro) {
      setErroExclusao(mensagemDeErro(erro, 'Não foi possível excluir a pasta.'));
    } finally {
      setProcessando(false);
    }
  };

  return (
    <section className="animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Pastas</h1>
          <p className="mt-2 text-sm text-slate-500">
            Organize as pastas e subpastas e vincule cada usuário à sua pasta.
          </p>
        </div>
        <button type="button" onClick={() => setEdicao({ paiPadrao: null })} className={BTN_PRIMARY}>
          <FolderPlus className="h-4 w-4" />
          Nova pasta
        </button>
      </div>

      <div className={`${CARD} mt-8 overflow-hidden`}>
        {carregando && (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando pastas...
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

        {!carregando && !erroCarga && arvore.length === 0 && (
          <div className="px-6 py-14 text-center">
            <p className="text-sm font-medium text-slate-700">Nenhuma pasta criada ainda.</p>
            <p className="mt-1 text-sm text-slate-500">Crie a primeira pasta para começar a organizar os planos.</p>
          </div>
        )}

        {!carregando && !erroCarga && arvore.length > 0 && (
          <ul className="divide-y divide-slate-100">
            {arvore.map((pasta) => {
              const pessoas = vinculados(pasta.id);
              return (
                <li
                  key={pasta.id}
                  style={{ paddingLeft: `${20 + pasta.profundidade * 28}px` }}
                  className="group flex flex-col gap-3 py-4 pr-5 transition hover:bg-slate-50/70 sm:flex-row sm:items-center"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
                      <FolderOpen className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">{pasta.nome}</p>
                      <p className="text-xs text-slate-500">
                        {pessoas.length === 0
                          ? 'Nenhum usuário vinculado'
                          : `${pessoas.length} ${pessoas.length === 1 ? 'usuário vinculado' : 'usuários vinculados'}: ${pessoas
                              .map((p) => p.nome)
                              .join(', ')}`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 opacity-100 transition sm:opacity-60 sm:group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => setEdicao({ paiPadrao: pasta.id })}
                      className={BTN_ICON}
                      aria-label="Nova subpasta"
                      title="Nova subpasta"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEdicao({ pasta, paiPadrao: pasta.pai_id })}
                      className={BTN_ICON}
                      aria-label="Editar pasta"
                      title="Editar pasta"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setErroExclusao(null);
                        setExclusao(pasta);
                      }}
                      className={`${BTN_ICON} hover:bg-red-50 hover:text-red-600`}
                      aria-label="Excluir pasta"
                      title="Excluir pasta"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {edicao && (
        <PastaModal
          pasta={edicao.pasta}
          paiPadrao={edicao.paiPadrao}
          pastas={pastas}
          onSalvo={() => {
            setEdicao(null);
            carregar();
          }}
          onFechar={() => setEdicao(null)}
        />
      )}

      {exclusao && (
        <ConfirmModal
          titulo="Excluir pasta?"
          mensagem={`A pasta "${exclusao.nome}" e as subpastas dentro dela serão removidas. Os usuários vinculados perderão o vínculo. Pastas com planos de aula não podem ser excluídas.`}
          textoConfirmar="Excluir pasta"
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
