import { useState, useMemo, useCallback } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Upload,
} from 'lucide-react';
import { Modal } from '@/components/Modal';
import { BTN_PRIMARY, BTN_SECONDARY, CARD } from '@/components/ui';
import { listarPastas } from '@/lib/pastas';
import { mensagemDeErro } from '@/lib/domain';
import type { Pasta } from '@/lib/domain';
import {
  baixarRelatorioImportacao,
  executarImportacao,
  lerPlanilha,
  validarPlanilha,
  type LinhaValidada,
  type ResumoValidacao,
  type ResultadoImportacao,
} from '@/lib/import-export-usuarios';

type Etapa = 'upload' | 'previsualizacao' | 'resultado';

export function ImportarUsuariosModal({ onFechar, onConcluido }: { onFechar: () => void; onConcluido: () => void }) {
  const [etapa, setEtapa] = useState<Etapa>('upload');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [linhas, setLinhas] = useState<LinhaValidada[]>([]);
  const [resumo, setResumo] = useState<ResumoValidacao | null>(null);
  const [correcoes, setCorrecoes] = useState<Record<number, Record<string, string>>>({});
  const [pastas, setPastas] = useState<Pasta[]>([]);
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null);

  const carregarPastas = useCallback(async () => {
    if (pastas.length > 0) return;
    const lista = await listarPastas();
    setPastas(lista);
  }, [pastas.length]);

  const processarArquivo = async (file: File) => {
    setProcessando(true);
    setErro(null);
    try {
      const linhasLidas = await lerPlanilha(file);
      if (linhasLidas.length === 0) {
        setErro('Nenhuma linha válida encontrada na planilha.');
        return;
      }
      await carregarPastas();
      const { linhas: validadas, resumo: res } = await validarPlanilha(linhasLidas);
      setLinhas(validadas);
      setResumo(res);
      setArquivo(file);
      setEtapa('previsualizacao');
    } catch (e) {
      setErro(mensagemDeErro(e, 'Não foi possível ler o arquivo.'));
    } finally {
      setProcessando(false);
    }
  };

  const onSelecionarArquivo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processarArquivo(file);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) processarArquivo(file);
  };

  const corrigirCurso = (linhaIdx: number, cursoNome: string, pastaId: string) => {
    setCorrecoes((atual) => ({
      ...atual,
      [linhaIdx]: { ...(atual[linhaIdx] ?? {}), [cursoNome]: pastaId },
    }));
  };

  const temPendencias = useMemo(() => {
    return linhas.some((l) => {
      const pendenciasReais = l.pendencias.filter((p) => !p.includes('Curso(s) não identificado') && !p.includes('Curso(s) ambíguo'));
      if (pendenciasReais.length > 0) return true;
      const cursosSemCorrecao = l.cursos.some((c) => {
        const correcao = correcoes[l.linha]?.[c.nomeOriginal];
        return !c.pastaId && !correcao;
      });
      if (cursosSemCorrecao) return true;
      return false;
    });
  }, [linhas, correcoes]);

  const linhasImportaveis = useMemo(() => {
    return linhas.filter((l) => {
      if (!l.emailValido || !l.senhaValida || !l.nomeValido) return false;
      if (l.usuarioExistente && l.perfilExistente !== 'docente') return false;
      const cursosSemCorrecao = l.cursos.some((c) => {
        const correcao = correcoes[l.linha]?.[c.nomeOriginal];
        return !c.pastaId && !correcao;
      });
      return !cursosSemCorrecao;
    });
  }, [linhas, correcoes]);

  const confirmar = async () => {
    setProcessando(true);
    setErro(null);
    try {
      const res = await executarImportacao(linhas, correcoes);
      setResultado(res);
      setEtapa('resultado');
      onConcluido();
    } catch (e) {
      setErro(mensagemDeErro(e, 'Não foi possível concluir a importação.'));
    } finally {
      setProcessando(false);
    }
  };

  const reiniciar = () => {
    setEtapa('upload');
    setArquivo(null);
    setLinhas([]);
    setResumo(null);
    setCorrecoes({});
    setResultado(null);
    setErro(null);
  };

  return (
    <Modal
      titulo="Importar usuários em lote"
      descricao="Cadastre docentes e vincule-os a cursos a partir de uma planilha."
      onFechar={onFechar}
      largura="3xl"
      rodape={
        etapa === 'upload' ? (
          <button type="button" onClick={onFechar} className={BTN_SECONDARY}>
            Cancelar
          </button>
        ) : etapa === 'previsualizacao' ? (
          <>
            <button type="button" onClick={reiniciar} className={BTN_SECONDARY}>
              Trocar arquivo
            </button>
            <button type="button" onClick={onFechar} className={BTN_SECONDARY}>
              Cancelar
            </button>
            <button
              type="button"
              onClick={confirmar}
              disabled={processando || temPendencias || linhasImportaveis.length === 0}
              className={BTN_PRIMARY}
            >
              {processando && <Loader2 className="h-4 w-4 animate-spin" />}
              Importar {linhasImportaveis.length} docente{linhasImportaveis.length === 1 ? '' : 's'}
            </button>
          </>
        ) : (
          <>
            {resultado && resultado.resultados.length > 0 && (
              <button type="button" onClick={() => baixarRelatorioImportacao(resultado)} className={BTN_SECONDARY}>
                <FileSpreadsheet className="h-4 w-4" />
                Baixar relatório
              </button>
            )}
            <button type="button" onClick={onFechar} className={BTN_PRIMARY}>
              Concluir
            </button>
          </>
        )
      }
    >
      {erro && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</div>
      )}

      {etapa === 'upload' && (
        <div className="space-y-4">
          <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <p className="font-medium text-slate-700">Formato da planilha</p>
            <p className="mt-1">
              A planilha deve conter quatro colunas: <strong>Nome completo</strong>, <strong>E-mail</strong>,{' '}
              <strong>Senha</strong> e <strong>Cursos</strong>. Na coluna Cursos, separe múltiplos cursos com ponto e vírgula (;).
            </p>
            <p className="mt-1.5 text-xs text-slate-500">
              Exemplo: Eletrotécnica; Eletromecânica; Eletrônica
            </p>
          </div>

          <label
            htmlFor="arquivo-import"
            onDrop={onDrop}
            onDragOver={(e) => e.preventDefault()}
            className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/60 px-6 py-12 text-center transition hover:border-teal-500 hover:bg-teal-50/40"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-white text-teal-700 shadow-sm">
              {processando ? <Loader2 className="h-6 w-6 animate-spin" /> : <Upload className="h-6 w-6" />}
            </span>
            {processando ? (
              <span className="text-sm font-medium text-slate-700">Processando planilha...</span>
            ) : (
              <>
                <span className="text-sm font-medium text-slate-700">
                  Clique ou arraste o arquivo aqui
                </span>
                <span className="text-xs text-slate-500">Formatos aceitos: .xlsx, .csv</span>
              </>
            )}
            <input
              id="arquivo-import"
              type="file"
              accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              className="sr-only"
              onChange={onSelecionarArquivo}
              disabled={processando}
            />
          </label>
        </div>
      )}

      {etapa === 'previsualizacao' && resumo && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className={`${CARD} p-3`}>
              <p className="text-xs text-slate-500">Total de docentes</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{resumo.total}</p>
            </div>
            <div className={`${CARD} p-3`}>
              <p className="text-xs text-slate-500">Novas contas</p>
              <p className="mt-1 text-2xl font-bold text-teal-700">{resumo.novos}</p>
            </div>
            <div className={`${CARD} p-3`}>
              <p className="text-xs text-slate-500">Já cadastrados</p>
              <p className="mt-1 text-2xl font-bold text-blue-700">{resumo.existentes}</p>
            </div>
            <div className={`${CARD} p-3`}>
              <p className="text-xs text-slate-500">Cursos identificados</p>
              <p className="mt-1 text-2xl font-bold text-emerald-700">{resumo.cursosIdentificados}</p>
            </div>
            <div className={`${CARD} p-3`}>
              <p className="text-xs text-slate-500">Cursos não identificados</p>
              <p className="mt-1 text-2xl font-bold text-amber-700">{resumo.cursosNaoIdentificados}</p>
            </div>
            <div className={`${CARD} p-3`}>
              <p className="text-xs text-slate-500">Registros com pendência</p>
              <p className="mt-1 text-2xl font-bold text-red-700">{resumo.registrosComPendencia}</p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Linha</th>
                  <th className="px-3 py-2 font-medium">Nome</th>
                  <th className="px-3 py-2 font-medium">E-mail</th>
                  <th className="px-3 py-2 font-medium">Senha</th>
                  <th className="px-3 py-2 font-medium">Cursos</th>
                  <th className="px-3 py-2 font-medium">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {linhas.map((l) => {
                  const temPendencia = l.pendencias.length > 0;
                  const cursosSemCorrecao = l.cursos.some((c) => {
                    const correcao = correcoes[l.linha]?.[c.nomeOriginal];
                    return !c.pastaId && !correcao;
                  });
                  return (
                    <tr key={l.linha} className={temPendencia ? 'bg-amber-50/30' : ''}>
                      <td className="px-3 py-2 text-slate-500">{l.linha}</td>
                      <td className="max-w-[160px] truncate px-3 py-2 font-medium text-slate-900" title={l.nome}>{l.nome}</td>
                      <td className="max-w-[180px] truncate px-3 py-2 text-slate-600" title={l.email}>{l.email}</td>
                      <td className="px-3 py-2">
                        {l.senhaValida ? (
                          <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                            Definida
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-red-600">
                            <AlertCircle className="h-3.5 w-3.5" />
                            Inválida
                          </span>
                        )}
                      </td>
                      <td className="max-w-[300px] px-3 py-2">
                        <div className="space-y-1">
                          {l.cursos.map((c) => {
                            const correcao = correcoes[l.linha]?.[c.nomeOriginal];
                            const resolvedId = correcao ?? c.pastaId;
                            if (resolvedId) {
                              const pasta = pastas.find((p) => p.id === resolvedId);
                              return (
                                <span key={c.nomeOriginal} className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                                  {pasta?.nome ?? c.nomeOriginal}
                                </span>
                              );
                            }
                            return (
                              <div key={c.nomeOriginal} className="flex items-center gap-2">
                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                                  {c.nomeOriginal}
                                </span>
                                <select
                                  value=""
                                  onChange={(e) => corrigirCurso(l.linha, c.nomeOriginal, e.target.value)}
                                  className="h-7 rounded border border-slate-300 px-1 text-xs text-slate-700 focus:border-teal-600 focus:outline-none"
                                >
                                  <option value="">Selecionar...</option>
                                  {pastas.map((p) => (
                                    <option key={p.id} value={p.id}>{p.nome}</option>
                                  ))}
                                </select>
                              </div>
                            );
                          })}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {l.usuarioExistente ? (
                          <span className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                            {l.perfilExistente === 'docente' ? 'Existente' : `Conflito: ${l.perfilExistente}`}
                          </span>
                        ) : temPendencia && !l.emailValido ? (
                          <span className="inline-flex rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                            Pendência
                          </span>
                        ) : cursosSemCorrecao ? (
                          <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                            Aguardando curso
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                            Pronto
                          </span>
                        )}
                        {temPendencia && (
                          <div className="mt-1 space-y-0.5">
                            {l.pendencias.map((p, i) => (
                              <p key={i} className="text-xs text-red-600">{p}</p>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {temPendencias && (
            <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <p className="flex items-center gap-2 font-medium">
                <AlertCircle className="h-4 w-4" />
                Há pendências a serem resolvidas
              </p>
              <p className="mt-1">
                Corrija os cursos não identificados selecionando a pasta correspondente, ou cancele e ajuste a planilha.
                Registros com e-mail inválido, senha inválida ou perfil conflitante não serão importados.
              </p>
            </div>
          )}
        </div>
      )}

      {etapa === 'resultado' && resultado && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className={`${CARD} p-3`}>
              <p className="text-xs text-slate-500">Contas criadas</p>
              <p className="mt-1 text-2xl font-bold text-teal-700">{resultado.resumo.criados}</p>
            </div>
            <div className={`${CARD} p-3`}>
              <p className="text-xs text-slate-500">Já existentes</p>
              <p className="mt-1 text-2xl font-bold text-blue-700">{resultado.resumo.existentes}</p>
            </div>
            <div className={`${CARD} p-3`}>
              <p className="text-xs text-slate-500">Vínculos adicionados</p>
              <p className="mt-1 text-2xl font-bold text-emerald-700">{resultado.resumo.vinculos_adicionados}</p>
            </div>
            <div className={`${CARD} p-3`}>
              <p className="text-xs text-slate-500">Registros com erro</p>
              <p className="mt-1 text-2xl font-bold text-red-700">{resultado.resumo.erros}</p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Nome</th>
                  <th className="px-3 py-2 font-medium">E-mail</th>
                  <th className="px-3 py-2 font-medium">Resultado</th>
                  <th className="px-3 py-2 font-medium">Vínculos</th>
                  <th className="px-3 py-2 font-medium">Observação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {resultado.resultados.map((r, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2 font-medium text-slate-900">{r.nome}</td>
                    <td className="px-3 py-2 text-slate-600">{r.email}</td>
                    <td className="px-3 py-2">
                      {r.acao === 'criado' ? (
                        <span className="inline-flex rounded-full bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700">Conta criada</span>
                      ) : r.acao === 'existente' ? (
                        <span className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">Já existente</span>
                      ) : (
                        <span className="inline-flex rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">Erro</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {r.vinculos_adicionados > 0 ? `+${r.vinculos_adicionados}` : '—'}
                      {r.vinculos_existentes > 0 ? ` (${r.vinculos_existentes} já existiam)` : ''}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-500">{r.erro ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {resultado.resumo.erros > 0 && (
            <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <p>
                {resultado.resumo.erros} registro{resultado.resumo.erros === 1 ? '' : 's'} não foi/foram importado{resultado.resumo.erros === 1 ? '' : 's'}.
                Baixe o relatório para detalhes e corrija a planilha para tentar novamente.
              </p>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
