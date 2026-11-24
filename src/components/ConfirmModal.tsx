import { Loader2 } from 'lucide-react';
import { Modal } from '@/components/Modal';
import { BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY } from '@/components/ui';

type ConfirmModalProps = {
  titulo: string;
  mensagem: string;
  textoConfirmar: string;
  perigo?: boolean;
  processando: boolean;
  erro: string | null;
  onConfirmar: () => void;
  onFechar: () => void;
};

export function ConfirmModal({
  titulo,
  mensagem,
  textoConfirmar,
  perigo = false,
  processando,
  erro,
  onConfirmar,
  onFechar,
}: ConfirmModalProps) {
  return (
    <Modal
      titulo={titulo}
      onFechar={onFechar}
      rodape={
        <>
          <button type="button" onClick={onFechar} disabled={processando} className={BTN_SECONDARY}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirmar}
            disabled={processando}
            className={perigo ? BTN_DANGER : BTN_PRIMARY}
          >
            {processando && <Loader2 className="h-4 w-4 animate-spin" />}
            {textoConfirmar}
          </button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-slate-600">{mensagem}</p>
      {erro && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {erro}
        </p>
      )}
    </Modal>
  );
}
