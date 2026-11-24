import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';
import { listarUsuarios } from '@/lib/usuarios';
import { listarPastas } from '@/lib/pastas';
import { FunctionsHttpError } from '@supabase/supabase-js';
import type { Pasta, Perfil } from '@/lib/domain';

export type LinhaPlanilha = {
  nome: string;
  email: string;
  senha: string;
  cursos: string[];
};

export type CursoMapeado = {
  nomeOriginal: string;
  pastaId: string | null;
  pastaNome: string | null;
  ambiguo: boolean;
};

export type LinhaValidada = {
  linha: number;
  nome: string;
  email: string;
  senha: string;
  cursos: CursoMapeado[];
  emailValido: boolean;
  senhaValida: boolean;
  nomeValido: boolean;
  usuarioExistente: boolean;
  perfilExistente: Perfil | null;
  pendencias: string[];
};

export type ResumoValidacao = {
  total: number;
  novos: number;
  existentes: number;
  cursosIdentificados: number;
  cursosNaoIdentificados: number;
  registrosComPendencia: number;
};

type ResultadoImport = {
  email: string;
  nome: string;
  acao: 'criado' | 'existente' | 'erro';
  vinculos_adicionados: number;
  vinculos_existentes: number;
  erro?: string;
};

export type ResultadoImportacao = {
  resultados: ResultadoImport[];
  resumo: {
    criados: number;
    existentes: number;
    erros: number;
    vinculos_adicionados: number;
    vinculos_existentes: number;
  };
};

const MIN_SENHA = 6;

