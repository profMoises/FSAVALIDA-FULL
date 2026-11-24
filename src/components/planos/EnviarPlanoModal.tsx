import { useState, type ChangeEvent, type FormEvent } from 'react';
import { FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import { Modal } from '@/components/Modal';
import { BTN_PRIMARY, BTN_SECONDARY, INPUT, LABEL } from '@/components/ui';
import { criarPlano, enviarPlanilha, reenviarPlano, validarPlanilha } from '@/lib/planos';
import { formatarTamanho, mensagemDeErro, type Plano } from '@/lib/domain';
import type { PastaComProfundidade } from '@/lib/folders';
import { rotuloIndentado } from '@/lib/folders';

type EnviarPlanoModalProps = {
  userId: string;
  plano?: Plano;
  pastas: PastaComProfundidade[];
  onConcluido: () => void;
  onFechar: () => void;
};

export function EnviarPlanoModal({ userId, plano, pastas, onConcluido, onFechar }: EnviarPlanoModalProps) {
  const reenvio = Boolean(plano);
  const [titulo, setTitulo] = useState('');
  const [pastaId, setPastaId] = useState(pastas[0]?.id ?? '');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const escolherArquivo = (evento: ChangeEvent<HTMLInputElement>) => {
    const escolhido = evento.target.files?.[0] ?? null;
    setErro(null);
    setArquivo(escolhido);
    if (escolhido && !titulo) setTitulo(escolhido.name.replace(/\.[^.]+$/, ''));
  };

  const enviar = async (evento: FormEvent) => {
    evento.preventDefault();
    setErro(null);
    if (!arquivo) {
      setErro('Escolha a planilha do plano de aula.');
      return;
    }
    const erroArquivo = validarPlanilha(arquivo);
    if (erroArquivo) {
      setErro(erroArquivo);
      return;
    }
    if (!reenvio && (!titulo.trim() || !pastaId)) {
      setErro('Informe o título e a pasta do plano.');
      return;
    }

    setEnviando(true);
    try {
      const caminho = await enviarPlanilha(userId, arquivo);
      if (plano) {
        await reenviarPlano({ planoId: plano.id, caminho, nomeArquivo: arquivo.name, tamanho: arquivo.size });
      } else {
        await criarPlano({
          titulo: titulo.trim(),
          pastaId,
          caminho,
          nomeArquivo: arquivo.name,
          tamanho: arquivo.size,
        });
      }
      onConcluido();
    } catch (erroEnvio) {
      setErro(mensagemDeErro(erroEnvio, 'Não foi possível enviar o plano. Tente novamente.'));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal
      titulo={reenvio ? 'Enviar ajustes' : 'Enviar plano de aula'}
      descricao={
        reenvio
          ? 'Anexe a planilha com as alterações solicitadas.'
          : 'Anexe a planilha do plano de aula para iniciar a validação.'
      }
      onFechar={onFechar}
      largura="lg"
      rodape={
        <>
          <button type="button" onClick={onFechar} disabled={enviando} className={BTN_SECONDARY}>
            Cancelar
          </button>
          <button type="submit" form="form-enviar-plano" disabled={enviando} className={BTN_PRIMARY}>
            {enviando && <Loader2 className="h-4 w-4 animate-spin" />}
            {reenvio ? 'Enviar ajustes' : 'Enviar plano'}
          </button>
        </>
      }
    >
      <form id="form-enviar-plano" onSubmit={enviar} className="space-y-5">
        {!reenvio && (
          <>
            <div>
              <label htmlFor="titulo-plano" className={LABEL}>
                Título do plano
              </label>
              <input
                id="titulo-plano"
                required
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Ex.: Plano de Automação Industrial"
                className={INPUT}
              />
            </div>
            <div>
              <label htmlFor="pasta-plano" className={LABEL}>
                Pasta
              </label>
              <select
                id="pasta-plano"
                required
                value={pastaId}
                onChange={(e) => setPastaId(e.target.value)}
                className={INPUT}
              >
                {pastas.length === 0 && <option value="">Nenhuma pasta disponível</option>}
                {pastas.map((pasta) => (
                  <option key={pasta.id} value={pasta.id}>
                    {rotuloIndentado(pasta.nome, pasta.profundidade)}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

        <div>
          <span className={LABEL}>Planilha (Excel)</span>
          <label
            htmlFor="arquivo-plano"
            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/60 px-6 py-8 text-center transition hover:border-teal-500 hover:bg-teal-50/40"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-white text-teal-700 shadow-sm">
              {arquivo ? <FileSpreadsheet className="h-5 w-5" /> : <Upload className="h-5 w-5" />}
            </span>
            {arquivo ? (
              <>
                <span className="max-w-full truncate text-sm font-medium text-slate-900">{arquivo.name}</span>
                <span className="text-xs text-slate-500">{formatarTamanho(arquivo.size)}</span>
              </>
            ) : (
              <>
                <span className="text-sm font-medium text-slate-700">Clique para escolher a planilha</span>
                <span className="text-xs text-slate-500">Arquivos .xls ou .xlsx de até 10 MB</span>
              </>
            )}
            <input
              id="arquivo-plano"
              type="file"
              accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              onChange={escolherArquivo}
            />
          </label>
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
