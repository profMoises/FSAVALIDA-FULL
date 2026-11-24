import { supabase } from '@/lib/supabase';
import type { InteracaoPlano, Plano } from '@/lib/domain';

const PLANO_COLUNAS =
  'id, titulo, docente_id, pasta_id, arquivo_path, arquivo_nome, arquivo_tamanho, status, devolvido_por, updated_at, docente:profiles!docente_id(nome), pasta:pastas!pasta_id(nome)';

export const TAMANHO_MAXIMO_ARQUIVO = 10 * 1024 * 1024;

type ErroSupabase = { message?: string; code?: string } | null;

/**
 * Mensagens escritas pelas regras do sistema (RAISE EXCEPTION, código P0001)
 * são feitas para o usuário. Qualquer outro erro do banco é técnico e não deve
 * ser exibido, para não revelar detalhes internos do esquema.
 */
function erroAmigavel(erro: ErroSupabase, padrao: string): Error {
  if (erro?.code === 'P0001' && erro.message) return new Error(erro.message);
  return new Error(padrao);
}

const EXTENSOES_PLANILHA = ['.xls', '.xlsx'];

export function validarPlanilha(arquivo: File): string | null {
  const nome = arquivo.name.toLowerCase();
  if (!EXTENSOES_PLANILHA.some((extensao) => nome.endsWith(extensao))) {
    return 'Envie um arquivo do Excel (.xls ou .xlsx).';
  }
  if (arquivo.size > TAMANHO_MAXIMO_ARQUIVO) return 'O arquivo deve ter no máximo 10 MB.';
  return null;
}

export async function listarPlanos(): Promise<Plano[]> {
  const { data, error } = await supabase
    .from('planos_aula')
    .select(PLANO_COLUNAS)
    .order('updated_at', { ascending: false });
  if (error) throw new Error('Não foi possível carregar os planos de aula.');
  return (data ?? []) as unknown as Plano[];
}

export async function enviarPlanilha(userId: string, arquivo: File): Promise<string> {
  const nomeSeguro = arquivo.name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_');
  const caminho = `${userId}/${crypto.randomUUID()}/${nomeSeguro}`;

  const { error } = await supabase.storage.from('planos').upload(caminho, arquivo, { upsert: false });
  if (error) throw new Error('Não foi possível enviar a planilha. Tente novamente.');
  return caminho;
}

export async function criarPlano(dados: {
  titulo: string;
  pastaId: string;
  caminho: string;
  nomeArquivo: string;
  tamanho: number;
}): Promise<void> {
  const { error } = await supabase.rpc('enviar_plano', {
    p_titulo: dados.titulo,
    p_pasta_id: dados.pastaId,
    p_arquivo_path: dados.caminho,
    p_arquivo_nome: dados.nomeArquivo,
    p_arquivo_tamanho: dados.tamanho,
  });
  if (error) throw erroAmigavel(error, 'Não foi possível enviar o plano de aula. Tente novamente.');
}

export async function reenviarPlano(dados: {
  planoId: string;
  caminho: string;
  nomeArquivo: string;
  tamanho: number;
}): Promise<void> {
  const { error } = await supabase.rpc('reenviar_plano', {
    p_plano_id: dados.planoId,
    p_arquivo_path: dados.caminho,
    p_arquivo_nome: dados.nomeArquivo,
    p_arquivo_tamanho: dados.tamanho,
  });
  if (error) throw erroAmigavel(error, 'Não foi possível enviar os ajustes. Tente novamente.');
}

export async function decidirPedagogia(planoId: string, aprovar: boolean, mensagem?: string): Promise<void> {
  const { error } = await supabase.rpc('pedagogia_decidir', {
    p_plano_id: planoId,
    p_aprovar: aprovar,
    p_mensagem: mensagem ?? null,
  });
  if (error) throw erroAmigavel(error, 'Não foi possível concluir a ação. Tente novamente.');
}

export async function decidirCoordenacao(planoId: string, publicar: boolean, mensagem?: string): Promise<void> {
  const { error } = await supabase.rpc('coordenacao_decidir', {
    p_plano_id: planoId,
    p_publicar: publicar,
    p_mensagem: mensagem ?? null,
  });
  if (error) throw erroAmigavel(error, 'Não foi possível concluir a ação. Tente novamente.');
}

export async function excluirPlano(plano: { id: string; arquivo_path: string }): Promise<void> {
  const { error } = await supabase.rpc('excluir_plano', { p_plano_id: plano.id });
  if (error) throw erroAmigavel(error, 'Não foi possível excluir o plano de aula.');

  const { error: erroArquivo } = await supabase.storage.from('planos').remove([plano.arquivo_path]);
  if (erroArquivo) {
    console.error('Falha ao remover arquivo do storage:', erroArquivo);
  }
}

export async function listarInteracoes(): Promise<InteracaoPlano[]> {
  const { data, error } = await supabase
    .from('plano_interacoes')
    .select('id, plano_id, autor_id, autor_perfil, tipo, mensagem, criado_at, autor:profiles!autor_id(nome)')
    .order('criado_at', { ascending: true });
  if (error) throw new Error('Não foi possível carregar o histórico dos planos.');
  return (data ?? []) as unknown as InteracaoPlano[];
}

export async function abrirPlanilha(caminho: string): Promise<void> {
  const { data, error } = await supabase.storage.from('planos').createSignedUrl(caminho, 300);
  if (error || !data?.signedUrl) throw new Error('Não foi possível abrir a planilha. Tente novamente.');
  window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
}