function normalizarTexto(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function encontrarColuna(linha: Record<string, unknown>, candidatos: string[]): string | null {
  const chaves = Object.keys(linha);
  for (const candidato of candidatos) {
    const alvo = normalizarTexto(candidato);
    const encontrada = chaves.find((k) => normalizarTexto(k) === alvo);
    if (encontrada) return encontrada;
  }
  for (const candidato of candidatos) {
    const alvo = normalizarTexto(candidato);
    const encontrada = chaves.find((k) => normalizarTexto(k).includes(alvo));
    if (encontrada) return encontrada;
  }
  return null;
}

function extrairValor(linha: Record<string, unknown>, coluna: string | null): string {
  if (!coluna) return '';
  const valor = linha[coluna];
  if (valor === null || valor === undefined) return '';
  return String(valor).trim();
}

export async function lerPlanilha(file: File): Promise<LinhaPlanilha[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const primeiraAba = workbook.SheetNames[0];
  if (!primeiraAba) throw new Error('A planilha não contém nenhuma aba.');
  const sheet = workbook.Sheets[primeiraAba];
  const linhas = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  if (linhas.length === 0) throw new Error('A planilha está vazia.');

  const colNome = encontrarColuna(linhas[0], ['Nome completo', 'Nome', 'Nome do docente']);
  const colEmail = encontrarColuna(linhas[0], ['E-mail', 'Email', 'E-mail de acesso']);
  const colSenha = encontrarColuna(linhas[0], ['Senha', 'Senha inicial']);
  const colCursos = encontrarColuna(linhas[0], ['Cursos', 'Curso', 'Pastas', 'Pasta']);

  if (!colNome || !colEmail || !colSenha || !colCursos) {
    const faltando: string[] = [];
    if (!colNome) faltando.push('Nome completo');
    if (!colEmail) faltando.push('E-mail');
    if (!colSenha) faltando.push('Senha');
    if (!colCursos) faltando.push('Cursos');
    throw new Error(`Colunas obrigatórias não encontradas: ${faltando.join(', ')}. Verifique os cabeçalhos da planilha.`);
  }

  return linhas
    .map((linha) => {
      const nome = extrairValor(linha, colNome);
      const email = extrairValor(linha, colEmail);
      const senha = extrairValor(linha, colSenha);
      const cursosStr = extrairValor(linha, colCursos);
      const cursos = cursosStr
        .split(';')
        .map((c) => c.trim())
        .filter((c) => c.length > 0);
      return { nome, email, senha, cursos };
    })
    .filter((l) => l.nome || l.email || l.senha || l.cursos.length > 0);
}

export function mapearCursos(cursos: string[], pastas: Pasta[]): CursoMapeado[] {
  return cursos.map((curso) => {
    const normalizado = normalizarTexto(curso);
    const correspondencias = pastas.filter((p) => normalizarTexto(p.nome) === normalizado);
    if (correspondencias.length === 1) {
      return { nomeOriginal: curso, pastaId: correspondencias[0].id, pastaNome: correspondencias[0].nome, ambiguo: false };
    }
    if (correspondencias.length > 1) {
      return { nomeOriginal: curso, pastaId: null, pastaNome: null, ambiguo: true };
    }
    const parciais = pastas.filter((p) => normalizarTexto(p.nome).includes(normalizado) || normalizado.includes(normalizarTexto(p.nome)));
    if (parciais.length === 1) {
      return { nomeOriginal: curso, pastaId: parciais[0].id, pastaNome: parciais[0].nome, ambiguo: false };
    }
    return { nomeOriginal: curso, pastaId: null, pastaNome: null, ambiguo: parciais.length > 1 };
  });
}

export async function validarPlanilha(linhas: LinhaPlanilha[]): Promise<{ linhas: LinhaValidada[]; resumo: ResumoValidacao }> {
  const [usuarios, pastas] = await Promise.all([listarUsuarios(), listarPastas()]);
  const emailsExistentes = new Map(usuarios.map((u) => [u.email.toLowerCase(), u.perfil]));

  const validadas: LinhaValidada[] = linhas.map((linha, idx) => {
    const cursos = mapearCursos(linha.cursos, pastas);
    const emailValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(linha.email);
    const senhaValida = linha.senha.length >= MIN_SENHA;
    const nomeValido = linha.nome.trim().length >= 2;
    const perfilExistente = emailsExistentes.get(linha.email.toLowerCase()) ?? null;
    const usuarioExistente = perfilExistente !== null;

    const pendencias: string[] = [];
    if (!nomeValido) pendencias.push('Nome ausente ou muito curto.');
    if (!emailValido) pendencias.push('E-mail inválido.');
    if (!senhaValida) pendencias.push(`Senha deve ter pelo menos ${MIN_SENHA} caracteres.`);
    if (usuarioExistente && perfilExistente !== 'docente') {
      pendencias.push(`Usuário existente com perfil "${perfilExistente}" — não será alterado.`);
    }
    const naoIdentificados = cursos.filter((c) => !c.pastaId);
    if (naoIdentificados.length > 0) {
      pendencias.push(`Curso(s) não identificado(s): ${naoIdentificados.map((c) => c.nomeOriginal).join(', ')}`);
    }
    const ambíguos = cursos.filter((c) => c.ambiguo);
    if (ambíguos.length > 0) {
      pendencias.push(`Curso(s) ambíguo(s): ${ambíguos.map((c) => c.nomeOriginal).join(', ')}`);
    }
    const nomesDuplicados = cursos.map((c) => c.nomeOriginal.toLowerCase());
    if (new Set(nomesDuplicados).size !== nomesDuplicados.length) {
      pendencias.push('Cursos duplicados na mesma linha.');
    }

    return {
      linha: idx + 2,
      nome: linha.nome,
      email: linha.email,
      senha: linha.senha,
      cursos,
      emailValido,
      senhaValida,
      nomeValido,
      usuarioExistente,
      perfilExistente,
      pendencias,
    };
  });

  const cursosTodos = validadas.flatMap((l) => l.cursos);
  const resumo: ResumoValidacao = {
    total: validadas.length,
    novos: validadas.filter((l) => !l.usuarioExistente).length,
    existentes: validadas.filter((l) => l.usuarioExistente && l.perfilExistente === 'docente').length,
    cursosIdentificados: cursosTodos.filter((c) => c.pastaId).length,
    cursosNaoIdentificados: cursosTodos.filter((c) => !c.pastaId).length,
    registrosComPendencia: validadas.filter((l) => l.pendencias.length > 0).length,
  };

  return { linhas: validadas, resumo };
}

export async function executarImportacao(
  linhas: LinhaValidada[],
  correcoes: Record<number, Record<string, string>>,
): Promise<ResultadoImportacao> {
  const usuarios = linhas
    .filter((l) => l.emailValido && l.senhaValida && l.nomeValido)
    .filter((l) => !l.usuarioExistente || l.perfilExistente === 'docente')
    .map((l) => {
      const correcaoLinha = correcoes[l.linha] ?? {};
      const pastaIds = l.cursos
        .map((c) => correcaoLinha[c.nomeOriginal] ?? c.pastaId)
        .filter((id): id is string => id !== null && id !== '' && id !== 'null');
      return {
        nome: l.nome,
        email: l.email,
        senha: l.senha,
        pasta_ids: [...new Set(pastaIds)],
      };
    });

  if (usuarios.length === 0) {
    return {
      resultados: [],
      resumo: { criados: 0, existentes: 0, erros: 0, vinculos_adicionados: 0, vinculos_existentes: 0 },
    };
  }

  const { data, error } = await supabase.functions.invoke<ResultadoImportacao>('admin-users', {
    body: { action: 'import-batch', usuarios },
  });

  if (error) {
    let mensagem = 'Não foi possível concluir a importação.';
    if (error instanceof FunctionsHttpError) {
      try {
        const corpo = (await error.context.json()) as { error?: string };
        if (corpo.error) mensagem = corpo.error;
      } catch {
        // mantém mensagem padrão
      }
    }
    throw new Error(mensagem);
  }

  if (!data) throw new Error('Não foi possível concluir a importação.');
  return data;
}

function formatarDataHora(iso: string): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(iso));
}

