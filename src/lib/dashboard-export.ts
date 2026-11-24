import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import type { DadosDashboardGerencial, FiltrosDashboard } from '@/lib/dashboard';
import { PERFIL_LABEL } from '@/lib/domain';

const COR_SENAI: [number, number, number] = [13, 122, 111];
const COR_TEXTO: [number, number, number] = [30, 41, 59];
const COR_CLARO: [number, number, number] = [100, 116, 139];

function rotuloStatus(status: string): string {
  const mapa: Record<string, string> = {
    validacao_pedagogica: 'Aguard. pedagogia',
    validacao_coordenacao: 'Aguard. coordenação',
    devolvido_docente: 'Devolvido',
    publicado: 'Publicado',
  };
  return mapa[status] ?? status;
}

function rotuloSituacao(situacao: string): string {
  const mapa: Record<string, string> = {
    dentro_prazo: 'Dentro do prazo',
    nao_iniciado: 'Não iniciado',
    encerrado: 'Prazo encerrado',
    sem_prazo: 'Sem prazo configurado',
    concluido: 'Concluído',
  };
  return mapa[situacao] ?? situacao;
}

function rotuloResponsavel(perfil: string | null): string {
  if (!perfil) return '—';
  const mapa: Record<string, string> = {
    pedagogia: 'Pedagogia',
    coordenacao: 'Coordenação',
    docente: 'Docente',
    concluido: 'Concluído',
  };
  return mapa[perfil] ?? perfil;
}

function formatarFiltros(filtros: FiltrosDashboard): string {
  const partes: string[] = [];
  if (filtros.pastaId) partes.push('Curso/Pasta filtrado');
  if (filtros.docenteId) partes.push('Docente filtrado');
  if (filtros.responsavelPerfil) partes.push(`Responsável: ${rotuloResponsavel(filtros.responsavelPerfil)}`);
  if (filtros.status) partes.push(`Status: ${rotuloStatus(filtros.status)}`);
  if (filtros.periodo !== 'ano') {
    const periodoLabels: Record<string, string> = {
      hoje: 'Hoje',
      '7dias': 'Últimos 7 dias',
      '30dias': 'Últimos 30 dias',
      '90dias': 'Últimos 90 dias',
      '6meses': 'Últimos 6 meses',
      ano_anterior: 'Ano anterior',
      personalizado: 'Personalizado',
    };
    partes.push(`Período: ${periodoLabels[filtros.periodo] ?? filtros.periodo}`);
  }
  return partes.length > 0 ? partes.join('; ') : 'Sem filtros (todos os dados)';
}

function formatarHoras(horas: number): string {
  if (horas < 1) return `${Math.round(horas * 60)} min`;
  if (horas < 24) return `${horas.toFixed(1)} h`;
  return `${(horas / 24).toFixed(1)} dias`;
}

function adicionarRodapePdf(doc: jsPDF, dataGeracao: string) {
  const alturaPagina = doc.internal.pageSize.getHeight();
  const larguraPagina = doc.internal.pageSize.getWidth();
  const margemEsq = 40;
  const margemDir = 40;
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.5);
  doc.line(margemEsq, alturaPagina - 30, larguraPagina - margemDir, alturaPagina - 30);
  doc.setFontSize(8);
  doc.setTextColor(...COR_CLARO);
  doc.setFont('helvetica', 'normal');
  doc.text(`Relatório gerado em ${dataGeracao}`, margemEsq, alturaPagina - 16);
  const numPagina = doc.getCurrentPageInfo().pageNumber;
  doc.text(`Página ${numPagina}`, larguraPagina - margemDir - 40, alturaPagina - 16);
}

