import { useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { Modal } from '@/components/Modal';
import { BTN_PRIMARY, BTN_SECONDARY, LABEL } from '@/components/ui';

type DecidirPlanoModalProps = {
  aprovar: boolean;
  titulo: string;
  mensagem: string;
  textoConfirmar: string;
  processando: boolean;
  erro: string | null;
  onConfirmar: (orientacao: string) => void;
  onFechar: () => void;
};

export function DecidirPlanoModal({
  aprovar,
  titulo,
  mensagem,
  textoConfirmar,
  processando,
  erro,
  onConfirmar,
  onFechar,
}: DecidirPlanoModalProps) {
  const [orientacao, setOrientacao] = useState('');
  const [erroCampo, setErroCampo] = useState<string | null>(null);

  const confirmar = (evento: FormEvent) => {
    evento.preventDefault();
    if (!aprovar && orientacao.trim().length < 3) {
      setErroCampo('Escreva uma orientação para o docente antes de devolver o plano.');
      return;
    }
    onConfirmar(orientacao.trim());
  };

  return (
    <Modal
      titulo={titulo}
      onFechar={onFechar}
      largura="lg"
      rodape={
        <form id="form-decidir" onSubmit={confirmar} className="flex flex-wrap justify-end gap-3">
          <button type="button" onClick={onFechar} disabled={processando} className={BTN_SECONDARY}>
            Cancelar
          </button>
          <button type="submit" disabled={processando} className={BTN_PRIMARY}>
            {processando && <Loader2 className="h-4 w-4 animate-spin" />}
            {textoConfirmar}
          </button>
        </form>
      }
    >
      <div>
        <p className="text-sm leading-relaxed text-slate-600">{mensagem}</p>
        {!aprovar && (
          <div className="mt-5">
            <label htmlFor="orientacao-plano" className={LABEL}>
              Orientação para o docente
            </label>
            <textarea
              id="orientacao-plano"
              form="form-decidir"
              required
              minLength={3}
              rows={5}
              value={orientacao}
              onChange={(evento) => {
                setOrientacao(evento.target.value);
                setErroCampo(null);
              }}
              placeholder="Descreva o que precisa ser ajustado no plano..."
              className="w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-teal-600 focus:outline-none focus:ring-4 focus:ring-teal-600/15"
            />
            <p className="mt-1.5 text-xs text-slate-500">Esta orientação ficará registrada no histórico do plano.</p>
          </div>
        )}
        {(erroCampo || erro) && (
          <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {erroCampo ?? erro}
          </p>
        )}
      </div>
    </Modal>
  );
}
