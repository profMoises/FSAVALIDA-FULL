export type Perfil = 'admin' | 'docente' | 'pedagogia' | 'coordenacao';

export type StatusPlano = 'validacao_pedagogica' | 'validacao_coordenacao' | 'devolvido_docente' | 'publicado';

export type DevolvidoPor = 'pedagogia' | 'coordenacao';

export type Usuario = {
  id: string;
  nome: string;
  email: string;
  perfil: Perfil;
  pasta_id: string | null;
  pasta_ids: string[];
};

export type Pasta = {
  id: string;
  nome: string;
  pai_id: string | null;
};

export type Plano = {
  id: string;
  titulo: string;
  docente_id: string;
  pasta_id: string;
  arquivo_path: string;
  arquivo_nome: string;
  arquivo_tamanho: number;
  status: StatusPlano;
  devolvido_por: DevolvidoPor | null;
  updated_at: string;
  docente: { nome: string } | null;
  pasta: { nome: string } | null;
};

export type TipoInteracao =
  | 'envio_docente'
  | 'recebimento_pedagogia'
  | 'recebimento_coordenacao'
  | 'devolucao_pedagogia'
  | 'devolucao_coordenacao'
  | 'reenvio_docente'
  | 'publicacao'
  | 'exclusao_plano';

export type InteracaoPlano = {
  id: string;
  plano_id: string;
  autor_id: string;
  autor_perfil: Perfil;
  tipo: TipoInteracao;
  mensagem: string | null;
  criado_at: string;
  autor: { nome: string } | null;
};

export const PERFIL_LABEL: Record<Perfil, string> = {
  admin: 'Administrador',
  docente: 'Docente',
  pedagogia: 'Pedagogia (NEP)',
  coordenacao: 'Coordenação técnica',
};

export const PERFIL_STYLE: Record<Perfil, string> = {
  admin: 'bg-slate-100 text-slate-700 ring-slate-500/20',
  docente: 'bg-teal-50 text-teal-700 ring-teal-600/20',
  pedagogia: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  coordenacao: 'bg-blue-50 text-blue-700 ring-blue-600/20',
};

export const STATUS_STYLE: Record<StatusPlano, string> = {
  validacao_pedagogica: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  validacao_coordenacao: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  devolvido_docente: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  publicado: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
};

export function rotuloStatus(plano: Pick<Plano, 'status' | 'devolvido_por'>): string {
  switch (plano.status) {
    case 'validacao_pedagogica':
      return 'Validação pedagógica';
    case 'validacao_coordenacao':
      return 'Validação da coordenação';
    case 'devolvido_docente':
      return plano.devolvido_por === 'pedagogia' ? 'Devolvido pela pedagogia' : 'Devolvido pela coordenação';
    case 'publicado':
      return 'Publicado';
  }
}

export function formatarTamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatarDataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export function mensagemDeErro(erro: unknown, padrao: string): string {
  return erro instanceof Error && erro.message ? erro.message : padrao;
}
