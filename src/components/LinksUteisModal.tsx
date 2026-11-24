import { useEffect, useState } from 'react';
import { ExternalLink, FileDown, Loader2, Link2 } from 'lucide-react';
import { Modal } from '@/components/Modal';
import {
  listarLinksAtivos,
  obterUrlDownload,
  type LinkUtil,
} from '@/lib/links-uteis';
import { mensagemDeErro } from '@/lib/domain';

function iconeDoLink(nome: string) {
  switch (nome) {
    case 'file-down':
    case 'file':
      return FileDown;
    case 'external':
      return ExternalLink;
    case 'link':
    default:
      return Link2;
  }
}

export function LinksUteisModal({ onFechar }: { onFechar: () => void }) {
  const [links, setLinks] = useState<LinkUtil[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [baixandoId, setBaixandoId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const lista = await listarLinksAtivos();
        setLinks(lista);
      } catch (e) {
        setErro(mensagemDeErro(e, 'Não foi possível carregar os links úteis.'));
      } finally {
        setCarregando(false);
      }
    })();
  }, []);

  const abrirLink = async (link: LinkUtil) => {
    if (link.tipo === 'link_externo') {
      if (link.url) window.open(link.url, '_blank', 'noopener,noreferrer');
      return;
    }
    if (!link.url) return;
    setBaixandoId(link.id);
    try {
      let urlDownload: string;
      if (link.url.startsWith('http://') || link.url.startsWith('https://')) {
        urlDownload = link.url;
      } else {
        urlDownload = await obterUrlDownload(link.url);
      }
      const a = document.createElement('a');
      a.href = urlDownload;
      a.download = link.titulo;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e) {
      setErro(mensagemDeErro(e, 'Não foi possível baixar o arquivo.'));
    } finally {
      setBaixandoId(null);
    }
  };

  return (
    <Modal titulo="Links Úteis" onFechar={onFechar} largura="xl">
      {carregando && (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
        </div>
      )}

      {erro && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</p>}

      {!carregando && !erro && links.length === 0 && (
        <p className="py-10 text-center text-sm text-slate-500">
          Nenhum link disponível no momento.
        </p>
      )}

      {!carregando && !erro && links.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {links.map((link) => {
            const Icone = iconeDoLink(link.icone);
            const baixando = baixandoId === link.id;
            return (
              <button
                key={link.id}
                type="button"
                onClick={() => abrirLink(link)}
                disabled={baixando}
                className="group flex flex-col items-start gap-2 rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-teal-300 hover:bg-teal-50/40 focus:outline-none focus-visible:ring-4 focus-visible:ring-teal-600/20 disabled:opacity-60"
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50 text-teal-700 transition group-hover:bg-teal-100">
                    <Icone className="h-5 w-5" />
                  </span>
                  {baixando && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">{link.titulo}</p>
                  {link.descricao && (
                    <p className="mt-0.5 text-xs text-slate-500">{link.descricao}</p>
                  )}
                </div>
                <span className="mt-1 text-xs font-medium text-teal-700">
                  {link.tipo === 'arquivo_download' ? 'Baixar arquivo' : 'Abrir link'}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
