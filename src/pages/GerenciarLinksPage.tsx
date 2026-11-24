import { useEffect, useState } from 'react';
import {
  ExternalLink,
  FileDown,
  Link2,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { Modal } from '@/components/Modal';
import { BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY, CARD, INPUT, LABEL } from '@/components/ui';
import {
  listarTodosLinks,
  salvarLink,
  excluirLink,
  fazerUploadArquivo,
  validarArquivoLink,
  EXTENSOES_PERMITIDAS_LINK,
  ROTULO_TIPO,
  type LinkUtil,
  type LinkUtilInput,
  type TipoLink,
} from '@/lib/links-uteis';
import { mensagemDeErro } from '@/lib/domain';

const ICONES_DISPONIVEIS = [
  { valor: 'link', rotulo: 'Link' },
  { valor: 'external', rotulo: 'Link externo' },
  { valor: 'file', rotulo: 'Arquivo' },
  { valor: 'file-down', rotulo: 'Download' },
];

type Edicao = {
  id?: string;
  titulo: string;
  descricao: string;
  url: string;
  tipo: TipoLink;
  icone: string;
  ordem: number;
  ativo: boolean;
  arquivo: File | null;
  urlOriginal: string | null;
};

function edicaoVazia(): Edicao {
  return {
    titulo: '',
    descricao: '',
    url: '',
    tipo: 'link_externo',
    icone: 'link',
    ordem: 0,
    ativo: true,
    arquivo: null,
    urlOriginal: null,
  };
}

function formatarData(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(iso));
}

