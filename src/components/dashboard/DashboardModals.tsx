import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Modal } from '@/components/Modal';
import { BTN_SECONDARY, CARD } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { PERFIL_LABEL } from '@/lib/domain';
import type { InteracaoPlano } from '@/lib/domain';
import type { ItemTramitacao } from '@/lib/dashboard';

const ROTULOS_INTERACAO: Record<string, string> = {
  envio_docente: 'Envio do docente',
  recebimento_pedagogia: 'Recebido pela pedagogia',
  recebimento_coordenacao: 'Encaminhado à coordenação',
  devolucao_pedagogia: 'Devolvido pela pedagogia',
  devolucao_coordenacao: 'Devolvido pela coordenação',
  reenvio_docente: 'Reenvio do docente',
  publicacao: 'Plano publicado',
  exclusao_plano: 'Plano excluído',
};

function formatarDataBrasilia(data: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(data));
}

const ROTULOS_STATUS: Record<string, string> = {
  validacao_pedagogica: 'Aguardando pedagogia',
  validacao_coordenacao: 'Aguardando coordenação',
  devolvido_docente: 'Devolvido',
  publicado: 'Publicado',
};

export function DetalhePlanoModal({ planoId, onFechar }: { planoId: string; onFechar: () => void }) {
  const [interacoes, setInteracoes] = useState<InteracaoPlano[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from('plano_interacoes')
          .select('id, plano_id, autor_id, autor_perfil, tipo, mensagem, criado_at, autor:profiles!autor_id(nome)')
          .eq('plano_id', planoId)
          .order('criado_at', { ascending: true });
        if (error) throw error;
        setInteracoes((data ?? []) as unknown as InteracaoPlano[]);
      } catch {
        setErro('Não foi possível carregar o histórico.');
      } finally {
        setCarregando(false);
      }
    })();
  }, [planoId]);

  return (
    <Modal
      titulo="Histórico de movimentações"
      onFechar={onFechar}
      largura="xl"
      rodape={
        <button type="button" onClick={onFechar} className={BTN_SECONDARY}>Fechar</button>
      }
    >
      {carregando && (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando histórico...
        </div>
      )}
      {erro && <p className="text-sm text-red-600">{erro}</p>}

      {!carregando && !erro && interacoes.length === 0 && (
        <p className="py-8 text-center text-sm text-slate-500">Este plano ainda não possui movimentações registradas.</p>
      )}

      {!carregando && !erro && interacoes.length > 0 && (
        <ol className="relative space-y-4 before:absolute before:left-3 before:top-2 before:h-[calc(100%-1rem)] before:w-px before:bg-slate-200">
          {interacoes.map((int, idx) => (
            <li key={int.id} className="relative pl-10">
              <span className={`absolute left-0 top-1 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                idx === 0 ? 'bg-teal-600 text-white' : 'bg-slate-200 text-slate-600'
              }`}>{idx + 1}</span>
              <div className={`${CARD} p-3`}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-900">{ROTULOS_INTERACAO[int.tipo] ?? int.tipo}</span>
                  <span className="text-xs text-slate-500">
                    {formatarDataBrasilia(int.criado_at)}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                  <span>{int.autor?.nome ?? 'Usuário'}</span>
                  <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
                    {PERFIL_LABEL[int.autor_perfil]}
                  </span>
                </div>
                {int.mensagem && (
                  <p className="mt-2 text-sm text-slate-600">{int.mensagem}</p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Modal>
  );
}

export function DetalheIndicadorModal({
  titulo,
  planos,
  onFechar,
  onVerDetalhe,
}: {
  titulo: string;
  planos: ItemTramitacao[];
  onFechar: () => void;
  onVerDetalhe: (id: string) => void;
}) {
  return (
    <Modal
      titulo={titulo}
      descricao={`${planos.length} plano${planos.length === 1 ? '' : 's'} compondo este indicador.`}
      onFechar={onFechar}
      largura="3xl"
      rodape={
        <button type="button" onClick={onFechar} className={BTN_SECONDARY}>Fechar</button>
      }
    >
      {planos.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-500">Nenhum plano compõe este indicador com os filtros atuais.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-100 text-left text-xs text-slate-500"><th className="px-3 py-2">Plano</th><th className="px-3 py-2">Curso</th><th className="px-3 py-2">Docente</th><th className="px-3 py-2">Status</th><th className="px-3 py-2" /></tr></thead>
            <tbody className="divide-y divide-slate-50">
              {planos.map((plano) => (
                <tr key={plano.id} className="hover:bg-slate-50">
                  <td className="max-w-[260px] truncate px-3 py-2 font-medium text-slate-900">{plano.titulo}</td>
                  <td className="px-3 py-2 text-slate-600">{plano.curso_nome}</td>
                  <td className="px-3 py-2 text-slate-600">{plano.docente_nome}</td>
                  <td className="px-3 py-2 text-slate-600">{ROTULOS_STATUS[plano.status] ?? plano.status}</td>
                  <td className="px-3 py-2 text-right"><button type="button" onClick={() => onVerDetalhe(plano.id)} className={BTN_SECONDARY}>Histórico</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

export { ROTULOS_STATUS };
