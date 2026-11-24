import { useState, type FormEvent } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { Modal } from '@/components/Modal';
import { BTN_PRIMARY, INPUT, LABEL } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { mensagemDeErro } from '@/lib/domain';
import { REQUISITOS_SENHA, mensagemDeSenhaFraca } from '@/lib/senha';

type TrocaSenhaObrigatoriaModalProps = {
  userId: string;
  email: string;
  onConcluido: () => void;
};

export function TrocaSenhaObrigatoriaModal({ userId, email, onConcluido }: TrocaSenhaObrigatoriaModalProps) {
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

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
      const { error: erroAtualizacao } = await supabase.auth.updateUser({ password: novaSenha });
      if (erroAtualizacao) {
        setErro('Não foi possível alterar a senha. Tente novamente.');
        return;
      }

      const { error: erroPerfil } = await supabase
        .from('profiles')
        .update({ primeiro_acesso: false })
        .eq('id', userId);

      if (erroPerfil) {
        setErro('Senha atualizada, mas houve falha ao registrar. Contate o suporte.');
        return;
      }

      onConcluido();
    } catch (erroInesperado) {
      setErro(mensagemDeErro(erroInesperado, 'Não foi possível alterar a senha. Tente novamente.'));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal
      titulo="Troca de senha obrigatória"
      descricao="Você está acessando o sistema pela primeira vez. Defina uma nova senha para continuar."
      largura="md"
      rodape={
        <button type="submit" form="form-troca-obrigatoria" disabled={salvando} className={BTN_PRIMARY}>
          {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
          Salvar nova senha
        </button>
      }
    >
      <form id="form-troca-obrigatoria" onSubmit={salvar} className="space-y-5">
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <p className="text-sm font-semibold text-amber-900">Sua senha precisa conter:</p>
              <ul className="mt-1.5 space-y-0.5 text-sm text-amber-800">
                {REQUISITOS_SENHA.map((req) => (
                  <li key={req} className="flex items-center gap-1.5">
                    <span className="text-amber-500">&#8226;</span>
                    {req}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div>
          <label htmlFor="email-troca" className={LABEL}>
            E-mail
          </label>
          <input
            id="email-troca"
            type="email"
            value={email}
            disabled
            className={`${INPUT} cursor-not-allowed bg-slate-100 text-slate-500`}
          />
        </div>

        <div>
          <label htmlFor="nova-senha-obrigatoria" className={LABEL}>
            Nova senha
          </label>
          <input
            id="nova-senha-obrigatoria"
            type="password"
            autoComplete="new-password"
            required
            value={novaSenha}
            onChange={(e) => setNovaSenha(e.target.value)}
            className={INPUT}
          />
        </div>

        <div>
          <label htmlFor="confirmar-senha-obrigatoria" className={LABEL}>
            Confirme a nova senha
          </label>
          <input
            id="confirmar-senha-obrigatoria"
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
