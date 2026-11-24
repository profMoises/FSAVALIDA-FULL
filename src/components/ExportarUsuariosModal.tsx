import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { Modal } from '@/components/Modal';
import { BTN_PRIMARY, BTN_SECONDARY, LABEL } from '@/components/ui';
import { exportarUsuarios } from '@/lib/import-export-usuarios';
import { mensagemDeErro } from '@/lib/domain';
import type { Perfil } from '@/lib/domain';

const PERFIL_LABEL_FILTRO: Record<Perfil | 'todos', string> = {
  todos: 'Todos os usuários',
  docente: 'Docentes',
  coordenacao: 'Coordenação técnica',
  pedagogia: 'Pedagogia (NEP)',
  admin: 'Administradores',
};

export function ExportarUsuariosModal({ onFechar }: { onFechar: () => void }) {
  const [perfil, setPerfil] = useState<Perfil | 'todos'>('docente');
  const [formato, setFormato] = useState<'xlsx' | 'csv'>('xlsx');
  const [exportando, setExportando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const exportar = async () => {
    setExportando(true);
    setErro(null);
    try {
      await exportarUsuarios(perfil, formato);
      onFechar();
    } catch (e) {
      setErro(mensagemDeErro(e, 'Não foi possível exportar os usuários.'));
    } finally {
      setExportando(false);
    }
  };

  return (
    <Modal
      titulo="Exportar usuários"
      descricao="Baixe a relação de usuários cadastrados em Excel ou CSV."
      onFechar={onFechar}
      largura="md"
      rodape={
        <>
          <button type="button" onClick={onFechar} className={BTN_SECONDARY}>
            Cancelar
          </button>
          <button type="button" onClick={exportar} disabled={exportando} className={BTN_PRIMARY}>
            {exportando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Exportar
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className={LABEL}>Filtrar por perfil</label>
          <select
            value={perfil}
            onChange={(e) => setPerfil(e.target.value as Perfil | 'todos')}
            className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 transition focus:border-teal-600 focus:outline-none focus:ring-4 focus:ring-teal-600/15"
          >
            {(Object.keys(PERFIL_LABEL_FILTRO) as (Perfil | 'todos')[]).map((key) => (
              <option key={key} value={key}>
                {PERFIL_LABEL_FILTRO[key]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={LABEL}>Formato do arquivo</label>
          <div className="flex gap-3">
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm text-slate-700 transition hover:bg-slate-50">
              <input
                type="radio"
                name="formato-export"
                value="xlsx"
                checked={formato === 'xlsx'}
                onChange={() => setFormato('xlsx')}
                className="text-teal-600 focus:ring-teal-500"
              />
              Excel (.xlsx)
            </label>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm text-slate-700 transition hover:bg-slate-50">
              <input
                type="radio"
                name="formato-export"
                value="csv"
                checked={formato === 'csv'}
                onChange={() => setFormato('csv')}
                className="text-teal-600 focus:ring-teal-500"
              />
              CSV (.csv)
            </label>
          </div>
        </div>

        <div className="rounded-lg bg-slate-50 px-4 py-3 text-xs text-slate-500">
          <p>A exportação inclui: Nome, E-mail, Perfil, Cursos vinculados (separados por ponto e vírgula), Data de cadastro e Último acesso.</p>
          <p className="mt-1">A coluna Cursos no formato .xlsx pode ser usada como base para nova importação — basta adicionar a coluna Senha.</p>
        </div>

        {erro && <p className="text-sm text-red-600">{erro}</p>}
      </div>
    </Modal>
  );
}
