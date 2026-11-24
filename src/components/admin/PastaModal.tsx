import { useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { Modal } from '@/components/Modal';
import { BTN_PRIMARY, BTN_SECONDARY, INPUT, LABEL } from '@/components/ui';
import { idsDaSubarvore, ordenarArvore, rotuloIndentado } from '@/lib/folders';
import { salvarPasta } from '@/lib/pastas';
import { mensagemDeErro, type Pasta } from '@/lib/domain';

type PastaModalProps = {
  pasta?: Pasta;
  paiPadrao: string | null;
  pastas: Pasta[];
  onSalvo: () => void;
  onFechar: () => void;
};

export function PastaModal({ pasta, paiPadrao, pastas, onSalvo, onFechar }: PastaModalProps) {
  const [nome, setNome] = useState(pasta?.nome ?? '');
  const [paiId, setPaiId] = useState<string>(pasta ? (pasta.pai_id ?? '') : (paiPadrao ?? ''));
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const proibidas = pasta ? idsDaSubarvore(pastas, pasta.id) : new Set<string>();
  const opcoes = ordenarArvore(pastas).filter((item) => !proibidas.has(item.id));

  const salvar = async (evento: FormEvent) => {
    evento.preventDefault();
    if (!nome.trim()) {
      setErro('Informe o nome da pasta.');
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      await salvarPasta({ id: pasta?.id, nome: nome.trim(), pai_id: paiId || null });
      onSalvo();
    } catch (erroSalvar) {
      setErro(mensagemDeErro(erroSalvar, 'Não foi possível salvar a pasta.'));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal
      titulo={pasta ? 'Editar pasta' : 'Nova pasta'}
      descricao="Pastas podem conter subpastas."
      onFechar={onFechar}
      rodape={
        <>
          <button type="button" onClick={onFechar} disabled={salvando} className={BTN_SECONDARY}>
            Cancelar
          </button>
          <button type="submit" form="form-pasta" disabled={salvando} className={BTN_PRIMARY}>
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar
          </button>
        </>
      }
    >
      <form id="form-pasta" onSubmit={salvar} className="space-y-5">
        <div>
          <label htmlFor="nome-pasta" className={LABEL}>
            Nome
          </label>
          <input
            id="nome-pasta"
            required
            autoFocus
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex.: Técnico em Automação Industrial"
            className={INPUT}
          />
        </div>
        <div>
          <label htmlFor="pai-pasta" className={LABEL}>
            Localizada dentro de
          </label>
          <select id="pai-pasta" value={paiId} onChange={(e) => setPaiId(e.target.value)} className={INPUT}>
            <option value="">Raiz (pasta principal)</option>
            {opcoes.map((item) => (
              <option key={item.id} value={item.id}>
                {rotuloIndentado(item.nome, item.profundidade)}
              </option>
            ))}
          </select>
        </div>

        {erro && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {erro}
          </p>
        )}
      </form>
    </Modal>
  );
}
