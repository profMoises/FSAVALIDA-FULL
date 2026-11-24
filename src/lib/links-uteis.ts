import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

export type TipoLink = 'link_externo' | 'arquivo_download';

export type LinkUtil = {
  id: string;
  titulo: string;
  descricao: string | null;
  url: string | null;
  tipo: TipoLink;
  icone: string;
  ordem: number;
  ativo: boolean;
  criado_por: string | null;
  criado_em: string;
  atualizado_em: string;
};

export type LinkUtilInput = {
  id?: string;
  titulo: string;
  descricao: string | null;
  url: string | null;
  tipo: TipoLink;
  icone: string;
  ordem: number;
  ativo: boolean;
};

function erroAmigavel(error: { code?: string; message?: string } | null, padrao: string): Error {
  if (error?.code === 'P0001' && error.message) return new Error(error.message);
  return new Error(padrao);
}

export async function listarLinksAtivos(): Promise<LinkUtil[]> {
  const { data, error } = await supabase
    .from('links_uteis')
    .select('id, titulo, descricao, url, tipo, icone, ordem, ativo, criado_por, criado_em, atualizado_em')
    .eq('ativo', true)
    .order('ordem', { ascending: true });
  if (error) throw new Error('Não foi possível carregar os links úteis.');
  return (data ?? []) as LinkUtil[];
}

export async function listarTodosLinks(): Promise<LinkUtil[]> {
  const { data, error } = await supabase
    .from('links_uteis')
    .select('id, titulo, descricao, url, tipo, icone, ordem, ativo, criado_por, criado_em, atualizado_em')
    .order('ordem', { ascending: true });
  if (error) throw new Error('Não foi possível carregar os links úteis.');
  return (data ?? []) as LinkUtil[];
}

export async function salvarLink(input: LinkUtilInput): Promise<void> {
  const payload = {
    titulo: input.titulo,
    descricao: input.descricao,
    url: input.url,
    tipo: input.tipo,
    icone: input.icone,
    ordem: input.ordem,
    ativo: input.ativo,
    atualizado_em: new Date().toISOString(),
  };
  if (input.id) {
    const { error } = await supabase.from('links_uteis').update(payload).eq('id', input.id);
    if (error) throw erroAmigavel(error as { code?: string; message?: string }, 'Não foi possível salvar o link.');
  } else {
    const { error } = await supabase.from('links_uteis').insert(payload);
    if (error) throw erroAmigavel(error as { code?: string; message?: string }, 'Não foi possível criar o link.');
  }
}

export async function excluirLink(id: string): Promise<void> {
  const { error } = await supabase.from('links_uteis').delete().eq('id', id);
  if (error) throw new Error('Não foi possível excluir o link.');
}

export const TAMANHO_MAXIMO_ARQUIVO_LINK = 10 * 1024 * 1024;

export const EXTENSOES_PERMITIDAS_LINK = [
  '.pdf', '.docx', '.xlsx', '.pptx', '.doc', '.xls', '.ppt',
  '.odt', '.ods', '.odp', '.csv', '.txt', '.png', '.jpg', '.jpeg',
];

export function validarArquivoLink(arquivo: File): string | null {
  const nome = arquivo.name.toLowerCase();
  if (!EXTENSOES_PERMITIDAS_LINK.some((extensao) => nome.endsWith(extensao))) {
    return `Tipo de arquivo não permitido. Use: ${EXTENSOES_PERMITIDAS_LINK.join(', ')}.`;
  }
  if (arquivo.size > TAMANHO_MAXIMO_ARQUIVO_LINK) return 'O arquivo deve ter no máximo 10 MB.';
  return null;
}

export async function fazerUploadArquivo(conteudo: File): Promise<string> {
  const invalido = validarArquivoLink(conteudo);
  if (invalido) throw new Error(invalido);

  const corpo = new FormData();
  corpo.append('arquivo', conteudo, conteudo.name);
  const { data, error } = await supabase.functions.invoke<{ caminho?: string }>('links-uteis-upload', {
    body: corpo,
  });

  if (error) {
    let mensagem = 'Não foi possível enviar o arquivo. Tente novamente.';
    if (error instanceof FunctionsHttpError) {
      try {
        const resposta = (await error.context.json()) as { error?: string };
        if (resposta.error) mensagem = resposta.error;
      } catch {
        // resposta sem JSON: mantém a mensagem padrão
      }
    }
    throw new Error(mensagem);
  }
  if (!data?.caminho) throw new Error('Não foi possível enviar o arquivo. Tente novamente.');
  return data.caminho;
}

export async function obterUrlDownload(caminho: string): Promise<string> {
  const { data, error } = await supabase.storage.from('links-uteis').createSignedUrl(caminho, 3600);
  if (error || !data?.signedUrl) throw new Error('Não foi possível gerar o link de download.');
  return data.signedUrl;
}

export async function removerArquivo(caminho: string): Promise<void> {
  await supabase.storage.from('links-uteis').remove([caminho]);
}

export const ROTULO_TIPO: Record<TipoLink, string> = {
  link_externo: 'Link externo',
  arquivo_download: 'Arquivo para download',
};
