import { Download, History } from 'lucide-react';
import { Modal } from '@/components/Modal';
import { BTN_SECONDARY } from '@/components/ui';
import { gerarPdfHistorico } from '@/lib/pdf-historico';
import { PERFIL_LABEL, formatarDataHora, type InteracaoPlano, type Plano } from '@/lib/domain';

type HistoricoPlanoModalProps = {
  plano: Plano;
  interacoes: InteracaoPlano[];
  onFechar: () => void;
};

const ROTULOS: Record<InteracaoPlano['tipo'], string> = {
  envio_docente: 'Plano enviado pelo docente',
  recebimento_pedagogia: 'Recebido pela pedagogia',
  recebimento_coordenacao: 'Recebido pela coordenação',
  devolucao_pedagogia: 'Devolvido pela pedagogia',
  devolucao_coordenacao: 'Devolvido pela coordenação',
  reenvio_docente: 'Ajustes reenviados pelo docente',
  publicacao: 'Plano publicado',
  exclusao_plano: 'Plano excluído',
};

export function HistoricoPlanoModal({ plano, interacoes, onFechar }: HistoricoPlanoModalProps) {
  return (
    <Modal
      titulo="Histórico do plano"
      descricao={plano.titulo}
      onFechar={onFechar}
      largura="lg"
      rodape={
        interacoes.length > 0 ? (
          <button type="button" onClick={() => gerarPdfHistorico(plano, interacoes)} className={BTN_SECONDARY}>
            <Download className="h-4 w-4" />
            Baixar histórico
          </button>
        ) : undefined
      }
    >
      {interacoes.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-slate-500">
          <History className="h-6 w-6 text-slate-400" />
          <p>Este plano ainda não possui interações registradas.</p>
        </div>
      ) : (
        <ol className="relative ml-2 border-l border-slate-200 pl-6">
          {interacoes.map((interacao) => (
            <li key={interacao.id} className="relative pb-6 last:pb-0">
              <span className="absolute -left-[31px] top-0 flex h-5 w-5 items-center justify-center rounded-full border-4 border-white bg-teal-600" />
              <p className="text-sm font-semibold text-slate-900">{ROTULOS[interacao.tipo]}</p>
              <p className="mt-1 text-xs text-slate-500">
                {interacao.autor?.nome ?? 'Usuário'} · {PERFIL_LABEL[interacao.autor_perfil]} · {formatarDataHora(interacao.criado_at)}
              </p>
              {interacao.mensagem && (
                <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm leading-relaxed text-amber-900">{interacao.mensagem}</p>
              )}
            </li>
          ))}
        </ol>
      )}
    </Modal>
  );
}
