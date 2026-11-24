import { useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import jsPDF from 'jspdf';
import { Modal } from '@/components/Modal';
import { BTN_PRIMARY, BTN_SECONDARY, INPUT, LABEL } from '@/components/ui';
import {
  obterRelatorioAcessos,
  ROTULO_TIPO_RELATORIO,
  ROTULO_PERFIL_FILTRO,
  type FiltroRelatorio,
  type TipoRelatorio,
  type DadosRelatorio,
  type UsuarioAcesso,
} from '@/lib/relatorio-acessos';
import type { Perfil } from '@/lib/domain';
import { mensagemDeErro } from '@/lib/domain';

const COR_SENAI: [number, number, number] = [0, 102, 102];
const COR_TEXTO: [number, number, number] = [51, 51, 51];
const COR_CLARO: [number, number, number] = [128, 128, 128];

export function RelatorioAcessosModal({ onFechar }: { onFechar: () => void }) {
  const [perfil, setPerfil] = useState<Perfil | 'todos'>('docente');
  const [tipo, setTipo] = useState<TipoRelatorio>('resumo');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const gerar = async () => {
    setGerando(true);
    setErro(null);
    try {
      const filtro: FiltroRelatorio = {
        perfil,
        tipo,
        dataInicio: dataInicio || null,
        dataFim: dataFim || null,
      };
      const dados = await obterRelatorioAcessos(filtro);
      gerarPdf(dados, filtro);
    } catch (e) {
      setErro(mensagemDeErro(e, 'Não foi possível gerar o relatório.'));
    } finally {
      setGerando(false);
    }
  };

  return (
    <Modal
      titulo="Relatório de Acessos e Logins"
      onFechar={onFechar}
      largura="md"
      rodape={
        <>
          <button type="button" onClick={onFechar} className={BTN_SECONDARY}>
            Cancelar
          </button>
          <button type="button" onClick={gerar} disabled={gerando} className={BTN_PRIMARY}>
            {gerando && <Loader2 className="h-4 w-4 animate-spin" />}
            Gerar e baixar PDF
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className={LABEL}>Perfil de usuário</label>
          <select
            value={perfil}
            onChange={(e) => setPerfil(e.target.value as Perfil | 'todos')}
            className={INPUT}
          >
            <option value="todos">Todos os usuários</option>
            <option value="docente">Docentes</option>
            <option value="coordenacao">Coordenação Técnica</option>
            <option value="pedagogia">Pedagogia (NEP)</option>
            <option value="admin">Administradores</option>
          </select>
        </div>

        <div>
          <label className={LABEL}>Tipo de relatório</label>
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value as TipoRelatorio)}
            className={INPUT}
          >
            <option value="resumo">{ROTULO_TIPO_RELATORIO.resumo}</option>
            <option value="nunca_logaram">{ROTULO_TIPO_RELATORIO.nunca_logaram}</option>
            <option value="historico">{ROTULO_TIPO_RELATORIO.historico}</option>
            <option value="sem_acesso_periodo">{ROTULO_TIPO_RELATORIO.sem_acesso_periodo}</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LABEL}>Data inicial (opcional)</label>
            <input
              type="date"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
              className={INPUT}
            />
          </div>
          <div>
            <label className={LABEL}>Data final (opcional)</label>
            <input
              type="date"
              value={dataFim}
              min={dataInicio || undefined}
              onChange={(e) => setDataFim(e.target.value)}
              className={INPUT}
            />
          </div>
        </div>

        <p className="text-xs text-slate-500">
          Deixe as datas em branco para considerar todos os registros disponíveis.
        </p>

        {erro && <p className="text-sm text-red-600">{erro}</p>}
      </div>
    </Modal>
  );
}