export function GerenciarLinksPage() {
  const [links, setLinks] = useState<LinkUtil[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [edicao, setEdicao] = useState<Edicao | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erroSalvar, setErroSalvar] = useState<string | null>(null);
  const [exclusao, setExclusao] = useState<LinkUtil | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [erroExcluir, setErroExcluir] = useState<string | null>(null);

  const carregar = async () => {
    setErro(null);
    try {
      const lista = await listarTodosLinks();
      setLinks(lista);
    } catch (e) {
      setErro(mensagemDeErro(e, 'Não foi possível carregar os links úteis.'));
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregar();
  }, []);

  const iniciarNovo = () => {
    setErroSalvar(null);
    setEdicao(edicaoVazia());
  };

  const iniciarEdicao = (link: LinkUtil) => {
    setErroSalvar(null);
    setEdicao({
      id: link.id,
      titulo: link.titulo,
      descricao: link.descricao ?? '',
      url: link.url ?? '',
      tipo: link.tipo,
      icone: link.icone,
      ordem: link.ordem,
      ativo: link.ativo,
      arquivo: null,
      urlOriginal: link.url,
    });
  };

  const executarSalvar = async () => {
    if (!edicao) return;
    if (!edicao.titulo.trim()) {
      setErroSalvar('O título é obrigatório.');
      return;
    }
    if (edicao.tipo === 'link_externo' && !edicao.url.trim()) {
      setErroSalvar('A URL é obrigatória para links externos.');
      return;
    }
    if (edicao.tipo === 'arquivo_download' && !edicao.url && !edicao.arquivo) {
      setErroSalvar('Selecione um arquivo para upload.');
      return;
    }

    setSalvando(true);
    setErroSalvar(null);

    try {
      let urlFinal = edicao.url || null;

      if (edicao.tipo === 'arquivo_download' && edicao.arquivo) {
        urlFinal = await fazerUploadArquivo(edicao.arquivo);
      }

      const input: LinkUtilInput = {
        id: edicao.id,
        titulo: edicao.titulo.trim(),
        descricao: edicao.descricao.trim() || null,
        url: urlFinal,
        tipo: edicao.tipo,
        icone: edicao.icone,
        ordem: edicao.ordem,
        ativo: edicao.ativo,
      };

      await salvarLink(input);
      setEdicao(null);
      await carregar();
    } catch (e) {
      setErroSalvar(mensagemDeErro(e, 'Não foi possível salvar o link.'));
    } finally {
      setSalvando(false);
    }
  };

  const executarExclusao = async () => {
    if (!exclusao) return;
    setExcluindo(true);
    setErroExcluir(null);
    try {
      await excluirLink(exclusao.id);
      setExclusao(null);
      await carregar();
    } catch (e) {
      setErroExcluir(mensagemDeErro(e, 'Não foi possível excluir o link.'));
    } finally {
      setExcluindo(false);
    }
  };

  return (
    <section className="animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Gerenciar Links Úteis</h1>
          <p className="mt-2 text-sm text-slate-500">
            Cadastre e gerencie os links de apoio exibidos para os docentes.
          </p>
        </div>
        <button type="button" onClick={iniciarNovo} className={BTN_PRIMARY}>
          <Plus className="h-4 w-4" />
          Novo link
        </button>
      </div>

      {carregando && (
        <div className="mt-10 flex items-center justify-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
        </div>
      )}

      {erro && <p className="mt-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</p>}

      {!carregando && !erro && (
        <div className="mt-6">
          {links.length === 0 ? (
            <div className={`${CARD} p-8 text-center`}>
              <Link2 className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-3 text-sm text-slate-500">Nenhum link cadastrado ainda.</p>
            </div>
          ) : (
            <div className={`${CARD} overflow-x-auto`}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                    <th className="px-4 py-3 font-medium">Título</th>
                    <th className="px-4 py-3 font-medium">Tipo</th>
                    <th className="px-4 py-3 font-medium">Ordem</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Atualizado</th>
                    <th className="px-4 py-3 font-medium text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {links.map((link) => (
                    <tr key={link.id} className={link.ativo ? '' : 'opacity-50'}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{link.titulo}</div>
                        {link.descricao && (
                          <div className="text-xs text-slate-500">{link.descricao}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{ROTULO_TIPO[link.tipo]}</td>
                      <td className="px-4 py-3 text-slate-600">{link.ordem}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
                            link.ativo
                              ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
                              : 'bg-slate-100 text-slate-500 ring-slate-500/20'
                          }`}
                        >
                          {link.ativo ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500">{formatarData(link.atualizado_em)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => iniciarEdicao(link)}
                            className={BTN_SECONDARY}
                            title="Editar link"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setErroExcluir(null);
                              setExclusao(link);
                            }}
                            className={`${BTN_DANGER} px-3`}
                            title="Excluir link"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modal de edição/criação */}
      {edicao && (
        <Modal
          titulo={edicao.id ? 'Editar link' : 'Novo link'}
          onFechar={() => setEdicao(null)}
          largura="md"
          rodape={
            <>
              <button type="button" onClick={() => setEdicao(null)} className={BTN_SECONDARY}>
                Cancelar
              </button>
              <button type="button" onClick={executarSalvar} disabled={salvando} className={BTN_PRIMARY}>
                {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
                Salvar link
              </button>
            </>
          }
        >
          <div className="space-y-4">
            <div>
              <label className={LABEL}>Título</label>
              <input
                type="text"
                value={edicao.titulo}
                onChange={(e) => setEdicao({ ...edicao, titulo: e.target.value })}
                className={INPUT}
                placeholder="Ex: MSEP — Metodologia SENAI"
              />
            </div>

            <div>
              <label className={LABEL}>Descrição (opcional)</label>
              <input
                type="text"
                value={edicao.descricao}
                onChange={(e) => setEdicao({ ...edicao, descricao: e.target.value })}
                className={INPUT}
                placeholder="Breve descrição exibida no card"
              />
            </div>

            <div>
              <label className={LABEL}>Tipo de recurso</label>
              <select
                value={edicao.tipo}
                onChange={(e) => setEdicao({ ...edicao, tipo: e.target.value as TipoLink })}
                className={INPUT}
              >
                <option value="link_externo">Link externo (URL)</option>
                <option value="arquivo_download">Arquivo para download</option>
              </select>
            </div>

            {edicao.tipo === 'link_externo' ? (
              <div>
                <label className={LABEL}>URL</label>
                <input
                  type="url"
                  value={edicao.url}
                  onChange={(e) => setEdicao({ ...edicao, url: e.target.value })}
                  className={INPUT}
                  placeholder="https://..."
                />
              </div>
            ) : (
              <div>
                <label className={LABEL}>Arquivo</label>
                {edicao.urlOriginal && !edicao.arquivo && (
                  <p className="mb-2 text-xs text-slate-500">
                    Arquivo atual: {edicao.urlOriginal.split('/').pop() ?? edicao.urlOriginal}
                  </p>
                )}
                <input
                  type="file"
                  accept={EXTENSOES_PERMITIDAS_LINK.join(',')}
                  onChange={(e) => {
                    const arquivo = e.target.files?.[0] ?? null;
                    setErroSalvar(arquivo ? validarArquivoLink(arquivo) : null);
                    setEdicao({ ...edicao, arquivo });
                  }}
                  className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-teal-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-teal-700 hover:file:bg-teal-100"
                />
                <p className="mt-1.5 text-xs text-slate-500">
                  PDF, Word, Excel, PowerPoint, OpenDocument, CSV, TXT, PNG ou JPG, com até 10 MB.
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={LABEL}>Ícone</label>
                <select
                  value={edicao.icone}
                  onChange={(e) => setEdicao({ ...edicao, icone: e.target.value })}
                  className={INPUT}
                >
                  {ICONES_DISPONIVEIS.map((op) => (
                    <option key={op.valor} value={op.valor}>
                      {op.rotulo}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={LABEL}>Ordem de exibição</label>
                <input
                  type="number"
                  min={0}
                  value={edicao.ordem}
                  onChange={(e) => setEdicao({ ...edicao, ordem: parseInt(e.target.value, 10) || 0 })}
                  className={INPUT}
                />
              </div>
            </div>

            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={edicao.ativo}
                onChange={(e) => setEdicao({ ...edicao, ativo: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
              />
              <span className="text-sm text-slate-700">Link ativo (visível para docentes)</span>
            </label>

            {erroSalvar && <p className="text-sm text-red-600">{erroSalvar}</p>}
          </div>
        </Modal>
      )}

      {/* Confirmação de exclusão */}
      {exclusao && (
        <Modal
          titulo="Excluir link?"
          onFechar={() => setExclusao(null)}
          largura="sm"
          rodape={
            <>
              <button type="button" onClick={() => setExclusao(null)} className={BTN_SECONDARY}>
                Cancelar
              </button>
              <button type="button" onClick={executarExclusao} disabled={excluindo} className={BTN_DANGER}>
                {excluindo && <Loader2 className="h-4 w-4 animate-spin" />}
                Excluir
              </button>
            </>
          }
        >
          <p className="text-sm leading-relaxed text-slate-600">
            O link "{exclusao.titulo}" será removido permanentemente.
          </p>
          {erroExcluir && <p className="mt-3 text-sm text-red-600">{erroExcluir}</p>}
        </Modal>
      )}
    </section>
  );
}
