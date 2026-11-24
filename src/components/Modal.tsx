import { X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { BTN_ICON } from '@/components/ui';

type ModalProps = {
  titulo: string;
  descricao?: string;
  onFechar?: () => void;
  children: ReactNode;
  rodape?: ReactNode;
  largura?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl';
};

const LARGURAS: Record<string, string> = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-xl',
  xl: 'max-w-2xl',
  '2xl': 'max-w-3xl',
  '3xl': 'max-w-4xl',
  '4xl': 'max-w-5xl',
};

export function Modal({ titulo, descricao, onFechar, children, rodape, largura = 'md' }: ModalProps) {
  useEffect(() => {
    if (!onFechar) return;
    const aoPressionarTecla = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') onFechar();
    };
    document.addEventListener('keydown', aoPressionarTecla);
    return () => document.removeEventListener('keydown', aoPressionarTecla);
  }, [onFechar]);

  return (
    <div
 className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-3 backdrop-blur-[2px] animate-fade-in sm:p-4"
      onClick={onFechar}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-titulo"
className={`animate-modal-in mt-6 flex w-full ${LARGURAS[largura]} max-h-[90vh] flex-col overflow-hidden rounded-2xl bg-white shadow-xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-5 py-3.5 sm:px-6 sm:py-4">
          <div className="min-w-0">
            <h2 id="modal-titulo" className="text-base font-semibold text-slate-900 sm:text-lg">
              {titulo}
            </h2>
            {descricao && <p className="mt-0.5 text-sm text-slate-500">{descricao}</p>}
          </div>
          {onFechar && (
            <button type="button" onClick={onFechar} className={BTN_ICON} aria-label="Fechar">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6 sm:py-5">{children}</div>
        {rodape && (
          <div className="flex shrink-0 flex-wrap justify-end gap-3 border-t border-slate-100 px-5 py-3 sm:px-6 sm:py-4">
            {rodape}
          </div>
        )}
      </div>
    </div>
  );
}

