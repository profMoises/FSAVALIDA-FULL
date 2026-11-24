export const REQUISITOS_SENHA = [
  'Mínimo de 8 caracteres',
  'Pelo menos uma letra maiúscula',
  'Pelo menos uma letra minúscula',
  'Pelo menos um número',
  'Pelo menos um caractere especial (!, @, #, ...)',
];

export function mensagemDeSenhaFraca(senha: string): string | null {
  if (senha.length < 8) return 'Use pelo menos 8 caracteres.';
  if (!/[A-Z]/.test(senha)) return 'Inclua pelo menos uma letra maiúscula.';
  if (!/[a-z]/.test(senha)) return 'Inclua pelo menos uma letra minúscula.';
  if (!/[0-9]/.test(senha)) return 'Inclua pelo menos um número.';
  if (!/[^A-Za-z0-9]/.test(senha)) return 'Inclua pelo menos um símbolo, como ! ou @.';
  return null;
}