export function exportarXlsx(dados: DadosDashboardGerencial, filtros: FiltrosDashboard): void {
  const wb = XLSX.utils.book_new();
  const dataGeracao = new Date().toLocaleString('pt-BR');

  const infoFiltros = [
    ['Relatório Dashboard SENAI - Planos de Aula'],
    ['Data de geração', dataGeracao],
    ['Filtros aplicados', formatarFiltros(filtros)],
    ['Total de registros', String(dados.total_registros)],
    [],
  ];
  const wsInfo = XLSX.utils.aoa_to_sheet(infoFiltros);
  XLSX.utils.book_append_sheet(wb, wsInfo, 'Visão Geral');

  const indicadoresData = [
    ['Indicador', 'Valor', 'Período Anterior', 'Variação'],
    ['Total de planos', String(dados.indicadores.total_planos), String(dados.indicadores.total_planos_anterior), calcularVariacao(dados.indicadores.total_planos, dados.indicadores.total_planos_anterior)],
    ['Planos enviados', String(dados.indicadores.planos_enviados), '', ''],
    ['Aguardando pedagogia', String(dados.indicadores.aguardando_pedagogia), '', ''],
    ['Aguardando coordenação', String(dados.indicadores.aguardando_coordenacao), '', ''],
    ['Devolvidos', String(dados.indicadores.devolvidos), String(dados.indicadores.devolvidos_anterior), calcularVariacao(dados.indicadores.devolvidos, dados.indicadores.devolvidos_anterior)],
    ['Publicados', String(dados.indicadores.publicados), String(dados.indicadores.publicados_anterior), calcularVariacao(dados.indicadores.publicados, dados.indicadores.publicados_anterior)],
    ['Docentes ativos', String(dados.indicadores.docentes_ativos), '', ''],
    ['Tempo médio (horas)', String(dados.indicadores.tempo_medio_horas), '', ''],
    ['Pendências', String(dados.indicadores.pendencias), '', ''],
    ['Planos com atraso', String(dados.indicadores.planos_atraso), '', ''],
  ];
  const wsInd = XLSX.utils.aoa_to_sheet(indicadoresData);
  XLSX.utils.book_append_sheet(wb, wsInd, 'Indicadores');

  const tramData = [
    ['Plano', 'Curso', 'Pasta', 'Docente', 'Status', 'Responsável', 'Perfil', 'Entrada na etapa', 'Tempo na etapa', 'Última movimentação', 'Situação'],
    ...dados.tramitacao.map((t) => [
      t.titulo, t.curso_nome, t.pasta_nome, t.docente_nome,
      rotuloStatus(t.status), t.responsavel_atual ?? '—',
      rotuloResponsavel(t.responsavel_perfil),
      t.data_entrada_etapa ?? '—',
      formatarHoras(t.tempo_etapa_horas),
      t.data_ultima_interacao ?? '—',
      rotuloSituacao(t.situacao_prazo),
    ]),
  ];
  const wsTram = XLSX.utils.aoa_to_sheet(tramData);
  XLSX.utils.book_append_sheet(wb, wsTram, 'Tramitação');

  const cursoData = [
    ['Curso', 'Planos', 'Aguard. Pedag.', 'Aguard. Coord.', 'Devolvidos', 'Publicados', '% Publicação', 'Docentes vinculados', 'Docentes enviaram', 'Tempo médio (h)', 'Planos atraso'],
    ...dados.analise_cursos.map((c) => [
      c.curso_nome, String(c.total_planos), String(c.aguardando_pedagogia),
      String(c.aguardando_coordenacao), String(c.devolvidos), String(c.publicados),
      `${c.percentual_publicacao}%`, String(c.docentes_vinculados), String(c.docentes_enviaram),
      String(c.tempo_medio_horas), String(c.planos_atraso),
    ]),
  ];
  const wsCurso = XLSX.utils.aoa_to_sheet(cursoData);
  XLSX.utils.book_append_sheet(wb, wsCurso, 'Análise por Curso');

  const docenteData = [
    ['Docente', 'Curso(s)', 'Total planos', 'Em tramitação', 'Devolvidos', 'Publicados', 'Reenvios', 'Versões', 'Último envio', '% Publicados'],
    ...dados.analise_docentes.map((d) => [
      d.docente_nome, d.curso_nome, String(d.total_planos), String(d.em_tramitacao),
      String(d.devolvidos), String(d.publicados), String(d.total_reenvios),
      String(d.total_versoes), d.ultimo_envio ?? '—', `${d.percentual_publicados}%`,
    ]),
  ];
  const wsDoc = XLSX.utils.aoa_to_sheet(docenteData);
  XLSX.utils.book_append_sheet(wb, wsDoc, 'Análise por Docente');

  const eqData = [
    ['Equipe', 'Recebidos', 'Analisados', 'Aprovados', 'Devolvidos', 'Aguardando'],
    ['Pedagogia', String(dados.desempenho_pedagogia.planos_recebidos), String(dados.desempenho_pedagogia.planos_analisados), String(dados.desempenho_pedagogia.planos_aprovados), String(dados.desempenho_pedagogia.planos_devolvidos), String(dados.desempenho_pedagogia.aguardando_analise)],
    ['Coordenação', String(dados.desempenho_coordenacao.planos_recebidos), String(dados.desempenho_coordenacao.planos_analisados), String(dados.desempenho_coordenacao.planos_aprovados), String(dados.desempenho_coordenacao.planos_devolvidos), String(dados.desempenho_coordenacao.aguardando_analise)],
  ];
  const wsEq = XLSX.utils.aoa_to_sheet(eqData);
  XLSX.utils.book_append_sheet(wb, wsEq, 'Desempenho Equipes');

  XLSX.writeFile(wb, `dashboard_senai_${new Date().toISOString().split('T')[0]}.xlsx`);
}

