import type { ReactNode } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import { StatusBadge } from '@/components/StatusBadge';
import { formatarDataHora, formatarTamanho, type Plano } from '@/lib/domain';

type PlanoCardProps = {
  plano: Plano;
  children?: ReactNode;
};

export function PlanoCard({ plano, children }: PlanoCardProps) {
  return (
    <article className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md sm:flex-row sm:items-center">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
        <FileSpreadsheet className="h-5 w-5" />
      </div>

      <div className="min-w-0 flex-1">
        <h3 className="truncate text-base font-semibold text-slate-900">{plano.titulo}</h3>
        <p className="truncate text-sm text-slate-500">
          {plano.docente?.nome ?? 'Docente'} · {plano.arquivo_nome} ({formatarTamanho(plano.arquivo_tamanho)})
        </p>
        <p className="mt-1 text-xs text-slate-400">
          {plano.pasta?.nome ?? 'Sem pasta'} · Atualizado em {formatarDataHora(plano.updated_at)}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        <StatusBadge plano={plano} />
        {children}
      </div>
    </article>
  );
}
