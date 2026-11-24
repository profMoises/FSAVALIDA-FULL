import { jsPDF } from 'jspdf';
import { PERFIL_LABEL, formatarDataHora, type InteracaoPlano, type Plano } from '@/lib/domain';

const ROTULOS: Record<InteracaoPlano['tipo'], string> = {
  envio_docente: 'Envio do docente',
  recebimento_pedagogia: 'Recebido pela pedagogia',
  recebimento_coordenacao: 'Recebido pela coordenação',
  devolucao_pedagogia: 'Devolvido pela pedagogia',
  devolucao_coordenacao: 'Devolvido pela coordenação',
  reenvio_docente: 'Ajustes reenviados pelo docente',
  publicacao: 'Plano publicado',
  exclusao_plano: 'Plano excluído',
};

const COR_SENAI: [number, number, number] = [13, 71, 161];
const COR_TEXTO: [number, number, number] = [30, 41, 59];
const COR_CLARO: [number, number, number] = [100, 116, 139];

export function gerarPdfHistorico(plano: Plano, interacoes: InteracaoPlano[]): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const larguraPagina = doc.internal.pageSize.getWidth();
  const margemEsq = 40;
  const margemDir = 40;
  const larguraConteudo = larguraPagina - margemEsq - margemDir;
  let y = 0;

  const garantirEspaco = (alturaNecessaria: number) => {
    if (y + alturaNecessaria > doc.internal.pageSize.getHeight() - 50) {
      adicionarRodape();
      doc.addPage();
      y = 50;
    }
  };

  const adicionarRodape = () => {
    const alturaPagina = doc.internal.pageSize.getHeight();
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.5);
    doc.line(margemEsq, alturaPagina - 30, larguraPagina - margemDir, alturaPagina - 30);
    doc.setFontSize(8);
    doc.setTextColor(...COR_CLARO);
    doc.setFont('helvetica', 'normal');
    const dataGeracao = new Date().toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' });
    doc.text(`Relatório gerado em ${dataGeracao}`, margemEsq, alturaPagina - 16);
    const numPagina = doc.getCurrentPageInfo().pageNumber;
    doc.text(`Página ${numPagina}`, larguraPagina - margemDir - 40, alturaPagina - 16);
  };

  doc.setFillColor(...COR_SENAI);
  doc.rect(0, 0, larguraPagina, 70, 'F');
  doc.setFontSize(22);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.text('SENAI', margemEsq, 35);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Histórico de plano de aula', margemEsq, 52);

  y = 100;
  doc.setFontSize(14);
  doc.setTextColor(...COR_TEXTO);
  doc.setFont('helvetica', 'bold');
  doc.text(plano.titulo, margemEsq, y);

  y += 22;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  const infoDocente = `Docente: ${plano.docente?.nome ?? 'Não informado'}`;
  const infoPasta = `Curso/Pasta: ${plano.pasta?.nome ?? 'Não informada'}`;
  const infoArquivo = `Arquivo: ${plano.arquivo_nome}`;
  doc.text(infoDocente, margemEsq, y);
  y += 14;
  doc.text(infoPasta, margemEsq, y);
  y += 14;
  doc.text(infoArquivo, margemEsq, y);

  y += 24;
  doc.setDrawColor(...COR_SENAI);
  doc.setLineWidth(1);
  doc.line(margemEsq, y, larguraPagina - margemDir, y);

  y += 20;
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Movimentações', margemEsq, y);

  y += 10;
  const alturaLinha = 20;
  const alturasColunas = [55, 100, 90, 125, larguraConteudo - 55 - 100 - 90 - 125];
  const headers = ['Data/Hora', 'Responsável', 'Perfil', 'Movimentação', 'Justificativa'];

  const desenharCabecalhoTabela = () => {
    doc.setFillColor(240, 245, 250);
    doc.rect(margemEsq, y, larguraConteudo, alturaLinha, 'F');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COR_TEXTO);
    let x = margemEsq + 4;
    for (let i = 0; i < headers.length; i++) {
      doc.text(headers[i], x, y + 13);
      x += alturasColunas[i];
    }
    y += alturaLinha;
  };

  desenharCabecalhoTabela();

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);

  for (const interacao of interacoes) {
    const justificativa = interacao.mensagem ?? '—';
    const linhasJustificativa = doc.splitTextToSize(justificativa, alturasColunas[4] - 8);
    const linhasResponsavel = doc.splitTextToSize(interacao.autor?.nome ?? 'Usuário', alturasColunas[1] - 8);
    const alturaCelula = Math.max(alturaLinha, linhasJustificativa.length * 11 + 8, linhasResponsavel.length * 11 + 8);

    garantirEspaco(alturaCelula + 5);

    if (Math.floor(y / alturaLinha) % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margemEsq, y, larguraConteudo, alturaCelula, 'F');
    }

    let x = margemEsq + 4;
    doc.setTextColor(...COR_TEXTO);
    doc.text(formatarDataHora(interacao.criado_at), x, y + 13);
    x += alturasColunas[0];
    doc.text(linhasResponsavel, x, y + 13);
    x += alturasColunas[1];
    doc.text(PERFIL_LABEL[interacao.autor_perfil], x, y + 13);
    x += alturasColunas[2];
    doc.text(ROTULOS[interacao.tipo], x, y + 13);
    x += alturasColunas[3];
    doc.setTextColor(...COR_CLARO);
    doc.text(linhasJustificativa, x, y + 13);

    y += alturaCelula;
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.3);
    doc.line(margemEsq, y, larguraPagina - margemDir, y);
  }

  if (interacoes.length === 0) {
    doc.setTextColor(...COR_CLARO);
    doc.setFontSize(10);
    doc.text('Este plano ainda não possui movimentações registradas.', margemEsq, y + 20);
  }

  adicionarRodape();
  doc.save(`historico_${plano.titulo.replace(/[^A-Za-z0-9]+/g, '_').toLowerCase()}.pdf`);
}
