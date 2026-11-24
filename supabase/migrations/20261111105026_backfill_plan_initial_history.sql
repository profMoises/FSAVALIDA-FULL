/*
# Completar o início do histórico dos planos existentes

1. Objetivo
- Registrar o envio original e o recebimento inicial pela pedagogia para planos criados antes do histórico existir.

2. Segurança e integridade
- A operação é idempotente e não duplica eventos já registrados.
- Nenhum plano, arquivo ou orientação existente é alterado.
- Os eventos usam o docente responsável e a data original de criação do plano.
*/

INSERT INTO public.plano_interacoes (plano_id, autor_id, autor_perfil, tipo, criado_at)
SELECT p.id, p.docente_id, 'docente', 'envio_docente', p.created_at
FROM public.planos_aula p
WHERE NOT EXISTS (
  SELECT 1 FROM public.plano_interacoes i
  WHERE i.plano_id = p.id AND i.tipo = 'envio_docente'
);

INSERT INTO public.plano_interacoes (plano_id, autor_id, autor_perfil, tipo, criado_at)
SELECT p.id, p.docente_id, 'docente', 'recebimento_pedagogia', p.created_at
FROM public.planos_aula p
WHERE NOT EXISTS (
  SELECT 1 FROM public.plano_interacoes i
  WHERE i.plano_id = p.id AND i.tipo = 'recebimento_pedagogia'
);
