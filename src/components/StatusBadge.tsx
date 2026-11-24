import { STATUS_STYLE, rotuloStatus, type Plano } from '@/lib/domain';

type StatusBadgeProps = {
  plano: Pick<Plano, 'status' | 'devolvido_por'>;
};

export function StatusBadge({ plano }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${STATUS_STYLE[plano.status]}`}
    >
      {rotuloStatus(plano)}
    </span>
  );
}
