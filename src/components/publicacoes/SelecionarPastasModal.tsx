import { useState } from 'react';
import { Modal } from '@/components/Modal';
import { BTN_PRIMARY, BTN_SECONDARY } from '@/components/ui';
import type { PastaComProfundidade } from '@/lib/folders';

type SelecionarPastasModalProps = {
  pastas: PastaComProfundidade[];
  selecionadas: string[];
  onAplicar: (ids: string[]) => void;
  onFechar: () => void;
};

export function SelecionarPastasModal({ pastas, selecionadas, onAplicar, onFechar }: SelecionarPastasModalProps) {
  const [rascunho, setRascunho] = useState<string[]>(selecionadas);

  const alternar = (id: string) =>
    setRascunho((atuais) => (atuais.includes(id) ? atuais.filter((atual) => atual !== id) : [...atuais, id]));

  return (
    <Modal
      titulo="Pastas exibidas"
      descricao="Escolha quais pastas aparecem nas suas publicações. Você pode ver qualquer pasta do sistema."
      onFechar={onFechar}
      largura="lg"
      rodape={
        <>
          <button type="button" onClick={onFechar} className={BTN_SECONDARY}>
            Cancelar
          </button>
          <button type="button" onClick={() => onAplicar(rascunho)} className={BTN_PRIMARY}>
            Aplicar
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-slate-500">
            {rascunho.length} de {pastas.length} selecionadas
          </span>
          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => setRascunho(pastas.map((pasta) => pasta.id))}
              className="font-medium text-teal-700 transition hover:text-teal-800"
            >
              Selecionar todas
            </button>
            <button
              type="button"
              onClick={() => setRascunho([])}
              className="font-medium text-slate-600 transition hover:text-slate-800"
            >
              Limpar
            </button>
          </div>
        </div>

        <div className="max-h-80 space-y-0.5 overflow-y-auto rounded-lg border border-slate-200 p-2">
          {pastas.map((pasta) => (
            <label
              key={pasta.id}
              className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50"
              style={{ paddingLeft: `${8 + pasta.profundidade * 20}px` }}
            >
              <input
                type="checkbox"
                checked={rascunho.includes(pasta.id)}
                onChange={() => alternar(pasta.id)}
                className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
              />
              {pasta.nome}
            </label>
          ))}
        </div>
      </div>
    </Modal>
  );
}