function calcularVariacao(atual: number, anterior: number): string {
  if (anterior === 0) return '—';
  const variacao = ((atual - anterior) / anterior) * 100;
  return `${variacao > 0 ? '+' : ''}${variacao.toFixed(1)}%`;
}

export function exportarCsv(dados: DadosDashboardGerencial, filtros: FiltrosDashboard): void {
  const linhas: string[] = [];
  linhas.push(`Filtros aplicados;${formatarFiltros(filtros)}`);
  linhas.push('Plano;Curso;Pasta;Docente;Status;Responsável;Perfil;Entrada na etapa;Tempo na etapa (h);Última movimentação;Situação');
  for (const t of dados.tramitacao) {
    const escapeCsv = (s: string) => `"${s.replace(/"/g, '""')}"`;
    linhas.push([
      escapeCsv(t.titulo),
      escapeCsv(t.curso_nome),
      escapeCsv(t.pasta_nome),
      escapeCsv(t.docente_nome),
      rotuloStatus(t.status),
      escapeCsv(t.responsavel_atual ?? '—'),
      rotuloResponsavel(t.responsavel_perfil),
      t.data_entrada_etapa ?? '—',
      String(t.tempo_etapa_horas),
      t.data_ultima_interacao ?? '—',
      rotuloSituacao(t.situacao_prazo),
    ].join(';'));
  }
  const conteudo = '\uFEFF' + linhas.join('\n');
  const blob = new Blob([conteudo], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `dashboard_senai_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportarPdf(dados: DadosDashboardGerencial, filtros: FiltrosDashboard): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const larguraPagina = doc.internal.pageSize.getWidth();
  const margemEsq = 40;
  const margemDir = 40;
  const larguraConteudo = larguraPagina - margemEsq - margemDir;
  let y = 0;
  const dataGeracao = new Date().toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' });

  const garantirEspaco = (altura: number) => {
    if (y + altura > doc.internal.pageSize.getHeight() - 50) {
      adicionarRodapePdf(doc, dataGeracao);
      doc.addPage();
      y = 50;
    }
  };

  doc.setFillColor(...COR_SENAI);
  doc.rect(0, 0, larguraPagina, 70, 'F');
  doc.setFontSize(22);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.text('SENAI', margemEsq, 35);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Dashboard Gerencial - Planos de Aula', margemEsq, 52);

  y = 100;
  doc.setFontSize(9);
  doc.setTextColor(...COR_CLARO);
  doc.text(`Data de geração: ${dataGeracao}`, margemEsq, y);
  y += 14;
  doc.text(`Filtros: ${formatarFiltros(filtros)}`, margemEsq, y);
  y += 14;
  doc.text(`Total de registros: ${dados.total_registros}`, margemEsq, y);

  y += 24;
  doc.setDrawColor(...COR_SENAI);
  doc.setLineWidth(1);
  doc.line(margemEsq, y, larguraPagina - margemDir, y);

  y += 20;
  doc.setFontSize(12);
  doc.setTextColor(...COR_TEXTO);
  doc.setFont('helvetica', 'bold');
  doc.text('Indicadores Gerais', margemEsq, y);

  y += 16;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  const inds: [string, string][] = [
    ['Total de planos', String(dados.indicadores.total_planos)],
    ['Planos enviados', String(dados.indicadores.planos_enviados)],
    ['Aguardando pedagogia', String(dados.indicadores.aguardando_pedagogia)],
    ['Aguardando coordenação', String(dados.indicadores.aguardando_coordenacao)],
    ['Devolvidos', String(dados.indicadores.devolvidos)],
    ['Publicados', String(dados.indicadores.publicados)],
    ['Docentes ativos', String(dados.indicadores.docentes_ativos)],
    ['Tempo médio (h)', String(dados.indicadores.tempo_medio_horas)],
    ['Pendências', String(dados.indicadores.pendencias)],
    ['Planos com atraso', String(dados.indicadores.planos_atraso)],
  ];
  for (const [label, valor] of inds) {
    doc.setTextColor(...COR_CLARO);
    doc.text(label, margemEsq, y);
    doc.setTextColor(...COR_TEXTO);
    doc.setFont('helvetica', 'bold');
    doc.text(valor, margemEsq + 180, y);
    doc.setFont('helvetica', 'normal');
    y += 14;
  }

  y += 14;
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COR_TEXTO);
  garantirEspaco(30);
  doc.text('Síntese Executiva', margemEsq, y);
  y += 16;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COR_CLARO);
  const sinteses: string[] = [
    `Percentual de planos publicados: ${dados.sintese.percentual_publicados}%`,
    `Percentual de planos pendentes: ${dados.sintese.percentual_pendentes}%`,
    `Etapa com maior concentração de pendências: ${dados.sintese.etapa_mais_pendencias}`,
    `Curso com maior volume de planos: ${dados.sintese.curso_maior_volume}`,
  ];
  for (const s of sinteses) {
    garantirEspaco(16);
    doc.text(s, margemEsq, y);
    y += 14;
  }

  y += 14;
  garantirEspaco(30);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COR_TEXTO);
  doc.text('Acompanhamento da Tramitação', margemEsq, y);
  y += 10;

  const headers = ['Plano', 'Curso', 'Status', 'Responsável', 'Tempo'];
  const colWidths = [120, 100, 80, 100, 60];
  doc.setFillColor(240, 245, 250);
  doc.rect(margemEsq, y, larguraConteudo, 18, 'F');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COR_TEXTO);
  let x = margemEsq + 4;
  for (let i = 0; i < headers.length; i++) {
    doc.text(headers[i], x, y + 12);
    x += colWidths[i];
  }
  y += 18;
  doc.setFont('helvetica', 'normal');

  for (const t of dados.tramitacao) {
    garantirEspaco(16);
    doc.setTextColor(...COR_TEXTO);
    x = margemEsq + 4;
    const valores = [t.titulo, t.curso_nome, rotuloStatus(t.status), t.responsavel_atual ?? '—', formatarHoras(t.tempo_etapa_horas)];
    for (let i = 0; i < valores.length; i++) {
      const linhas = doc.splitTextToSize(valores[i], colWidths[i] - 8);
      doc.text(linhas[0] ?? '', x, y + 12);
      x += colWidths[i];
    }
    y += 16;
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.3);
    doc.line(margemEsq, y, larguraPagina - margemDir, y);
  }

  adicionarRodapePdf(doc, dataGeracao);
  doc.save(`dashboard_senai_${new Date().toISOString().split('T')[0]}.pdf`);
}

export { PERFIL_LABEL };