export async function exportarUsuarios(perfilFiltro: Perfil | 'todos', formato: 'xlsx' | 'csv'): Promise<void> {
  const [usuarios, pastas] = await Promise.all([listarUsuarios(), listarPastas()]);
  const mapaPastas = new Map(pastas.map((p) => [p.id, p.nome]));

  let filtrados = usuarios;
  if (perfilFiltro !== 'todos') {
    filtrados = usuarios.filter((u) => u.perfil === perfilFiltro);
  }

  const { data: authData } = await supabase
    .from('profiles')
    .select('id, created_at');

  const mapaCreated = new Map((authData ?? []).map((p: { id: string; created_at: string }) => [p.id, p.created_at]));

  const { data: loginData } = await supabase
    .from('login_eventos')
    .select('user_id, criado_em')
    .order('criado_em', { ascending: false });

  const ultimoLogin = new Map<string, string>();
  for (const log of loginData ?? []) {
    const l = log as { user_id: string; criado_em: string };
    if (!ultimoLogin.has(l.user_id)) {
      ultimoLogin.set(l.user_id, l.criado_em);
    }
  }

  const rotuloPerfil: Record<string, string> = {
    admin: 'Administrador',
    docente: 'Docente',
    pedagogia: 'Pedagogia (NEP)',
    coordenacao: 'Coordenação técnica',
  };

  const linhas = filtrados.map((u) => {
    const cursosNomes = u.pasta_ids.map((id) => mapaPastas.get(id) ?? '—').join('; ');
    return {
      'Nome completo': u.nome,
      'E-mail': u.email,
      'Perfil': rotuloPerfil[u.perfil] ?? u.perfil,
      'Cursos': cursosNomes,
      'Data de cadastro': mapaCreated.get(u.id) ? formatarDataHora(mapaCreated.get(u.id)!) : '',
      'Último acesso': ultimoLogin.get(u.id) ? formatarDataHora(ultimoLogin.get(u.id)!) : '',
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(linhas);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Usuários');

  const nomeArquivo = `usuarios_${perfilFiltro}_${new Date().toISOString().split('T')[0]}`;

  if (formato === 'csv') {
    XLSX.writeFile(workbook, `${nomeArquivo}.csv`, { bookType: 'csv' });
  } else {
    XLSX.writeFile(workbook, `${nomeArquivo}.xlsx`, { bookType: 'xlsx' });
  }
}

export function baixarRelatorioImportacao(resultado: ResultadoImportacao): void {
  const linhas = resultado.resultados.map((r) => ({
    'Nome': r.nome,
    'E-mail': r.email,
    'Resultado': r.acao === 'criado' ? 'Conta criada' : r.acao === 'existente' ? 'Já existente' : 'Erro',
    'Vínculos adicionados': r.vinculos_adicionados,
    'Vínculos já existentes': r.vinculos_existentes,
    'Observação': r.erro ?? '',
  }));

  const worksheet = XLSX.utils.json_to_sheet(linhas);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Importação');

  XLSX.writeFile(workbook, `relatorio_importacao_${new Date().toISOString().split('T')[0]}.xlsx`, {
    bookType: 'xlsx',
  });
}
