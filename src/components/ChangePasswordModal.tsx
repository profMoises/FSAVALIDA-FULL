import { useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { Modal } from '@/components/Modal';
import { BTN_PRIMARY, BTN_SECONDARY, INPUT, LABEL } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { mensagemDeErro } from '@/lib/domain';
import { mensagemDeSenhaFraca } from '@/lib/senha';

type ChangePasswordModalProps = {
  email: string;
  onFechar: () => void;
};

export function ChangePasswordModal({ email, onFechar }: ChangePasswordModalProps) {
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [concluido, setConcluido] = useState(false);

  const salvar = async (evento: FormEvent) => {
    evento.preventDefault();
    setErro(null);

    const senhaFraca = mensagemDeSenhaFraca(novaSenha);
    if (senhaFraca) {
      setErro(senhaFraca);
      return;
    }
    if (novaSenha !== confirmacao) {
      setErro('A confirmação não é igual à nova senha.');
      return;
    }

    setSalvando(true);
    try {
      const { error: erroLogin } = await supabase.auth.signInWithPassword({ email, password: senhaAtual });
      if (erroLogin) {
        setErro('A senha atual está incorreta.');
        return;
      }

      const { error: erroAtualizacao } = await supabase.auth.updateUser({ password: novaSenha });
      if (erroAtualizacao) {
        setErro(
          erroAtualizacao.message.toLowerCase().includes('different')
            ? 'A nova senha deve ser diferente da senha atual.'
            : 'Não foi possível alterar a senha. Tente novamente.',
        );
        return;
      }
      setConcluido(true);
    } catch (erroInesperado) {
      setErro(mensagemDeErro(erroInesperado, 'Não foi possível alterar a senha. Tente novamente.'));
    } finally {
      setSalvando(false);
    }
  };

  if (concluido) {
    return (
      <Modal
        titulo="Senha alterada"
        onFechar={onFechar}
        rodape={
          <button type="button" onClick={onFechar} className={BTN_PRIMARY}>
            Fechar
          </button>
        }
      >
        <p className="text-sm text-slate-600">Sua nova senha já está valendo. Use-a nos próximos acessos.</p>
      </Modal>
    );
  }

  return (
    <Modal
      titulo="Alterar senha"
      descricao="Confirme a senha atual e escolha uma nova."
      onFechar={onFechar}
      rodape={
        <>
          <button type="button" onClick={onFechar} className={BTN_SECONDARY}>
            Cancelar
          </button>
          <button type="submit" form="form-senha" disabled={salvando} className={BTN_PRIMARY}>
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar nova senha
          </button>
        </>
      }
    >
      <form id="form-senha" onSubmit={salvar} className="space-y-4">
        <div>
          <label htmlFor="senha-atual" className={LABEL}>
            Senha atual
          </label>
          <input
            id="senha-atual"
            type="password"
            autoComplete="current-password"
            required
            value={senhaAtual}
            onChange={(e) => setSenhaAtual(e.target.value)}
            className={INPUT}
          />
        </div>
        <div>
          <label htmlFor="nova-senha" className={LABEL}>
            Nova senha
          </label>
          <input
            id="nova-senha"
            type="password"
            autoComplete="new-password"
            required
            value={novaSenha}
            onChange={(e) => setNovaSenha(e.target.value)}
            className={INPUT}
          />
          <p className="mt-1.5 text-xs text-slate-500">
            Use 8 ou mais caracteres, com letra maiúscula, minúscula, número e símbolo.
          </p>
        </div>
        <div>
          <label htmlFor="confirmar-senha" className={LABEL}>
            Confirme a nova senha
          </label>
          <input
            id="confirmar-senha"
            type="password"
            autoComplete="new-password"
            required
            value={confirmacao}
            onChange={(e) => setConfirmacao(e.target.value)}
            className={INPUT}
          />
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