function gerarPdf(dados: DadosRelatorio, filtro: FiltroRelatorio) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const larguraPagina = doc.internal.pageSize.getWidth();
  const margemEsq = 40;
  const margemDir = 40;
  const larguraConteudo = larguraPagina - margemEsq - margemDir;
  let y = 0;

  const dataGeracao = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date());

  const periodoTexto = filtro.dataInicio || filtro.dataFim
    ? `${filtro.dataInicio ? formatarDataPt(filtro.dataInicio) : 'Início'} a ${filtro.dataFim ? formatarDataPt(filtro.dataFim) : 'Hoje'}`
    : 'Todos os registros disponíveis';

  const garantirEspaco = (altura: number) => {
    if (y + altura > doc.internal.pageSize.getHeight() - 50) {
      adicionarRodape(doc, dataGeracao);
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
  doc.text('Relatório de Acessos e Logins', margemEsq, 52);

  y = 100;
  doc.setFontSize(9);
  doc.setTextColor(...COR_CLARO);
  doc.text(`Data de geração: ${dataGeracao}`, margemEsq, y);
  y += 14;
  doc.text(`Perfil: ${ROTULO_PERFIL_FILTRO[filtro.perfil]}`, margemEsq, y);
  y += 14;
  doc.text(`Período: ${periodoTexto}`, margemEsq, y);
  y += 14;
  doc.text(`Tipo: ${ROTULO_TIPO_RELATORIO[filtro.tipo]}`, margemEsq, y);

  y += 20;
  doc.setDrawColor(...COR_SENAI);
  doc.setLineWidth(1);
  doc.line(margemEsq, y, larguraPagina - margemDir, y);

  y += 24;
  doc.setFontSize(12);
  doc.setTextColor(...COR_TEXTO);
  doc.setFont('helvetica', 'bold');
  garantirEspaco(30);
  doc.text('Resumo Quantitativo', margemEsq, y);
  y += 18;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');

  const resumo = dados.resumo;
  const linhasResumo: [string, string][] = [
    ['Total de usuários cadastrados', String(resumo.total_cadastrados)],
    ['Usuários que já fizeram login', String(resumo.ja_logaram)],
    ['Usuários que nunca fizeram login', String(resumo.nunca_logaram)],
  ];
  if (filtro.dataInicio || filtro.dataFim) {
    linhasResumo.push(['Acessos no período', String(resumo.acessos_no_periodo)]);
    linhasResumo.push(['Sem acesso no período', String(resumo.sem_acesso_periodo)]);
  }

  for (const [label, valor] of linhasResumo) {
    garantirEspaco(14);
    doc.setTextColor(...COR_CLARO);
    doc.text(label, margemEsq, y);
    doc.setTextColor(...COR_TEXTO);
    doc.setFont('helvetica', 'bold');
    doc.text(valor, margemEsq + 230, y);
    doc.setFont('helvetica', 'normal');
    y += 14;
  }

  y += 14;
  garantirEspaco(30);

  const usuariosFiltrados = filtrarUsuariosPorTipo(dados, filtro.tipo);

  if (filtro.tipo === 'historico') {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COR_TEXTO);
    garantirEspaco(30);
    doc.text('Histórico de Logins', margemEsq, y);
    y += 10;
    desenharTabelaHistorico(doc, dados.historico, margemEsq, larguraConteudo, () => y, (novoY) => { y = novoY; }, garantirEspaco, adicionarRodape, dataGeracao);
  } else {
    const tituloTabela = filtro.tipo === 'nunca_logaram'
      ? 'Usuários que Nunca Fizeram Login'
      : filtro.tipo === 'sem_acesso_periodo'
        ? 'Usuários sem Acesso no Período'
        : 'Detalhamento por Usuário';

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COR_TEXTO);
    garantirEspaco(30);
    doc.text(tituloTabela, margemEsq, y);
    y += 10;
    desenharTabelaUsuarios(doc, usuariosFiltrados, filtro.tipo, margemEsq, larguraConteudo, () => y, (novoY) => { y = novoY; }, garantirEspaco, adicionarRodape, dataGeracao);
  }

  adicionarRodape(doc, dataGeracao);
  doc.save(`relatorio_acessos_${new Date().toISOString().split('T')[0]}.pdf`);
}

function filtrarUsuariosPorTipo(dados: DadosRelatorio, tipo: TipoRelatorio): UsuarioAcesso[] {
  if (tipo === 'nunca_logaram') return dados.usuarios.filter((u) => !u.ja_logou);
  if (tipo === 'sem_acesso_periodo') return dados.usuarios.filter((u) => u.ja_logou && u.acessos_no_periodo === 0);
  return dados.usuarios;
}

function formatarDataPt(iso: string): string {
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

function adicionarRodape(doc: jsPDF, dataGeracao: string) {
  const alturaPagina = doc.internal.pageSize.getHeight();
  const larguraPagina = doc.internal.pageSize.getWidth();
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.5);
  doc.line(40, alturaPagina - 30, larguraPagina - 40, alturaPagina - 30);
  doc.setFontSize(8);
  doc.setTextColor(...COR_CLARO);
  doc.setFont('helvetica', 'normal');
  doc.text(`Relatório gerado em ${dataGeracao}`, 40, alturaPagina - 16);
  const numPagina = doc.getCurrentPageInfo().pageNumber;
  doc.text(`Página ${numPagina}`, larguraPagina - 80, alturaPagina - 16);
}

