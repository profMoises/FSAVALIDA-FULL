import type { Pasta } from '@/lib/domain';

export type PastaComProfundidade = Pasta & { profundidade: number };

export function ordenarArvore(pastas: Pasta[]): PastaComProfundidade[] {
  const porPai = new Map<string | null, Pasta[]>();
  for (const pasta of pastas) {
    const irmas = porPai.get(pasta.pai_id) ?? [];
    irmas.push(pasta);
    porPai.set(pasta.pai_id, irmas);
  }

  const resultado: PastaComProfundidade[] = [];
  const percorrer = (paiId: string | null, profundidade: number) => {
    const filhas = [...(porPai.get(paiId) ?? [])].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    for (const pasta of filhas) {
      resultado.push({ ...pasta, profundidade });
      percorrer(pasta.id, profundidade + 1);
    }
  };
  percorrer(null, 0);
  return resultado;
}

export function idsDaSubarvore(pastas: Pasta[], raizId: string): Set<string> {
  const ids = new Set<string>([raizId]);
  let mudou = true;
  while (mudou) {
    mudou = false;
    for (const pasta of pastas) {
      if (pasta.pai_id && ids.has(pasta.pai_id) && !ids.has(pasta.id)) {
        ids.add(pasta.id);
        mudou = true;
      }
    }
  }
  return ids;
}

export function caminhoDaPasta(pastas: Pasta[], pastaId: string): Pasta[] {
  const caminho: Pasta[] = [];
  let atual = pastas.find((p) => p.id === pastaId);
  while (atual) {
    caminho.unshift(atual);
    const pai: Pasta | undefined = atual.pai_id ? pastas.find((p) => p.id === atual?.pai_id) : undefined;
    atual = pai;
  }
  return caminho;
}

export function rotuloIndentado(nome: string, profundidade: number): string {
  return `${'\u00A0\u00A0\u00A0'.repeat(profundidade)}${nome}`;
}
