export type PeriodoDashboard =
  | 'hoje'
  | '7dias'
  | '30dias'
  | '90dias'
  | '6meses'
  | 'ano'
  | 'ano_anterior'
  | 'personalizado';

export type FiltrosDashboard = {
  pastaId: string | null;
  docenteId: string | null;
  responsavelPerfil: string | null;
  status: string | null;
  periodo: PeriodoDashboard;
  dataInicio: string | null;
  dataFim: string | null;
};

export type IndicadoresDashboard = {
  total_planos: number;
  planos_enviados: number;
  aguardando_pedagogia: number;
  aguardando_coordenacao: number;
  devolvidos: number;
  publicados: number;
  docentes_ativos: number;
  tempo_medio_horas: number;
  pendencias: number;
  planos_atraso: number;
  total_planos_anterior: number;
  publicados_anterior: number;
  devolvidos_anterior: number;
};

export type ItemTramitacao = {
  id: string;
  titulo: string;
  curso_nome: string;
  pasta_nome: string;
  docente_nome: string;
  status: string;
  responsavel_atual: string | null;
  responsavel_perfil: string | null;
  data_entrada_etapa: string | null;
  data_entrada_etapa_iso: string | null;
  tempo_etapa_horas: number;
  ultimo_tipo: string | null;
  ultimo_autor_nome: string | null;
  ultimo_autor_perfil: string | null;
  data_ultima_interacao: string | null;
  situacao_prazo: string;
  prazo_data_inicio: string | null;
  prazo_data_fim: string | null;
  total_movimentacoes: number;
  data_primeiro_envio: string | null;
  data_publicacao: string | null;
  arquivo_nome: string;
};

export type ItemCurso = {
  curso_nome: string;
  total_planos: number;
  aguardando_pedagogia: number;
  aguardando_coordenacao: number;
  devolvidos: number;
  publicados: number;
  percentual_publicacao: number;
  docentes_vinculados: number;
  docentes_enviaram: number;
  tempo_medio_horas: number;
  planos_atraso: number;
};

export type ItemDocente = {
  docente_nome: string;
  docente_id: string;
  curso_nome: string;
  total_planos: number;
  em_tramitacao: number;
  devolvidos: number;
  publicados: number;
  total_reenvios: number;
  total_versoes: number;
  ultimo_envio: string | null;
  percentual_publicados: number;
};

export type DesempenhoEquipe = {
  planos_recebidos: number;
  planos_analisados: number;
  planos_aprovados: number;
  planos_devolvidos: number;
  aguardando_analise: number;
};

export type ItemAnaliseIndividual = {
  nome: string;
  analisados: number;
  aprovados: number;
  devolvidos: number;
  ultima_acao: string;
};

export type EstatisticaTempo = {
  media: number;
  mediana: number;
  maior: number;
  menor: number;
  amostras: number;
};

export type ItemEvolucao = { data: string; quantidade: number };

export type SinteseExecutiva = {
  percentual_publicados: number;
  percentual_pendentes: number;
  etapa_mais_pendencias: string;
  curso_maior_volume: string;
};

export type DadosDashboardGerencial = {
  indicadores: IndicadoresDashboard;
  tramitacao: ItemTramitacao[];
  analise_cursos: ItemCurso[];
  analise_docentes: ItemDocente[];
  desempenho_pedagogia: DesempenhoEquipe;
  desempenho_coordenacao: DesempenhoEquipe;
  analise_individual_pedagogia: ItemAnaliseIndividual[];
  analise_individual_coordenacao: ItemAnaliseIndividual[];
  tempo_envio_pedagogia: EstatisticaTempo;
  tempo_analise_pedagogia: EstatisticaTempo;
  tempo_encaminhamento_coordenacao: EstatisticaTempo;
  tempo_total_publicacao: EstatisticaTempo;
  evolucao_envios: ItemEvolucao[];
  evolucao_publicacoes: ItemEvolucao[];
  evolucao_devolucoes: ItemEvolucao[];
  sintese: SinteseExecutiva;
  total_registros: number;
  prazos_configurados: Record<string, number>;
};