function desenharTabelaUsuarios(
  doc: jsPDF,
  usuarios: UsuarioAcesso[],
  tipo: TipoRelatorio,
  margemEsq: number,
  larguraConteudo: number,
  getY: () => number,
  setY: (y: number) => void,
  garantirEspaco: (altura: number) => void,
  _adicionarRodape: (doc: jsPDF, data: string) => void,
  _dataGeracao: string,
) {
  if (usuarios.length === 0) {
    garantirEspaco(20);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COR_CLARO);
    doc.text('Nenhum usuário encontrado neste critério.', margemEsq, getY() + 10);
    setY(getY() + 20);
    return;
  }

  const colunas = ['Nome', 'Perfil', 'Vínculo', 'Cadastro', 'Último login', 'Acessos'];
  const larguras = [120, 70, 100, 70, 80, 50];
  let y = getY();

  doc.setFillColor(240, 245, 250);
  doc.rect(margemEsq, y, larguraConteudo, 18, 'F');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COR_TEXTO);
  let x = margemEsq + 4;
  for (let i = 0; i < colunas.length; i++) {
    doc.text(colunas[i], x, y + 12);
    x += larguras[i];
  }
  y += 18;
  doc.setFont('helvetica', 'normal');

  for (const u of usuarios) {
    garantirEspaco(16);
    const rotuloPerfil: Record<string, string> = {
      admin: 'Admin', docente: 'Docente', pedagogia: 'Pedagogia', coordenacao: 'Coordenação',
    };
    const linhas: string[] = [
      u.nome.length > 28 ? u.nome.substring(0, 28) + '…' : u.nome,
      rotuloPerfil[u.perfil] ?? u.perfil,
      (u.vinculo ?? 'Não disponível').length > 22 ? (u.vinculo ?? 'Não disponível').substring(0, 22) + '…' : (u.vinculo ?? 'Não disponível'),
      u.created_at,
      u.last_sign_in_at ?? 'Não disponível',
      String(u.total_acessos),
    ];
    doc.setTextColor(...COR_TEXTO);
    x = margemEsq + 4;
    for (let i = 0; i < linhas.length; i++) {
      doc.text(linhas[i], x, y + 12);
      x += larguras[i];
    }
    y += 16;

    if (tipo === 'sem_acesso_periodo' && u.dias_desde_ultimo !== null) {
      garantirEspaco(14);
      doc.setTextColor(...COR_CLARO);
      doc.text(`  Último acesso: ${u.ultimo_login ?? 'Não disponível'} (${u.dias_desde_ultimo} dias)`, margemEsq + 4, y + 10);
      y += 14;
    }
  }
  setY(y);
}

function desenharTabelaHistorico(
  doc: jsPDF,
  historico: { nome: string; email: string; perfil: string; data_hora: string; user_agent: string | null }[],
  margemEsq: number,
  larguraConteudo: number,
  getY: () => number,
  setY: (y: number) => void,
  garantirEspaco: (altura: number) => void,
  _adicionarRodape: (doc: jsPDF, data: string) => void,
  _dataGeracao: string,
) {
  if (historico.length === 0) {
    garantirEspaco(20);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COR_CLARO);
    doc.text('Nenhum login registrado no período selecionado.', margemEsq, getY() + 10);
    setY(getY() + 20);
    return;
  }

  const colunas = ['Nome', 'Perfil', 'Data/Hora', 'Dispositivo'];
  const larguras = [120, 70, 110, 180];
  let y = getY();

  doc.setFillColor(240, 245, 250);
  doc.rect(margemEsq, y, larguraConteudo, 18, 'F');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COR_TEXTO);
  let x = margemEsq + 4;
  for (let i = 0; i < colunas.length; i++) {
    doc.text(colunas[i], x, y + 12);
    x += larguras[i];
  }
  y += 18;
  doc.setFont('helvetica', 'normal');

  const rotuloPerfil: Record<string, string> = {
    admin: 'Admin', docente: 'Docente', pedagogia: 'Pedagogia', coordenacao: 'Coordenação',
  };

  for (const h of historico) {
    garantirEspaco(14);
    const dispositivo = h.user_agent
      ? h.user_agent.length > 40 ? h.user_agent.substring(0, 40) + '…' : h.user_agent
      : 'Não disponível';
    doc.setTextColor(...COR_TEXTO);
    x = margemEsq + 4;
    doc.text(h.nome.length > 25 ? h.nome.substring(0, 25) + '…' : h.nome, x, y + 12);
    x += larguras[0];
    doc.text(rotuloPerfil[h.perfil] ?? h.perfil, x, y + 12);
    x += larguras[1];
    doc.text(h.data_hora, x, y + 12);
    x += larguras[2];
    doc.setTextColor(...COR_CLARO);
    doc.text(dispositivo, x, y + 12);
    y += 14;
  }
  setY(y);
}
